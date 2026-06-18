#!/usr/bin/env python3
"""
export-pdf.py — Convert QCM JSON question banks to clean, warm-styled PDF files.

Usage:
    python scripts/export-pdf.py                     # All banks
    python scripts/export-pdf.py <bank-id>           # By filename stem (no .json)
    python scripts/export-pdf.py path/to/bank.json   # By path
    python scripts/export-pdf.py --out ./exports     # Custom output directory

Requirements:
    pip install reportlab rich
"""

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

# ── Dependency guards ──────────────────────────────────────────────────────────

MISSING: list[str] = []

try:
    from rich.console import Console
    from rich.panel import Panel
    from rich.progress import (
        Progress,
        SpinnerColumn,
        BarColumn,
        TextColumn,
        TaskProgressColumn,
        TimeElapsedColumn,
    )
    from rich.table import Table
    from rich import box as rich_box

    console = Console()
    HAS_RICH = True
except ImportError:
    MISSING.append("rich")
    HAS_RICH = False

    class _FakeConsole:  # type: ignore
        def print(self, *a, **kw):
            print(*[str(x) for x in a])
        def rule(self, *a, **kw):
            print("-" * 60)

    console = _FakeConsole()  # type: ignore

try:
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT, TA_RIGHT
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.graphics.shapes import Circle, Drawing
    from reportlab.graphics.shapes import String as GString
    from reportlab.platypus import (
        HRFlowable,
        KeepTogether,
        PageBreak,
        Paragraph,
        SimpleDocTemplate,
        Spacer,
    )
    from reportlab.platypus import Table as RLTable
    from reportlab.platypus import TableStyle

    HAS_REPORTLAB = True
except ImportError:
    MISSING.append("reportlab")
    HAS_REPORTLAB = False

# ── Paths ──────────────────────────────────────────────────────────────────────

ROOT = Path(__file__).parent.parent.resolve()
BANK_DIR = ROOT / "data" / "question-banks"
DEFAULT_OUT = ROOT / "exports" / "pdf"

# ─────────────────────────────────────────────────────────────────────────────
# Warm minimal colour palette
# ─────────────────────────────────────────────────────────────────────────────
#
#   CREAM       — page / cover background
#   AMBER       — primary accent (question numbers, rules, headings)
#   AMBER_DARK  — darker amber for headings / cover title
#   TERRA       — warm mid-tone used for borders and secondary chrome
#   SAGE        — correct-answer highlight
#   SAGE_LT     — correct-answer background
#   INK         — main body text
#   MUTED       — secondary / caption text
#   RULE        — hairline / divider colour
#   OPT_BG      — default option card background
#   OPT_BD      — default option card left border
#
# ─────────────────────────────────────────────────────────────────────────────

if HAS_REPORTLAB:
    CREAM      = colors.HexColor("#FDFAF6")   # warm near-white
    COVER_BG   = colors.HexColor("#F5EDE0")   # warm cream cover
    AMBER      = colors.HexColor("#C8732A")   # terracotta / amber
    AMBER_PALE = colors.HexColor("#FAEBD7")   # very light amber tint
    AMBER_DARK = colors.HexColor("#8B4513")   # deep warm brown for titles
    TERRA      = colors.HexColor("#D4A574")   # light terracotta
    SAGE       = colors.HexColor("#4A7A35")   # muted sage green
    SAGE_LT    = colors.HexColor("#EEF4E8")   # sage tint background
    SAGE_BD    = colors.HexColor("#9CBF87")   # sage border
    INK        = colors.HexColor("#2C1E0F")   # warm near-black
    MUTED      = colors.HexColor("#7A6652")   # warm mid-brown
    RULE       = colors.HexColor("#E2D3C0")   # warm hairline
    OPT_BG     = colors.HexColor("#F9F5F0")   # option card background
    OPT_BD     = colors.HexColor("#D4A574")   # option left border (terra)
    REVIEW_BG  = colors.HexColor("#FDF3E6")   # review badge background
    REVIEW_BD  = colors.HexColor("#C8732A")   # review badge border
    WHITE      = colors.white


