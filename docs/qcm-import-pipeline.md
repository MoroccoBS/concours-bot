# QCM PDF Import Pipeline

## What the current PDFs look like

The PDFs in `concours/` are almost all scanned or phone-photographed pages. A PyMuPDF probe found one full-page raster image on most pages and almost no embedded text, so `pdftotext`, `pypdf`, or LiteParse without OCR will not recover the questions.

The hard cases are still structured: questions are usually labelled `Q1`, `Q2`, etc., with answer choices `A.` through `D.` and sometimes `E.`. Some scans are skewed, include Arabic/French headers, and include footer noise.

## Recommended path

Use a two-stage pipeline:

1. Parse/inspect locally first.
   - Use LiteParse where it helps with OCR and page layout boxes.
   - Keep page numbers and source file metadata.
   - Detect low-text PDFs and mark them as image/OCR candidates.

2. Use a cheap multimodal model for structured extraction.
   - Current Google docs list `gemini-3.1-flash-lite` as a stable low-cost multimodal model with PDF input and structured outputs.
   - Send the whole PDF when possible; for bad scans, send page images in small batches.
   - Require strict JSON output and validate it locally before the bot uses it.

LiteParse is useful as a local parser/OCR/layout step, but it is not the final QCM extractor. The model is better suited for grouping lines into questions, ignoring headers/footers, and handling skewed phone photos.

## Target JSON shape

```json
{
  "sourceFile": "Concours-Radiologie-Aptitude-2024.pdf",
  "examTitle": "Examen d'aptitude professionnelle...",
  "specialty": "Radiologie",
  "year": 2024,
  "language": "mixed",
  "questions": [
    {
      "number": 1,
      "text": "Les techniciens de radiologie realisent...",
      "options": [
        { "letter": "A", "text": "..." },
        { "letter": "B", "text": "..." },
        { "letter": "C", "text": "..." },
        { "letter": "D", "text": "..." }
      ],
      "correctAnswers": ["A", "C"],
      "pageStart": 1,
      "pageEnd": 1,
      "confidence": 0.92,
      "needsReview": false
    }
  ],
  "warnings": []
}
```

`correctAnswers` should be omitted when the source exam has no answer key. Many concours PDFs appear to contain only the question paper, so answer keys may need a separate source or a manual review pass.

## First prototype

Run:

```bash
bun run extract:qcm -- concours/Concours-Radiologie-Aptitude-2024.pdf
```

The script uploads the PDF to Gemini, asks for JSON matching the QCM schema, validates obvious issues, and writes:

```text
data/question-banks/<pdf-name>.json
```

Set `GEMINI_API_KEY` before running it.

## Next bot integration

After the JSON quality is good enough:

1. Add a persistent question bank loader under `src/store`.
2. Add commands like `/bank list`, `/bank load`, and `/qcm next`.
3. Let `/session start` optionally choose a bank and shuffle questions.
4. Keep a review workflow for `needsReview=true` questions before they enter the playable bank.
