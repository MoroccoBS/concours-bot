import {
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { pollStore } from "../store/pollStore";
import { questionBankStore } from "../store/questionBankStore";
import type { Poll, PollOption, QuestionBank } from "../types";
import { buildVoteSelect } from "../utils/buttons";
import { buildQcmEmbed } from "../utils/embeds";

const DEFAULT_DURATION = 60;

export const concoursCommand = {
  data: new SlashCommandBuilder()
    .setName("concours")
    .setDescription("Utilise les QCM importes depuis les PDFs de concours")
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("Liste les concours importes"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("select")
        .setDescription("Choisit le concours a travailler dans ce salon")
        .addStringOption((o) =>
          o
            .setName("bank")
            .setDescription("Concours importe")
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("next")
        .setDescription("Poste la prochaine question du concours choisi")
        .addIntegerOption((o) =>
          o
            .setName("duration")
            .setDescription("Duree du vote en secondes (defaut: 60)")
            .setMinValue(10)
            .setMaxValue(300)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("status")
        .setDescription("Affiche le concours choisi et la progression"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("reset")
        .setDescription("Oublie le concours choisi dans ce salon"),
    ),

  async autocomplete(interaction: AutocompleteInteraction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const choices = questionBankStore
      .list()
      .filter((bank) =>
        `${questionBankStore.label(bank)} ${bank.id}`
          .toLowerCase()
          .includes(focused),
      )
      .slice(0, 25)
      .map((bank) => ({
        name: truncateChoice(questionBankStore.label(bank)),
        value: bank.id,
      }));

    await interaction.respond(choices);
  },

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "❌ Serveur requis.",
        flags: ["Ephemeral"],
      });
      return;
    }

    const sub = interaction.options.getSubcommand();

    if (sub === "list") {
      await replyWithBankList(interaction);
      return;
    }

    if (sub === "select") {
      const bankId = interaction.options.getString("bank", true);
      const bank = questionBankStore.get(bankId);
      if (!bank) {
        await interaction.reply({
          content:
            "❌ Concours introuvable. Utilise `/concours list` pour voir les banques disponibles.",
          flags: ["Ephemeral"],
        });
        return;
      }

      questionBankStore.select(interaction.channelId, bank.id);
      await interaction.reply({
        embeds: [
          {
            color: 0x5865f2,
            title: "Concours selectionne",
            description: [
              `**${questionBankStore.label(bank)}**`,
              `${bank.questions.length} questions disponibles.`,
              "",
              "Utilise `/concours next` pour poster la premiere question.",
            ].join("\n"),
          },
        ],
      });
      return;
    }

    if (sub === "next") {
      await postNextQuestion(interaction);
      return;
    }

    if (sub === "status") {
      await replyWithStatus(interaction);
      return;
    }

    if (sub === "reset") {
      const didReset = questionBankStore.reset(interaction.channelId);
      await interaction.reply({
        content: didReset
          ? "✅ Progression du salon reinitialisee."
          : "ℹ️ Aucun concours n'etait selectionne dans ce salon.",
        flags: ["Ephemeral"],
      });
    }
  },
};

async function replyWithBankList(interaction: ChatInputCommandInteraction) {
  const banks = questionBankStore.list();
  if (banks.length === 0) {
    await interaction.reply({
      content:
        "❌ Aucune banque trouvee dans `data/question-banks`. Lance d'abord `bun run extract:qcm -- concours/<fichier>.pdf`.",
      flags: ["Ephemeral"],
    });
    return;
  }

  await interaction.reply({
    embeds: [
      {
        color: 0x5865f2,
        title: "Concours importes",
        description: banks
          .map(
            (bank, index) =>
              `**${index + 1}. ${bank.sourceFile}**\n` +
              `ID: \`${bank.id}\` - ${bank.questions.length} questions`,
          )
          .join("\n\n"),
      },
    ],
    flags: ["Ephemeral"],
  });
}

