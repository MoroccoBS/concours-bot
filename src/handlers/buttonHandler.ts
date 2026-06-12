import type {
  ButtonInteraction,
  StringSelectMenuInteraction,
} from "discord.js";
import { pollStore } from "../store/pollStore";
import { buildVoteSelect } from "../utils/buttons";
import { buildQcmEmbed } from "../utils/embeds";

export async function handleButton(interaction: ButtonInteraction) {
  const parts = interaction.customId.split(":");
  const action = parts[0];

  // Legacy vote buttons were replaced by the multi-select menu.
  if (action === "vote") {
    await interaction.reply({
      content:
        "Utilise le menu déroulant du QCM pour choisir une ou plusieurs réponses.",
      flags: ["Ephemeral"],
    });
    return;
  }

  // ── Disabled "done" buttons (post-reveal) — nothing to do ──────────────────
  if (action === "done") {
    await interaction.reply({
      content: "⏰ Le vote est terminé.",
      flags: ["Ephemeral"],
    });
    return;
  }

  // Unknown button
  await interaction.reply({
    content: "❓ Action inconnue.",
    flags: ["Ephemeral"],
  });
}

export async function handleVoteSelect(
  interaction: StringSelectMenuInteraction,
) {
  const parts = interaction.customId.split(":");
  const action = parts[0];

  if (action !== "vote") {
    await interaction.reply({
      content: "❓ Action inconnue.",
      flags: ["Ephemeral"],
    });
    return;
  }

  const channelId = parts[1];
  const poll = pollStore.get(channelId);

  if (!poll) {
    await interaction.reply({
      content: "❌ Ce QCM n'est plus actif.",
      flags: ["Ephemeral"],
    });
    return;
  }

  if (poll.revealed) {
    await interaction.reply({
      content: "⏰ Le vote est déjà terminé.",
      flags: ["Ephemeral"],
    });
    return;
  }

  const selected = [...interaction.values].sort();
  const previous = poll.votes.get(interaction.user.id);
  poll.votes.set(interaction.user.id, selected);

  await interaction.update({
    embeds: [buildQcmEmbed(poll)],
    components: buildVoteSelect(poll.options, channelId),
  });

  const chosen = selected.join(" + ");
  const message = previous
    ? `🔄 Vote changé : **${previous.join(" + ")}** → **${chosen}**`
    : `✅ Vote enregistré : **${chosen}**`;

  const confirmation = await interaction.followUp({
    content: message,
    flags: ["Ephemeral"],
  });
  const deleteAfter = Math.max(poll.endsAt - Date.now(), 1_000);

  setTimeout(() => {
    confirmation.delete().catch(() => undefined);
  }, deleteAfter);
}
