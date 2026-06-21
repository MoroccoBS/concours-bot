import { EmbedBuilder } from "discord.js";
import type { Poll } from "../types";
import {
  calculateRelativeScore,
  formatScore,
  sameAnswers,
} from "./scoring";

const COLORS = {
  active: 0x2f80ed,
  blind: 0x9b51e0,
  success: 0x27ae60,
  results: 0x00a8cc,
};

const OPTION_BADGES: Record<string, string> = {
  A: "🇦",
  B: "🇧",
  C: "🇨",
  D: "🇩",
  E: "🇪",
};

// ── Active poll embed (votes are hidden) ──────────────────────────────────────
export function buildQcmEmbed(poll: Poll): EmbedBuilder {
  const optionLines = poll.options
    .map((o) => `${OPTION_BADGES[o.letter] ?? "▫️"}  **${o.letter}.** ${o.text}`)
    .join("\n\n");

  const label = poll.questionNumber
    ? `Question #${poll.questionNumber}`
    : "QCM Concours";

  const deadline = `<t:${Math.floor(poll.endsAt / 1000)}:R>`;
  const voters = poll.votes.size;
  const mode = poll.correctAnswers?.length
    ? "Correction prête"
    : "Participation libre";

  return new EmbedBuilder()
    .setColor(poll.correctAnswers?.length ? COLORS.active : COLORS.blind)
    .setAuthor({ name: "Concours QCM" })
    .setTitle(`📝 ${label}`)
    .setDescription(
      [
        `### ${poll.question}`,
        "",
        optionLines,
        "",
        "━━━━━━━━━━━━━━━━━━━━",
        `⏱️ **Fin du vote** ${deadline}`,
        `🗳️ **${voters}** participant${voters !== 1 ? "s" : ""}`,
        `🔐 **${mode}**`,
      ].join("\n"),
    )
    .setFooter({
      text: "Choisis une ou plusieurs réponses. Ton dernier choix remplace le précédent.",
    });
}

// ── Post-reveal embed ─────────────────────────────────────────────────────────
export function buildRevealEmbed(
  poll: Poll,
  userNames: Map<string, string>,
): EmbedBuilder {
  const total = poll.votes.size;
  const hasCorrection = Boolean(poll.correctAnswers?.length);

  const correctAnswers = new Set(poll.correctAnswers ?? []);

  // Count selections per letter
  const voteCount = new Map<string, number>();
  for (const letters of poll.votes.values()) {
    for (const letter of letters) {
      voteCount.set(letter, (voteCount.get(letter) ?? 0) + 1);
    }
  }

  // Build option lines with bar chart
  const optionLines = poll.options
    .map((o) => {
      const count = voteCount.get(o.letter) ?? 0;
      const isCorrect = correctAnswers.has(o.letter);
      const icon = hasCorrection ? (isCorrect ? "✅" : "❌") : "📌";
      const filled = total > 0 ? Math.round((count / total) * 10) : 0;
      const bar = "▰".repeat(filled) + "▱".repeat(10 - filled);
      const percent = total > 0 ? Math.round((count / total) * 100) : 0;
      const correctTag = isCorrect ? "  **BONNE RÉPONSE**" : "";
      return [
        `${icon} ${OPTION_BADGES[o.letter] ?? ""} **${o.letter}.** ${o.text}${correctTag}`,
        `\`${bar}\`  **${count}** vote${count !== 1 ? "s" : ""}  ·  **${percent}%**`,
      ].join("\n");
    })
    .join("\n\n");

  // Who got it right / partially right / wrong
  const correct: string[] = [];
  const partial: string[] = [];
  const wrong: string[] = [];
  if (hasCorrection && poll.correctAnswers) {
    for (const [userId, letters] of poll.votes.entries()) {
      const name = userNames.get(userId) ?? `<@${userId}>`;
      const score = calculateRelativeScore(letters, poll.correctAnswers);
      if (sameAnswers(letters, poll.correctAnswers)) {
        correct.push(name);
      } else if (score > 0) {
        partial.push(`${name} (${formatScore(score)} pt)`);
      } else {
        wrong.push(name);
      }
    }
  }

  const questionLabel = poll.questionNumber
    ? `${hasCorrection ? "Correction" : "Résultats"} · Question #${poll.questionNumber}`
    : hasCorrection
      ? "Correction"
      : "Résultats";

  const embed = new EmbedBuilder()
    .setColor(hasCorrection ? COLORS.success : COLORS.results)
    .setAuthor({ name: "Concours QCM" })
    .setTitle(`${hasCorrection ? "📋" : "📊"} ${questionLabel}`)
    .setDescription(
      [
        `### ${poll.question}`,
        "",
        `🗳️ **${total}** participant${total !== 1 ? "s" : ""}`,
        hasCorrection
          ? `✅ Réponse attendue : **${formatAnswers(poll.correctAnswers ?? [])}**`
          : "📊 Résultats du vote",
        "",
        "━━━━━━━━━━━━━━━━━━━━",
        "",
        optionLines,
      ].join("\n"),
    );

  if (hasCorrection && total === 0 && poll.correctAnswers) {
    embed.addFields({
      name: "Aucun vote",
      value: `La bonne réponse était **${formatAnswers(poll.correctAnswers)}**`,
    });
  } else {
    if (correct.length > 0)
      embed.addFields({
        name: `✅ Correct (${correct.length})`,
        value: correct.join(", "),
        inline: true,
      });
    if (partial.length > 0)
      embed.addFields({
        name: `🟡 Partiel (${partial.length})`,
        value: partial.join(", "),
        inline: true,
      });
    if (wrong.length > 0)
      embed.addFields({
        name: `❌ Incorrect (${wrong.length})`,
        value: wrong.join(", "),
        inline: true,
      });
  }

  return embed;
}

function formatAnswers(answers: string[]): string {
  return answers.join(" + ");
}