async function replyWithStatus(interaction: ChatInputCommandInteraction) {
  const progress = questionBankStore.getProgress(interaction.channelId);
  const allProgress = questionBankStore.listProgress(interaction.channelId);
  if (!progress) {
    const history = formatProgressHistory(allProgress);
    await interaction.reply({
      content: [
        "ℹ️ Aucun concours selectionne dans ce salon. Utilise `/concours select`.",
        history ? `\nProgression connue:\n${history}` : "",
      ].join(""),
      flags: ["Ephemeral"],
    });
    return;
  }

  const bank = questionBankStore.get(progress.bankId);
  if (!bank) {
    await interaction.reply({
      content:
        "⚠️ La progression existe, mais la banque JSON n'est plus disponible.",
      flags: ["Ephemeral"],
    });
    return;
  }

  await interaction.reply({
    embeds: [
      {
        color: 0xfee75c,
        title: "Progression concours",
        description: [
          formatStatus(bank, progress.covered),
          formatProgressHistory(allProgress, progress.bankId),
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
    flags: ["Ephemeral"],
  });
}

async function postNextQuestion(interaction: ChatInputCommandInteraction) {
  const existing = pollStore.get(interaction.channelId);
  if (existing && !existing.revealed) {
    await interaction.reply({
      content:
        "⚠️ Il y a deja un QCM actif dans ce salon. Utilise `/reveal` avant de passer a la question suivante.",
      flags: ["Ephemeral"],
    });
    return;
  }

  const progress = questionBankStore.getProgress(interaction.channelId);
  if (!progress) {
    await interaction.reply({
      content:
        "❌ Aucun concours selectionne. Utilise `/concours list`, puis `/concours select`.",
      flags: ["Ephemeral"],
    });
    return;
  }

  const bank = questionBankStore.get(progress.bankId);
  if (!bank) {
    await interaction.reply({
      content:
        "⚠️ La banque selectionnee n'existe plus. Utilise `/concours select` pour en choisir une autre.",
      flags: ["Ephemeral"],
    });
    return;
  }

  const question = bank.questions[progress.nextIndex];
  if (!question) {
    await interaction.reply({
      embeds: [
        {
          color: 0x57f287,
          title: "Concours termine",
          description: formatStatus(bank, progress.covered),
        },
      ],
    });
    return;
  }

  const duration =
    interaction.options.getInteger("duration") ?? DEFAULT_DURATION;
  const options: PollOption[] = question.options.map((option) => ({
    letter: option.letter,
    text: option.text,
  }));
  const endsAt = Date.now() + duration * 1000;

  const poll: Poll = {
    messageId: "",
    channelId: interaction.channelId,
    guildId: interaction.guildId ?? "",
    question: question.text,
    options,
    correctAnswers: question.correctAnswers?.length
      ? question.correctAnswers
      : undefined,
    votes: new Map(),
    creatorId: interaction.user.id,
    endsAt,
    revealed: false,
    questionNumber: question.number,
  };

  const reply = await interaction.reply({
    embeds: [buildQcmEmbed(poll)],
    components: buildVoteSelect(options, interaction.channelId),
    fetchReply: true,
  });

  poll.messageId = reply.id;
  pollStore.set(interaction.channelId, poll);
  questionBankStore.advance(interaction.channelId);

  const timer = setTimeout(async () => {
    const { doReveal } = await import("../utils/reveal");
    await doReveal(interaction.channelId, interaction.client).catch((err) =>
      console.error("[concours:auto-reveal]", err),
    );
  }, duration * 1000);

  pollStore.setTimer(interaction.channelId, timer);
}

function formatStatus(bank: QuestionBank, covered: number): string {
  const total = bank.questions.length;
  const remaining = Math.max(total - covered, 0);

  return [
    `**${questionBankStore.label(bank)}**`,
    `Questions couvertes: **${Math.min(covered, total)}/${total}**`,
    `Restantes: **${remaining}**`,
    "",
    remaining > 0
      ? "Utilise `/concours next` pour continuer."
      : "Toutes les questions de ce concours ont ete postees.",
  ].join("\n");
}

function truncateChoice(text: string): string {
  return text.length > 100 ? `${text.slice(0, 97)}...` : text;
}

function formatProgressHistory(
  progresses: ReturnType<typeof questionBankStore.listProgress>,
  selectedBankId?: string,
): string {
  const rows = progresses
    .filter((progress) => progress.bankId !== selectedBankId)
    .map((progress) => {
      const bank = questionBankStore.get(progress.bankId);
      if (!bank) return undefined;
      const total = bank.questions.length;
      return `- ${questionBankStore.label(bank)}: ${Math.min(progress.covered, total)}/${total}`;
    })
    .filter(Boolean);

  return rows.length > 0 ? ["Autres concours suivis:", ...rows].join("\n") : "";
}
