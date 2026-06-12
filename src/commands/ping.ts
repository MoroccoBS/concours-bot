import {
  type ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";

export const pingCommand = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Vérifie que le bot est en ligne"),

  async execute(interaction: ChatInputCommandInteraction) {
    const latency = Date.now() - interaction.createdTimestamp;
    await interaction.reply({
      content: `🏓 Pong ! Latence : **${latency}ms** | WebSocket : **${interaction.client.ws.ping}ms**`,
      flags: ["Ephemeral"],
    });
  },
};
