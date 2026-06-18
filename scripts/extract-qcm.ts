import { mkdir, writeFile } from "node:fs/promises";
import { basename, join, parse, resolve } from "node:path";
import {
  createPartFromUri,
  GoogleGenAI,
  ThinkingLevel,
  Type,
} from "@google/genai";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ExtractedQuestion = {
  number: number;
  text: string;
  options: {
    letter: "A" | "B" | "C" | "D" | "E";
    text: string;
  }[];
  correctAnswers?: ("A" | "B" | "C" | "D" | "E")[];
  pageStart?: number;
  pageEnd?: number;
  confidence: number;
  needsReview: boolean;
  reviewNotes?: string[];
};

type ExtractionResult = {
  sourceFile: string;
  examTitle?: string;
  specialty?: string;
  year?: number;
  language: "fr" | "ar" | "mixed" | "unknown";
  questions: ExtractedQuestion[];
  warnings?: string[];
};

/** Returned by the AI when a PDF contains multiple distinct exams. */
type MultiExamResult = {
  isCompilation: true;
  exams: ExtractionResult[];
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// const DEFAULT_MODEL = "gemini-3.5-flash";
const DEFAULT_MODEL = "gemini-3.1-flash-lite";
const outputDir = resolve("data", "question-banks");

// ---------------------------------------------------------------------------
// JSON Schemas sent to Gemini
// ---------------------------------------------------------------------------

/** Schema for a single exam result (used as a sub-schema too). */
const examSchema = {
  type: Type.OBJECT,
  required: ["sourceFile", "language", "questions"],
  properties: {
    sourceFile: { type: Type.STRING },
    examTitle: { type: Type.STRING, nullable: true },
    specialty: { type: Type.STRING, nullable: true },
    year: { type: Type.INTEGER, nullable: true },
    language: {
      type: Type.STRING,
      format: "enum",
      enum: ["fr", "ar", "mixed", "unknown"],
    },
    warnings: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["number", "text", "options", "confidence", "needsReview"],
        properties: {
          number: { type: Type.INTEGER },
          text: { type: Type.STRING },
          options: {
            type: Type.ARRAY,
            minItems: "4",
            maxItems: "5",
            items: {
              type: Type.OBJECT,
              required: ["letter", "text"],
              properties: {
                letter: {
                  type: Type.STRING,
                  format: "enum",
                  enum: ["A", "B", "C", "D", "E"],
                },
                text: { type: Type.STRING },
              },
            },
          },
          correctAnswers: {
            type: Type.ARRAY,
            nullable: true,
            items: {
              type: Type.STRING,
              format: "enum",
              enum: ["A", "B", "C", "D", "E"],
            },
          },
          pageStart: { type: Type.INTEGER, nullable: true },
          pageEnd: { type: Type.INTEGER, nullable: true },
          confidence: { type: Type.NUMBER },
          needsReview: { type: Type.BOOLEAN },
          reviewNotes: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
      },
    },
  },
};

/**
 * Top-level schema sent to the AI.
 * The AI always returns a MultiExamResult.
 * For single-exam PDFs it returns isCompilation=false and exams with one entry.
 */
