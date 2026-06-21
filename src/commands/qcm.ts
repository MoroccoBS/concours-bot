import {
  type ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { pollStore } from "../store/pollStore";
import type { Poll, PollOption } from "../types";
import { buildVoteSelect } from "../utils/buttons";
import { buildQcmEmbed } from "../utils/embeds";
import { doReveal } from "../utils/reveal";

export const qcmCommand = {
  data: new SlashCommandBuilder()
    .setName("qcm")
    .setDescription("Crée un QCM avec les options A/B/C/D")
    .addStringOption((o) =>
      o
        .setName("question")
        .setDescription("Énoncé de la question (facultatif)")
        .setRequired(false),
    )
    .addIntegerOption((o) =>
      o
        .setName("number")
        .setDescription("Numéro de la question si tu n'as pas l'énoncé")
        .setMinValue(1)
        .setMaxValue(999)
        .setRequired(false),
    )
    .addBooleanOption((o) =>
      o
        .setName("a")
        .setDescription("Marquer A comme bonne réponse")
        .setRequired(false),
    )
    .addBooleanOption((o) =>
      o
        .setName("b")
        .setDescription("Marquer B comme bonne réponse")
        .setRequired(false),
    )
    .addBooleanOption((o) =>
      o
        .setName("c")
        .setDescription("Marquer C comme bonne réponse")
        .setRequired(false),
    )
    .addBooleanOption((o) =>
      o
        .setName("d")
        .setDescription("Marquer D comme bonne réponse")
        .setRequired(false),
    )
    .addIntegerOption((o) =>
      o
        .setName("duration")
        .setDescription("Durée du vote en secondes (défaut: 60)")
        .setMinValue(10)
        .setMaxValue(300)
        .setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "❌ Ce bot fonctionne uniquement dans les serveurs Discord.",
        flags: ["Ephemeral"],
      });
      return;
    }

    // Block if a poll is already running in this channel
    const existing = pollStore.get(interaction.channelId);
    if (existing && !existing.revealed) {
      await interaction.reply({
        content:
          "⚠️ Il y a déjà un QCM actif dans ce salon. Utilisez `/reveal` pour le terminer d'abord.",
        flags: ["Ephemeral"],
      });
      return;
    }

    const questionInput = interaction.options.getString("question");
    const manualQuestionNumber = interaction.options.getInteger("number");
    const correctAnswers = ["A", "B", "C", "D"].filter(
      (letter) => interaction.options.getBoolean(letter.toLowerCase()) === true,
    );
    const duration = interaction.options.getInteger("duration") ?? 30;

    const options: PollOption[] = [
      { letter: "A", text: "Option A" },
      { letter: "B", text: "Option B" },
      { letter: "C", text: "Option C" },
      { letter: "D", text: "Option D" },
    ];

    let questionNumber: number;

    if (manualQuestionNumber) {
      questionNumber = manualQuestionNumber;
      pollStore.rememberQuestionNumber(
        interaction.channelId,
        manualQuestionNumber,
      );
    } else {
      questionNumber = pollStore.nextQuestionNumber(interaction.channelId);
    }

    const question = questionInput ?? `Question #${questionNumber}`;

    const endsAt = Date.now() + duration * 1000;

    const poll: Poll = {
      messageId: "",
      channelId: interaction.channelId,
      guildId: interaction.guildId,
      question,
      options,
      correctAnswers: correctAnswers.length > 0 ? correctAnswers : undefined,
      votes: new Map(),
      creatorId: interaction.user.id,
      endsAt,
      revealed: false,
      questionNumber,
    };

    const embed = buildQcmEmbed(poll);
    const components = buildVoteSelect(options, interaction.channelId);

    const reply = await interaction.reply({
      embeds: [embed],
      components,
      fetchReply: true,
    });

    poll.messageId = reply.id;
    pollStore.set(interaction.channelId, poll);

    // Auto-reveal when timer fires
    const client = interaction.client;
    const timer = setTimeout(async () => {
      try {
        await doReveal(interaction.channelId, client);
      } catch (err) {
        console.error("[auto-reveal]", err);
      }
    }, duration * 1000);

    pollStore.setTimer(interaction.channelId, timer);
  },
};
