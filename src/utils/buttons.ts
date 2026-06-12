import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import type { PollOption } from "../types";

const EMOJI: Record<string, string> = {
  A: "🇦",
  B: "🇧",
  C: "🇨",
  D: "🇩",
};

/**
 * Active vote select — customId: `vote:{channelId}`
 * Using channelId as the poll key (one poll per channel).
 */
export function buildVoteSelect(
  options: PollOption[],
  channelId: string,
): ActionRowBuilder<StringSelectMenuBuilder>[] {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`vote:${channelId}`)
    .setPlaceholder("Choisis une ou plusieurs réponses")
    .setMinValues(1)
    .setMaxValues(options.length)
    .addOptions(
      options.map((o) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(o.letter)
          .setDescription(o.text)
          .setEmoji(EMOJI[o.letter] ?? o.letter)
          .setValue(o.letter),
      ),
    );

  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
  ];
}

/**
 * Post-reveal buttons — disabled, green for correct, red for wrong.
 */
export function buildRevealedButtons(
  options: PollOption[],
  correctAnswers: string[] | undefined,
  channelId: string,
): ActionRowBuilder<ButtonBuilder>[] {
  const correct = new Set(correctAnswers ?? []);
  const hasCorrection = correct.size > 0;
  const buttons = options.map((o) =>
    new ButtonBuilder()
      .setCustomId(`done:${channelId}:${o.letter}`) // customId still needed even when disabled
      .setLabel(o.letter)
      .setEmoji(EMOJI[o.letter] ?? o.letter)
      .setStyle(
        hasCorrection
          ? correct.has(o.letter)
            ? ButtonStyle.Success
            : ButtonStyle.Danger
          : ButtonStyle.Secondary,
      )
      .setDisabled(true),
  );
  return chunkIntoRows(buttons);
}

/** Split button array into rows of ≤5 (Discord limit) */
function chunkIntoRows(
  buttons: ButtonBuilder[],
): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        buttons.slice(i, i + 5),
      ),
    );
  }
  return rows;
}