const topLevelSchema = {
  type: Type.OBJECT,
  required: ["isCompilation", "exams"],
  properties: {
    isCompilation: { type: Type.BOOLEAN },
    exams: {
      type: Type.ARRAY,
      minItems: "1",
      items: examSchema,
    },
  },
};

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function usage(): never {
  console.error(
    "Usage: bun run extract:qcm -- <pdf-path> [--model gemini-2.5-flash] [--out data/question-banks/file.json]",
  );
  process.exit(1);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const pdfPath = args.find((arg) => !arg.startsWith("--"));
  if (!pdfPath) usage();

  const modelIndex = args.indexOf("--model");
  const outIndex = args.indexOf("--out");
  const model = modelIndex >= 0 ? args[modelIndex + 1] : DEFAULT_MODEL;
  const outPath = outIndex >= 0 ? args[outIndex + 1] : undefined;

  if (!model || model.startsWith("--")) usage();
  if (outIndex >= 0 && (!outPath || outPath.startsWith("--"))) usage();

  return {
    pdfPath: resolve(pdfPath),
    model,
    // outPath only applies for single-exam PDFs
    outPath: outPath ? resolve(outPath) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateResult(result: ExtractionResult): string[] {
  const warnings: string[] = [];
  const seen = new Set<number>();

  for (const question of result.questions) {
    if (seen.has(question.number)) {
      warnings.push(`Duplicate question number: ${question.number}`);
    }
    seen.add(question.number);

    const letters = question.options.map((option) => option.letter);
    for (const letter of ["A", "B", "C", "D"] as const) {
      if (!letters.includes(letter)) {
        warnings.push(`Q${question.number} is missing option ${letter}`);
      }
    }

    if (question.confidence < 0.8 && !question.needsReview) {
      warnings.push(
        `Q${question.number} has low confidence but is not marked for review`,
      );
    }
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// Output filename helpers
// ---------------------------------------------------------------------------

/**
 * Produce a filesystem-safe slug from an arbitrary string.
 * Keeps alphanumeric chars and hyphens, collapses runs of separators.
 */
function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[^\w\s-]/g, " ")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

/**
 * Build the output filename for one exam entry in a compilation.
 * We prefer year, then examTitle fragment, then a 1-based index.
 */
function compilationFileName(
  pdfBase: string,
  exam: ExtractionResult,
  index: number,
): string {
  const suffix =
    exam.year?.toString() ??
    (exam.examTitle ? slugify(exam.examTitle).slice(0, 40) : null) ??
    `part${index + 1}`;
  return `${pdfBase}_${suffix}.json`;
}

// ---------------------------------------------------------------------------
// Write helpers
// ---------------------------------------------------------------------------

async function writeBank(
  filePath: string,
  result: ExtractionResult,
): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(result, null, 2)}\n`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { pdfPath, model, outPath } = parseArgs();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY in the environment.");
  }

  const pdfName = basename(pdfPath);
  const pdfBase = parse(pdfPath).name;

  console.log(`Uploading ${pdfName}…`);
  const ai = new GoogleGenAI({ apiKey });
  const uploaded = await ai.files.upload({
    file: pdfPath,
    config: { mimeType: "application/pdf" },
  });

  if (!uploaded.uri || !uploaded.mimeType) {
    throw new Error("Gemini file upload did not return a usable URI.");
  }

  console.log(`Extracting with model ${model}…`);
  const response = await ai.models.generateContent({
    model,
    contents: [
      createPartFromUri(uploaded.uri, uploaded.mimeType),
      {
        text: [
          "You are extracting QCM exam questions from a PDF into structured JSON.",
          "",
          "IMPORTANT: First check whether the PDF is a COMPILATION that contains MULTIPLE",
          "distinct exams (e.g., different years, different sessions, or clearly separated",
          "exam blocks). If it is, set isCompilation=true and return one entry in 'exams'",
          "per distinct exam. If it is a single exam, set isCompilation=false and return",
          "exactly one entry in 'exams'.",
          "",
          "For each exam entry:",
          "- Keep the original French/Arabic medical wording. Do not translate.",
          "- Ignore headers, footers, instructions, phone numbers, logos, and answer-sheet boxes.",
          "- Questions are usually labelled Q1, Q2, etc. Options are usually A, B, C, D, sometimes E.",
          "- RESET question numbering to start from 1 for each distinct exam.",
          "- If the PDF does not contain an answer key, omit correctAnswers.",
          "- Use needsReview=true when text is uncertain, options are incomplete,",
          "  numbering jumps, or image quality is poor.",
          "- Set examTitle, specialty, and year when clearly visible in the document.",
          `- Set sourceFile to ${JSON.stringify(pdfName)} for every exam entry.`,
        ].join("\n"),
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: topLevelSchema,
      thinkingConfig: {
        thinkingLevel: ThinkingLevel.HIGH,
      },
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  const parsed = JSON.parse(text) as MultiExamResult;

  // -------------------------------------------------------------------------
  // Normalise: handle both compilation and single-exam responses uniformly
  // -------------------------------------------------------------------------
  const exams: ExtractionResult[] = parsed.exams ?? [];
  if (exams.length === 0) {
    throw new Error("Gemini returned no exam entries.");
  }

  const isCompilation = parsed.isCompilation && exams.length > 1;

  await mkdir(outputDir, { recursive: true });

  if (!isCompilation) {
    // -----------------------------------------------------------------------
    // Single exam — same behaviour as before
    // -----------------------------------------------------------------------
    const result = exams[0];
    const validationWarnings = validateResult(result);
    if (validationWarnings.length > 0) {
      result.warnings = [...(result.warnings ?? []), ...validationWarnings];
    }

    const destination = outPath ?? join(outputDir, `${pdfBase}.json`);
    await writeBank(destination, result);

    console.log(
      `✅ Extracted ${result.questions.length} questions → ${destination}`,
    );
    if (result.warnings?.length) {
      console.warn(`Warnings:\n- ${result.warnings.join("\n- ")}`);
    }
    return;
  }

  // -------------------------------------------------------------------------
  // Compilation — write one file per sub-exam
  // -------------------------------------------------------------------------
  console.log(
    `📚 Compilation detected: ${exams.length} exams found inside ${pdfName}`,
  );

  const writtenFiles: string[] = [];

  for (let i = 0; i < exams.length; i++) {
    const exam = exams[i];
    const validationWarnings = validateResult(exam);
    if (validationWarnings.length > 0) {
      exam.warnings = [...(exam.warnings ?? []), ...validationWarnings];
    }

    const fileName = compilationFileName(pdfBase, exam, i);
    const destination = join(outputDir, fileName);
    await writeBank(destination, exam);
    writtenFiles.push(destination);

    const label = exam.year
      ? `${exam.year}`
      : exam.examTitle
        ? `"${exam.examTitle.slice(0, 50)}"`
        : `part ${i + 1}`;
    console.log(
      `  [${i + 1}/${exams.length}] ${label} — ${exam.questions.length} questions → ${destination}`,
    );

    if (exam.warnings?.length) {
      console.warn(`  Warnings:\n  - ${exam.warnings.join("\n  - ")}`);
    }
  }

  const totalQuestions = exams.reduce((n, e) => n + e.questions.length, 0);
  console.log(
    `\n✅ Done. ${totalQuestions} questions across ${exams.length} exams written to ${outputDir}`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
