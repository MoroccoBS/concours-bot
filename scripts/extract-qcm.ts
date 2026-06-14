import { mkdir, writeFile } from "node:fs/promises";
import { basename, join, parse, resolve } from "node:path";
import { createPartFromUri, GoogleGenAI, Type } from "@google/genai";

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

const DEFAULT_MODEL = "gemini-3.1-flash-lite";
const outputDir = resolve("data", "question-banks");

const schema = {
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

function usage(): never {
  console.error(
    "Usage: bun run extract:qcm -- <pdf-path> [--model gemini-3.1-flash-lite] [--out data/question-banks/file.json]",
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
    outPath: outPath ? resolve(outPath) : undefined,
  };
}

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

async function main() {
  const { pdfPath, model, outPath } = parseArgs();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY in the environment.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const uploaded = await ai.files.upload({
    file: pdfPath,
    config: { mimeType: "application/pdf" },
  });

  if (!uploaded.uri || !uploaded.mimeType) {
    throw new Error("Gemini file upload did not return a usable URI.");
  }

  const response = await ai.models.generateContent({
    model,
    contents: [
      createPartFromUri(uploaded.uri, uploaded.mimeType),
      {
        text: [
          "Extract the concours exam into clean QCM JSON.",
          "Keep the original French/Arabic medical wording. Do not translate.",
          "Ignore headers, footers, instructions, phone numbers, logos, and answer-sheet boxes.",
          "Questions are usually labelled Q1, Q2, etc. Options are usually A, B, C, D, sometimes E.",
          "If the PDF does not contain an answer key, omit correctAnswers.",
          "Use needsReview=true when text is uncertain, options are incomplete, numbering jumps, or image quality is poor.",
          `Set sourceFile to ${JSON.stringify(basename(pdfPath))}.`,
        ].join("\n"),
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: schema,
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  const result = JSON.parse(text) as ExtractionResult;
  const validationWarnings = validateResult(result);
  if (validationWarnings.length > 0) {
    result.warnings = [...(result.warnings ?? []), ...validationWarnings];
  }

  await mkdir(outputDir, { recursive: true });
  const defaultOutPath = join(outputDir, `${parse(pdfPath).name}.json`);
  const destination = outPath ?? defaultOutPath;
  await writeFile(destination, `${JSON.stringify(result, null, 2)}\n`);

  console.log(
    `Extracted ${result.questions.length} questions from ${basename(pdfPath)} -> ${destination}`,
  );
  if (result.warnings?.length) {
    console.warn(`Warnings:\n- ${result.warnings.join("\n- ")}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
