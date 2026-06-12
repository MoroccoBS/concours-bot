import type { Client } from "discord.js";
import { pollStore } from "../store/pollStore";
import { sessionStore } from "../store/sessionStore";
import { buildRevealedButtons } from "./buttons";
import { buildRevealEmbed } from "./embeds";

/**
 * Reveals the active poll in `channelId`.
 * Edits the original message with results and disables buttons.
 * Updates session scores if a session is active.
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

  // Edit original message with reveal embed + disabled coloured buttons
  const revealEmbed = buildRevealEmbed(poll, userNames);
  const revealedButtons = buildRevealedButtons(
    poll.options,
    poll.correctAnswers,
    channelId,
  );
  await message.edit({ embeds: [revealEmbed], components: revealedButtons });

  // Update session scores
  if (poll.sessionId && poll.correctAnswers?.length) {
    const session = sessionStore.get(channelId);
    if (session?.active) {
      for (const [userId, letters] of poll.votes.entries()) {
        if (sameAnswers(letters, poll.correctAnswers)) {
          sessionStore.addScore(channelId, userId);
        }
      }
    }
  }

  pollStore.delete(channelId);
  return true;
}

function sameAnswers(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const expected = new Set(right);
  return left.every((letter) => expected.has(letter));
}
