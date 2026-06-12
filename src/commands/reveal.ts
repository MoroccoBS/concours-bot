import {
  type ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { pollStore } from "../store/pollStore";
import { doReveal } from "../utils/reveal";

export const revealCommand = {
  data: new SlashCommandBuilder()
    .setName("reveal")
    .setDescription(
      "Révèle la bonne réponse du QCM actif avant la fin du timer",
    )
    .addBooleanOption((o) =>
      o
        .setName("a")
        .setDescription("Marquer A comme bonne réponse au moment de corriger")
        .setRequired(false),
    )
    .addBooleanOption((o) =>
      o
        .setName("b")
        .setDescription("Marquer B comme bonne réponse au moment de corriger")
        .setRequired(false),
    )
    .addBooleanOption((o) =>
      o
        .setName("c")
        .setDescription("Marquer C comme bonne réponse au moment de corriger")
        .setRequired(false),
    )
    .addBooleanOption((o) =>
      o
        .setName("d")
        .setDescription("Marquer D comme bonne réponse au moment de corriger")
        .setRequired(false),
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

    const correctionAnswers = ["A", "B", "C", "D"].filter(
      (letter) => interaction.options.getBoolean(letter.toLowerCase()) === true,
    );
    if (correctionAnswers.length > 0) {
      poll.correctAnswers = correctionAnswers;
    }

    // Acknowledge immediately so Discord doesn't time out
    await interaction.deferReply({ flags: ["Ephemeral"] });

    const ok = await doReveal(interaction.channelId, interaction.client);

    if (ok) {
      const revealedAnswers = poll.correctAnswers;
      await interaction.editReply(
        revealedAnswers?.length
          ? `✅ Correction publiée : **${revealedAnswers.join(" + ")}**`
          : "✅ Résultats publiés !",
      );
    } else {
      await interaction.editReply(
        "❌ Impossible de révéler — le message est introuvable.",
      );
    }
  },
};
