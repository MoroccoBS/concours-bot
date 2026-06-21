import {
  type ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { pollStore } from "../store/pollStore";
import { parseAnswerLetters } from "../utils/scoring";

export const answerCommand = {
  data: new SlashCommandBuilder()
    .setName("answer")
    .setDescription("Ajoute ou remplace la correction du QCM actif")
    .addStringOption((o) =>
      o
        .setName("answers")
        .setDescription("Bonnes réponses, ex: A, AC, BCD")
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(9),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const poll = pollStore.get(interaction.channelId);

    if (!poll) {
      await interaction.reply({
        content: "❌ Aucun QCM actif dans ce salon.",
        flags: ["Ephemeral"],
      });
      return;
    }

    if (poll.revealed) {
      await interaction.reply({
        content: "⏰ Ce QCM a déjà été corrigé.",
        flags: ["Ephemeral"],
      });
      return;
    }

    const answers = parseAnswerLetters(
      interaction.options.getString("answers", true),
    );

    if (answers.length === 0) {
      await interaction.reply({
        content:
          "❌ Donne au moins une réponse entre A et D. Exemple: `/answer answers:AC`.",
        flags: ["Ephemeral"],
      });
      return;
    }

    poll.correctAnswers = answers;
    pollStore.set(interaction.channelId, poll);

    await interaction.reply({
      content: `✅ Correction enregistrée pour **${poll.question}** : **${answers.join(" + ")}**. Elle sera utilisée en priorité au prochain \`/reveal\`.`,
      flags: ["Ephemeral"],
    });
  },
};