# ── Typography ─────────────────────────────────────────────────────────────────

def build_styles() -> dict:
    base = getSampleStyleSheet()

    def S(name: str, parent: str = "Normal", **kw) -> ParagraphStyle:
        return ParagraphStyle(name, parent=base[parent], **kw)

    return {
        # Section heading above the question list / answer key
        "section": S(
            "section",
            fontName="Helvetica-Bold",
            fontSize=13,
            leading=17,
            textColor=AMBER_DARK,
            spaceBefore=8,
            spaceAfter=4,
        ),
        # Question body text
        "q_text": S(
            "q_text",
            fontName="Helvetica",
            fontSize=11,
            leading=16,
            textColor=INK,
            alignment=TA_JUSTIFY,
            spaceAfter=4,
        ),
        # Option letter (default)
        "opt_letter": S(
            "opt_letter",
            fontName="Helvetica-Bold",
            fontSize=10.5,
            leading=14,
            textColor=AMBER,
        ),
        # Option text (default)
        "opt_text": S(
            "opt_text",
            fontName="Helvetica",
            fontSize=10.5,
            leading=14,
            textColor=INK,
        ),
        # Option letter (correct answer)
        "opt_correct_letter": S(
            "opt_correct_letter",
            fontName="Helvetica-Bold",
            fontSize=10.5,
            leading=14,
            textColor=SAGE,
        ),
        # Option text (correct answer)
        "opt_correct_text": S(
            "opt_correct_text",
            fontName="Helvetica-Bold",
            fontSize=10.5,
            leading=14,
            textColor=SAGE,
        ),
        # Review / needs-attention note
        "review": S(
            "review",
            fontName="Helvetica-Oblique",
            fontSize=8.5,
            leading=12,
            textColor=AMBER,
        ),
        # Answer-key section title
        "ak_title": S(
            "ak_title",
            fontName="Helvetica-Bold",
            fontSize=15,
            leading=20,
            textColor=AMBER_DARK,
            alignment=TA_CENTER,
            spaceAfter=12,
        ),
        # Small caption / sub-label
        "caption": S(
            "caption",
            fontName="Helvetica",
            fontSize=8.5,
            leading=11,
            textColor=MUTED,
        ),
    }


# ── Helpers ────────────────────────────────────────────────────────────────────

def _wrap(text: str, max_chars: int) -> list[str]:
    """Soft word-wrap: split text into lines of at most max_chars."""
    if not text:
        return [""]
    words = text.split()
    lines: list[str] = []
    current: list[str] = []
    length = 0
    for word in words:
        extra = len(word) + (1 if current else 0)
        if length + extra > max_chars and current:
            lines.append(" ".join(current))
            current, length = [word], len(word)
        else:
            current.append(word)
            length += extra
    if current:
        lines.append(" ".join(current))
    return lines or [""]


# ── Cover page ─────────────────────────────────────────────────────────────────

