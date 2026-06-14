import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
} from "discord.js";
import { commandMap } from "../commands";

type AutocompleteCommand = {
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
};

export async function handleCommand(interaction: ChatInputCommandInteraction) {
  const command = commandMap.get(interaction.commandName);

  if (!command) {
    console.warn(`[command] Unknown command: ${interaction.commandName}`);
    await interaction.reply({
      content: "❌ Commande inconnue.",
      flags: ["Ephemeral"],
    });
    return;
  }

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`[command:${interaction.commandName}]`, err);
    const msg =
      "❌ Une erreur s'est produite lors de l'exécution de la commande.";
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: msg, flags: ["Ephemeral"] });
    } else {
      await interaction.reply({ content: msg, flags: ["Ephemeral"] });
    }
  }
}

export async function handleAutocomplete(interaction: AutocompleteInteraction) {
  const command = commandMap.get(interaction.commandName) as
    | AutocompleteCommand
    | undefined;

  if (!command?.autocomplete) {
    await interaction.respond([]);
    return;
  }

  try {
    await command.autocomplete(interaction);
  } catch (err) {
    console.error(`[autocomplete:${interaction.commandName}]`, err);
    await interaction.respond([]).catch(() => undefined);
  }
}
