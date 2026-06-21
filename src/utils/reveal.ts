import type { Client } from "discord.js";
import { concoursScoreStore } from "../store/concoursScoreStore";
import { pollStore } from "../store/pollStore";
import { buildRevealEmbed } from "./embeds";
import { calculateRelativeScore } from "./scoring";

/**
 * Reveals the active poll in `channelId`.
 * Edits the original message with results and disables buttons.
 * Updates concours scores if the poll came from a selected concours.
 *
 * Returns true if a poll was successfully revealed, false otherwise.
 */
export async function doReveal(
  channelId: string,
  client: Client,
): Promise<boolean> {
  const poll = pollStore.get(channelId);
  if (!poll || poll.revealed) return false;

  // Mark revealed immediately to prevent double-triggers
  poll.revealed = true;
  pollStore.clearTimer(channelId);

  // Fetch channel
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased() || !("messages" in channel)) {
    pollStore.delete(channelId);
    return false;
  }

  // Fetch the original poll message
  const message = await channel.messages
    .fetch(poll.messageId)
    .catch((): null => null);
  if (!message) {
    pollStore.delete(channelId);
    return false;
  }

  // Resolve display names for everyone who voted
  const userNames = new Map<string, string>();
  for (const userId of poll.votes.keys()) {
    const member =
      "guild" in channel
        ? await channel.guild.members.fetch(userId).catch((): null => null)
        : null;
    userNames.set(userId, member?.displayName ?? `<@${userId}>`);
  }

  // Edit original message with the final result embed and remove controls.
  const revealEmbed = buildRevealEmbed(poll, userNames);
  await message.edit({ embeds: [revealEmbed], components: [] });

  // Update concours scores
  if (poll.bankId && poll.correctAnswers?.length) {
    try {
      await Promise.all(
        [...poll.votes.entries()].map(([userId, letters]) =>
          concoursScoreStore.addResult(
            channelId,
            poll.bankId!,
            userId,
            calculateRelativeScore(letters, poll.correctAnswers!),
          ),
        ),
      );
    } catch (error) {
      console.error("Failed to update concours scores:", error);
    }
  }

  pollStore.delete(channelId);
  return true;
}