def draw_cover(
    canvas,
    doc,
    title: str,
    subtitle: str,
    meta_lines: list[str],
) -> None:
    """
    Minimal warm cover: cream background, amber accent stripe at top,
    large warm-brown title, secondary info below a thin divider.
    """
    w, h = A4
    canvas.saveState()

    # Warm cream background
    canvas.setFillColor(COVER_BG)
    canvas.rect(0, 0, w, h, fill=1, stroke=0)

    # Thin amber stripe at very top
    canvas.setFillColor(AMBER)
    canvas.rect(0, h - 6, w, 6, fill=1, stroke=0)

    # Thin amber stripe at very bottom
    canvas.setFillColor(AMBER)
    canvas.rect(0, 0, w, 6, fill=1, stroke=0)

    # Left margin warm accent bar (subtle)
    canvas.setFillColor(TERRA)
    canvas.rect(0, 6, 4, h - 12, fill=1, stroke=0)

    # ── Centred content block ─────────────────────────────────────────────────
    cx = w / 2

    # Label pill: "QCM · CONCOURS" above the title
    pill_y = h * 0.68
    canvas.setFont("Helvetica-Bold", 8)
    canvas.setFillColor(AMBER)
    canvas.drawCentredString(cx, pill_y, "QCM  \u00b7  CONCOURS")

    # Hairline above/below pill label
    canvas.setStrokeColor(TERRA)
    canvas.setLineWidth(0.6)
    canvas.line(cx - 55, pill_y + 11, cx + 55, pill_y + 11)
    canvas.line(cx - 55, pill_y - 4,  cx + 55, pill_y - 4)

    # Main title
    title_y = pill_y - 20
    canvas.setFont("Helvetica-Bold", 26)
    canvas.setFillColor(AMBER_DARK)
    title_lines = _wrap(title, 32)
    for line in title_lines:
        canvas.drawCentredString(cx, title_y, line)
        title_y -= 32

    # Subtitle (specialty)
    if subtitle:
        title_y -= 4
        canvas.setFont("Helvetica", 14)
        canvas.setFillColor(MUTED)
        for line in _wrap(subtitle, 52):
            canvas.drawCentredString(cx, title_y, line)
            title_y -= 19

    # Thin warm divider
    title_y -= 14
    canvas.setStrokeColor(RULE)
    canvas.setLineWidth(1)
    canvas.line(cx - 60, title_y, cx + 60, title_y)
    title_y -= 18

    # Meta lines (year, question count…)
    canvas.setFont("Helvetica", 11)
    canvas.setFillColor(MUTED)
    for line in meta_lines:
        canvas.drawCentredString(cx, title_y, line)
        title_y -= 16

    # Generation date — bottom right, very small
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(TERRA)
    canvas.drawRightString(w - 14, 14, f"Genere le {datetime.now().strftime('%d/%m/%Y')}")

    canvas.restoreState()


# ── Page header / footer (pages 2+) ───────────────────────────────────────────

def draw_later_pages(canvas, doc, bank_label: str) -> None:
    """
    Minimal header: just a warm hairline + small label text.
    Footer: page number centred.
    """
    w, h = A4
    canvas.saveState()

    # ── Header ────────────────────────────────────────────────────────────────
    # Amber top stripe (thin)
    canvas.setFillColor(AMBER)
    canvas.rect(0, h - 5, w, 5, fill=1, stroke=0)

    # Warm rule below stripe
    canvas.setStrokeColor(RULE)
    canvas.setLineWidth(0.5)
    canvas.line(14, h - 20, w - 14, h - 20)

    # Bank label (left) and "QCM Concours" (right) in muted small text
    label = bank_label if len(bank_label) <= 72 else bank_label[:69] + "..."
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(14, h - 16, label)
    canvas.setFillColor(TERRA)
    canvas.drawRightString(w - 14, h - 16, "QCM Concours")

    # ── Footer ────────────────────────────────────────────────────────────────
    canvas.setStrokeColor(RULE)
    canvas.setLineWidth(0.5)
    canvas.line(14, 20, w - 14, 20)

    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawCentredString(w / 2, 8, str(doc.page))

    canvas.restoreState()


# ── Question badge ─────────────────────────────────────────────────────────────

def question_badge(number: int | str) -> Drawing:
    """Small amber circle with white question number."""
    d = Drawing(20, 20)
    d.add(Circle(10, 10, 10, fillColor=AMBER, strokeColor=None))
    d.add(
        GString(
            10, 6.5,
            str(number),
            fontName="Helvetica-Bold",
            fontSize=9,
            fillColor=WHITE,
            textAnchor="middle",
        )
    )
    return d


# ── Question block ─────────────────────────────────────────────────────────────

