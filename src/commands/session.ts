import {
  type ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { pollStore } from "../store/pollStore";
import { sessionStore } from "../store/sessionStore";
import { buildLeaderboardEmbed } from "../utils/embeds";

export const sessionCommand = {
  data: new SlashCommandBuilder()
    .setName("session")
    .setDescription("Gère une session de QCM avec suivi des scores")
    .addSubcommand((sub) =>
      sub
        .setName("start")
        .setDescription("Démarre une nouvelle session")
        .addIntegerOption((o) =>
          o
            .setName("questions")
            .setDescription("Nombre total de questions prévues")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(100),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("scores")
        .setDescription("Affiche le classement actuel de la session en cours"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("end")
        .setDescription("Termine la session et affiche le classement final"),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "❌ Serveur requis.",
        flags: ["Ephemeral"],
      });
      return;
    }

    const sub = interaction.options.getSubcommand();

    // ── /session start ────────────────────────────────────────────────────────
    if (sub === "start") {
      const existing = sessionStore.get(interaction.channelId);
      if (existing?.active) {
        await interaction.reply({
          content: `⚠️ Une session est déjà active dans ce salon (${existing.currentQuestion}/${existing.totalQuestions} questions). Utilisez \`/session end\` pour la terminer.`,
          flags: ["Ephemeral"],
        });
        return;
      }

      const total = interaction.options.getInteger("questions", true);
      const session = sessionStore.create(
        interaction.channelId,
        interaction.user.id,
        total,
      );

      await interaction.reply({
        embeds: [
          {
            color: 0x5865f2,
            title: "🎯 Nouvelle session démarrée !",
            description: [
              `**${total} questions** prévues dans cette session.`,
              "",
              "Utilisez `/qcm` pour poster chaque question.",
              "Les scores sont calculés automatiquement à chaque correction.",
              "",
              `\`/session scores\` → classement en cours`,
              `\`/session end\` → classement final`,
            ].join("\n"),
            footer: { text: `Session ID: ${session.id.slice(0, 8)}` },
          },
        ],
      });
      return;
    }

    // ── /session scores ───────────────────────────────────────────────────────
    if (sub === "scores") {
      const session = sessionStore.get(interaction.channelId);
      if (!session?.active) {
        await interaction.reply({
          content: "❌ Aucune session active dans ce salon.",
          flags: ["Ephemeral"],
        });
        return;
      }

      await interaction.deferReply();

      const userNames = await resolveNames(session.scores, interaction);
      const embed = buildLeaderboardEmbed(session, userNames, false);
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // ── /session end ──────────────────────────────────────────────────────────
    if (sub === "end") {
      const session = sessionStore.get(interaction.channelId);
      if (!session?.active) {
        await interaction.reply({
          content: "❌ Aucune session active dans ce salon.",
          flags: ["Ephemeral"],
        });
        return;
      }

      // If there's still an active poll, warn
      const activePoll = pollStore.get(interaction.channelId);
      if (activePoll && !activePoll.revealed) {
        await interaction.reply({
          content:
            "⚠️ Il y a encore un QCM actif. Utilisez `/reveal` d'abord, puis re-essayez.",
          flags: ["Ephemeral"],
        });
        return;
      }

      session.active = false;
      await interaction.deferReply();

      const userNames = await resolveNames(session.scores, interaction);
      const embed = buildLeaderboardEmbed(session, userNames, true);
      await interaction.editReply({ embeds: [embed] });

      sessionStore.delete(interaction.channelId);
    }
  },
};

/** Fetch guild display names for all scored users */
async function resolveNames(
  scores: Map<string, number>,
  interaction: ChatInputCommandInteraction,
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  for (const userId of scores.keys()) {
    const member = await interaction.guild?.members
      .fetch(userId)
      .catch(() => null);
    names.set(userId, member?.displayName ?? `<@${userId}>`);
  }
  return names;
}
