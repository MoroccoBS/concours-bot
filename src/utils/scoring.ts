export function calculateRelativeScore(
  selectedAnswers: string[],
  correctAnswers: string[],
): number {
  if (correctAnswers.length === 0 || selectedAnswers.length === 0) return 0;

  const correct = new Set(correctAnswers);
  const selected = new Set(selectedAnswers);

  for (const letter of selected) {
    if (!correct.has(letter)) return 0;
  }

  let matched = 0;
  for (const letter of selected) {
    if (correct.has(letter)) matched++;
  }

  return matched / correct.size;
}

export function sameAnswers(left: string[], right: string[]): boolean {
  return (
    calculateRelativeScore(left, right) === 1 && left.length === right.length
  );
}

export function parseAnswerLetters(input: string): string[] {
  const letters = input
    .toUpperCase()
    .replace(/[^A-D]/g, "")
    .split("");

  return [...new Set(letters)].sort();
}

export function formatScore(score: number): string {
  if (!Number.isFinite(score)) return "0";
  return Number.isInteger(score)
    ? String(score)
    : score.toFixed(2).replace(/0$/, "");
}