def build_question(q: dict, styles: dict) -> KeepTogether:
    number       = q.get("number", "?")
    text         = q.get("text", "")
    options      = q.get("options", [])
    correct      = set(q.get("correctAnswers") or [])
    needs_review = q.get("needsReview", False)
    review_notes = q.get("reviewNotes") or []

    items: list = []

    # ── Question header: badge  +  question text ───────────────────────────
    hdr = RLTable(
        [[question_badge(number), Paragraph(text, styles["q_text"])]],
        colWidths=[24, None],
    )
    hdr.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
        ("TOPPADDING",    (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    items.append(hdr)

    # ── Options ────────────────────────────────────────────────────────────
    for opt in options:
        letter     = opt.get("letter", "?")
        opt_text   = opt.get("text", "")
        is_correct = letter in correct

        # Correct answers get a green tint; others get a warm cream card.
        # The left coloured border is the main visual cue — no heavy box.
        if is_correct:
            bg     = SAGE_LT
            l_bd   = SAGE
            l_sty  = "opt_correct_letter"
            t_sty  = "opt_correct_text"
        else:
            bg     = OPT_BG
            l_bd   = OPT_BD
            l_sty  = "opt_letter"
            t_sty  = "opt_text"

        row = RLTable(
            [[Paragraph(letter, styles[l_sty]),
              Paragraph(opt_text, styles[t_sty])]],
            colWidths=[11 * mm, None],
        )
        row.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), bg),
            # Left accent border only — clean, no full box
            ("LINEBEFORE",    (0, 0), (0, -1),  3, l_bd),
            ("LINEAFTER",     (0, 0), (0, -1),  0.4, RULE),
            ("LEFTPADDING",   (0, 0), (-1, -1), 7),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 7),
            ("TOPPADDING",    (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ]))
        items.append(Spacer(1, 3))
        items.append(row)

    # ── Review badge ───────────────────────────────────────────────────────
    if needs_review:
        note = " | ".join(review_notes) if review_notes else "Necessite verification"
        badge = RLTable([[Paragraph(f"! {note}", styles["review"])]])
        badge.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), REVIEW_BG),
            ("LINEBEFORE",    (0, 0), (0, -1),  2.5, REVIEW_BD),
            ("LEFTPADDING",   (0, 0), (-1, -1), 8),
            ("TOPPADDING",    (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
        ]))
        items.append(Spacer(1, 4))
        items.append(badge)

    # Breathing room after each question
    items.append(Spacer(1, 16))
    return KeepTogether(items)


# ── Answer key table ───────────────────────────────────────────────────────────

