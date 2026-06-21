#!/usr/bin/env python3
"""
Convert every image in a folder into a single multi-page PDF.

Usage:
    python scripts/images-to-pdf.py data/images-to-pdf/national-2026
    python scripts/images-to-pdf.py data/images-to-pdf/national-2026 --out concours/National-2026.pdf
    python scripts/images-to-pdf.py data/images-to-pdf/national-2026 --recursive

Then extract JSON from the generated PDF:
    bun run extract:qcm -- concours/National-2026.pdf

Requirements:
    pip install pillow
"""

import argparse
import re
import sys
from pathlib import Path

try:
    from PIL import Image, ImageOps
except ImportError:
    print("Missing dependency: pillow", file=sys.stderr)
    print("Install it with: pip install pillow", file=sys.stderr)
    sys.exit(1)


ROOT = Path(__file__).parent.parent.resolve()
DEFAULT_OUT_DIR = ROOT / "concours"
IMAGE_EXTENSIONS = {
    ".bmp",
    ".gif",
    ".jpeg",
    ".jpg",
    ".png",
    ".tif",
    ".tiff",
    ".webp",
}


def natural_key(path: Path) -> list[object]:
    """Sort page-1, page-2, page-10 in the expected human order."""
    return [
        int(part) if part.isdigit() else part.casefold()
        for part in re.split(r"(\d+)", path.name)
    ]


def default_output_path(input_dir: Path) -> Path:
    return DEFAULT_OUT_DIR / f"{input_dir.name}.pdf"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert a folder of images into a single PDF."
    )
    parser.add_argument("input_dir", help="Folder containing the image files.")
    parser.add_argument(
        "--out",
        help="Output PDF path. Defaults to concours/<input-folder-name>.pdf.",
    )
    parser.add_argument(
        "--recursive",
        action="store_true",
        help="Include images inside nested folders.",
    )
    return parser.parse_args()


def find_images(input_dir: Path, recursive: bool) -> list[Path]:
    pattern = "**/*" if recursive else "*"
    files = [
        path
        for path in input_dir.glob(pattern)
        if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS
    ]
    return sorted(files, key=natural_key)


def load_pdf_page(path: Path) -> Image.Image:
    with Image.open(path) as image:
        image = ImageOps.exif_transpose(image)
        if image.mode in ("RGBA", "LA") or (
            image.mode == "P" and "transparency" in image.info
        ):
            background = Image.new("RGB", image.size, "white")
            background.paste(image.convert("RGBA"), mask=image.convert("RGBA").split()[-1])
            return background

        return image.convert("RGB")


def main() -> None:
    args = parse_args()
    input_dir = Path(args.input_dir).resolve()
    out_path = Path(args.out).resolve() if args.out else default_output_path(input_dir)

    if not input_dir.exists() or not input_dir.is_dir():
        print(f"Input folder does not exist: {input_dir}", file=sys.stderr)
        sys.exit(1)

    images = find_images(input_dir, args.recursive)
    if not images:
        print(f"No images found in: {input_dir}", file=sys.stderr)
        print(
            "Supported extensions: "
            + ", ".join(sorted(IMAGE_EXTENSIONS)),
            file=sys.stderr,
        )
        sys.exit(1)

    out_path.parent.mkdir(parents=True, exist_ok=True)

    pages = [load_pdf_page(path) for path in images]
    first_page, rest_pages = pages[0], pages[1:]
    first_page.save(out_path, "PDF", save_all=True, append_images=rest_pages, resolution=300)

    print(f"Created PDF: {out_path}")
    print(f"Pages: {len(pages)}")
    print()
    print("Next step:")
    print(f"  bun run extract:qcm -- {out_path}")


if __name__ == "__main__":
    main()