def build_answer_key(questions: list, styles: dict) -> RLTable:
    COLS = 5

    pairs = [
        (str(q.get("number", "?")), ", ".join(q.get("correctAnswers", [])))
        for q in questions
    ]

    # Pad rows to a multiple of COLS
    while len(pairs) % COLS:
        pairs.append(("", ""))

    # Header: alternating "N°" / "Rep." labels
    header: list[str] = []
    for _ in range(COLS):
        header += ["N", "Rep."]

    rows: list[list] = [header]
    for i in range(0, len(pairs), COLS):
        row: list = []
        for n, a in pairs[i : i + COLS]:
            row += [n, a]
        rows.append(row)

    col_w = [9 * mm, 17 * mm] * COLS
    t = RLTable(rows, colWidths=col_w, repeatRows=1)

    ts: list = [
        # Header row
        ("BACKGROUND",    (0, 0), (-1, 0),  AMBER_PALE),
        ("TEXTCOLOR",     (0, 0), (-1, 0),  AMBER_DARK),
        ("FONTNAME",      (0, 0), (-1, 0),  "Helvetica-Bold"),
        ("FONTSIZE",      (0, 0), (-1, 0),  8.5),
        # All cells
        ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("FONTNAME",      (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE",      (0, 1), (-1, -1), 9),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [WHITE, OPT_BG]),
        ("GRID",          (0, 0), (-1, -1), 0.4, RULE),
        # Bottom border of header row
        ("LINEBELOW",     (0, 0), (-1, 0),  1,   TERRA),
    ]
    # Colour answer (even) columns with sage green
    for col in range(1, COLS * 2, 2):
        ts += [
            ("FONTNAME",  (col, 1), (col, -1), "Helvetica-Bold"),
            ("TEXTCOLOR", (col, 1), (col, -1), SAGE),
        ]
    # Colour question-number (odd) columns with muted amber
    for col in range(0, COLS * 2, 2):
        ts += [
            ("TEXTCOLOR", (col, 1), (col, -1), MUTED),
        ]

    t.setStyle(TableStyle(ts))
    return t


# ── PDF builder ────────────────────────────────────────────────────────────────

def build_pdf(bank: dict, out_path: Path, styles: dict) -> int:
    questions     = bank.get("questions", [])
    exam_title    = bank.get("examTitle") or ""
    specialty     = bank.get("specialty") or ""
    year          = bank.get("year")
    source        = bank.get("sourceFile", "")
    warnings_list = bank.get("warnings") or []

    label_parts = [p for p in [exam_title, specialty, str(year) if year else ""] if p]
    bank_label  = " - ".join(label_parts) if label_parts else Path(source).stem

    meta: list[str] = []
    if specialty:
        meta.append(f"Specialite : {specialty}")
    if year:
        meta.append(f"Annee : {year}")
    meta.append(f"{len(questions)} question{'s' if len(questions) != 1 else ''}")

    out_path.parent.mkdir(parents=True, exist_ok=True)

    doc = SimpleDocTemplate(
        str(out_path),
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=34 * mm,
        bottomMargin=24 * mm,
        title=bank_label,
        author="Concours Bot",
    )

    # Page 1 = cover (blank content; drawn entirely in onFirstPage callback)
    story: list = [PageBreak()]

    # ── Questions section ──────────────────────────────────────────────────
    story.append(Paragraph("Questions", styles["section"]))
    story.append(
        HRFlowable(width="100%", thickness=0.75, color=RULE, spaceAfter=10)
    )
    for q in questions:
        story.append(build_question(q, styles))

    # ── Answer key section ─────────────────────────────────────────────────
    answered = [q for q in questions if q.get("correctAnswers")]
    if answered:
        story.append(PageBreak())
        story.append(Paragraph("Corrige -- Cle de reponses", styles["ak_title"]))
        story.append(
            HRFlowable(width="100%", thickness=0.75, color=TERRA, spaceAfter=14)
        )
        story.append(build_answer_key(answered, styles))

    # ── Extraction warnings ────────────────────────────────────────────────
    if warnings_list:
        story.append(Spacer(1, 14))
        story.append(
            HRFlowable(width="100%", thickness=0.4, color=RULE, spaceAfter=6)
        )
        story.append(Paragraph("Notes d'extraction", styles["section"]))
        for w in warnings_list:
            story.append(Paragraph(f"- {w}", styles["review"]))

    title    = exam_title or Path(source).stem
    subtitle = specialty

    doc.build(
        story,
        onFirstPage=lambda c, d: draw_cover(c, d, title, subtitle, meta),
        onLaterPages=lambda c, d: draw_later_pages(c, d, bank_label),
    )
    return len(questions)


# ── CLI helpers ────────────────────────────────────────────────────────────────

def _die(msg: str) -> None:
    if HAS_RICH:
        console.print(f"[bold red]Error:[/] {msg}")
    else:
        print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def resolve_banks(targets: list[str]) -> list[tuple[Path, dict]]:
    results: list[tuple[Path, dict]] = []
    if not targets:
        if not BANK_DIR.exists():
            _die(f"Bank directory not found: {BANK_DIR}\nRun extract:qcm first.")
        for p in sorted(BANK_DIR.glob("*.json")):
            try:
                results.append((p, json.loads(p.read_text("utf-8"))))
            except Exception as e:
                if HAS_RICH:
                    console.print(f"[yellow]Skipping {p.name}:[/] {e}")
                else:
                    print(f"Warning: skipping {p.name}: {e}")
    else:
        for t in targets:
            p = Path(t)
            if not p.suffix:
                p = BANK_DIR / f"{t}.json"
            elif not p.is_absolute():
                p = (ROOT / p).resolve()
            if not p.exists():
                _die(f"File not found: {p}")
            results.append((p, json.loads(p.read_text("utf-8"))))
    return results


# ── Entry point ────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Export QCM question banks to clean, warm-styled PDF files.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "banks", nargs="*", metavar="BANK",
        help="Bank ID(s) or .json paths. Default: all banks.",
    )
    parser.add_argument(
        "--out", default=str(DEFAULT_OUT), metavar="DIR",
        help="Output directory (default: exports/pdf)",
    )
    args = parser.parse_args()

    if MISSING:
        pkgs = " ".join(MISSING)
        if HAS_RICH:
            console.print(Panel(
                f"[bold]Missing packages:[/] {', '.join(MISSING)}\n\n"
                f"Install with:\n  [cyan]pip install {pkgs}[/]",
                title="[red]Setup Required[/]", border_style="red",
            ))
        else:
            print(f"Missing: {', '.join(MISSING)}\nInstall: pip install {pkgs}")
        sys.exit(1)

    out_dir = Path(args.out).resolve()

    if HAS_RICH:
        console.print()
        console.rule("[bold #8B4513]  QCM >> PDF Exporter  [/bold #8B4513]")
        console.print()

    banks = resolve_banks(args.banks)
    if not banks:
        _die("No question banks found.")

    if HAS_RICH:
        console.print(f"  [bold]{len(banks)}[/] bank(s)  ->  [cyan]{out_dir}[/]\n")

    styles = build_styles()
    results: list[tuple[str, int, Path, str | None]] = []

    if HAS_RICH:
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description:<52}"),
            BarColumn(bar_width=26, complete_style="#C8732A", finished_style="#4A7A35"),
            TaskProgressColumn(),
            TimeElapsedColumn(),
            console=console,
        ) as prog:
            task = prog.add_task("Starting...", total=len(banks))
            for src, bank in banks:
                stem = src.stem
                dest = out_dir / f"{stem}.pdf"
                prog.update(task, description=f"[#C8732A]{stem[:48]}[/]")
                try:
                    n = build_pdf(bank, dest, styles)
                    results.append((stem, n, dest, None))
                except Exception as e:
                    results.append((stem, 0, dest, str(e)))
                prog.advance(task)
    else:
        for src, bank in banks:
            stem = src.stem
            dest = out_dir / f"{stem}.pdf"
            print(f"  {stem}...")
            try:
                n = build_pdf(bank, dest, styles)
                results.append((stem, n, dest, None))
            except Exception as e:
                results.append((stem, 0, dest, str(e)))

    if HAS_RICH:
        console.print()
        tbl = Table(
            box=rich_box.SIMPLE_HEAVY,
            show_header=True,
            header_style="bold #8B4513",
            title="[bold #8B4513]Export Summary[/]",
            title_style="bold",
            border_style="#D4A574",
            pad_edge=False,
        )
        tbl.add_column("Bank", style="#7A6652", no_wrap=False, max_width=50)
        tbl.add_column("Q", justify="right", style="bold", min_width=4)
        tbl.add_column("Output", style="dim", max_width=40)
        tbl.add_column("", justify="center", width=4)

        for stem, n, dest, err in results:
            if err:
                tbl.add_row(stem, "-", dest.name, "[red]x[/]")
            else:
                tbl.add_row(stem, str(n), dest.name, "[green]v[/]")

        console.print(tbl)

        ok  = sum(1 for *_, e in results if not e)
        tot = sum(n for _, n, _, e in results if not e)
        console.print(
            f"\n  [bold green]{ok}/{len(results)}[/] PDFs  "
            f"[dim]|[/]  [bold]{tot}[/] questions total"
        )
        console.print(f"  [dim]Output ->[/] [cyan]{out_dir}[/]\n")

        for stem, _, _, err in results:
            if err:
                console.print(f"  [red]  {stem}:[/] {err}")
    else:
        ok = sum(1 for *_, e in results if not e)
        print(f"\nDone: {ok}/{len(results)} exported to {out_dir}")
        for stem, _, _, err in results:
            if err:
                print(f"  ERROR {stem}: {err}")

    sys.exit(1 if any(e for *_, e in results) else 0)


if __name__ == "__main__":
    main()
