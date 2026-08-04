#!/usr/bin/env python3
"""Build the portal user PDFs from the Markdown source of truth."""

from __future__ import annotations

import html
import re
import shutil
from pathlib import Path
from typing import Iterable

from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    HRFlowable,
    ListFlowable,
    ListItem,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = ROOT / "docs" / "user"
OUTPUT_DIR = ROOT / "output" / "pdf"
PUBLIC_DIR = ROOT / "public" / "docs"

NAVY = colors.HexColor("#003865")
NAVY_DARK = colors.HexColor("#00253D")
GOLD = colors.HexColor("#FCB716")
TEXT = colors.HexColor("#262627")
MUTED = colors.HexColor("#63656A")
LIGHT = colors.HexColor("#F4F5F7")
BORDER = colors.HexColor("#DEDEDE")


def read_markdown(name: str) -> tuple[dict[str, str], str]:
    source = (SOURCE_DIR / name).read_text(encoding="utf-8")
    match = re.match(r"^---\n(.*?)\n---\n?(.*)$", source, re.DOTALL)
    if not match:
        raise ValueError(f"{name} is missing frontmatter")
    metadata: dict[str, str] = {}
    for line in match.group(1).splitlines():
        key, separator, value = line.partition(":")
        if not separator:
            raise ValueError(f"Invalid frontmatter in {name}: {line}")
        metadata[key.strip()] = value.strip()
    return metadata, match.group(2).strip()


def inline_markup(value: str) -> str:
    escaped = html.escape(value, quote=False)
    escaped = re.sub(r"`([^`]+)`", r'<font name="Courier">\1</font>', escaped)
    escaped = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", escaped)
    escaped = re.sub(r"\[([^]]+)]\(([^)]+)\)", r'<a href="\2" color="#003865">\1</a>', escaped)
    return escaped


def make_styles(compact: bool = False):
    base = getSampleStyleSheet()
    body_size = 9 if compact else 9.5
    leading = 11.2 if compact else 13.2
    styles = {
        "body": ParagraphStyle(
            "Body",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=body_size,
            leading=leading,
            textColor=TEXT,
            spaceAfter=5 if compact else 8,
        ),
        "h1": ParagraphStyle(
            "Heading1",
            parent=base["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=20 if compact else 24,
            leading=23 if compact else 29,
            textColor=NAVY,
            spaceAfter=8 if compact else 14,
        ),
        "h2": ParagraphStyle(
            "Heading2",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=12 if compact else 15,
            leading=14 if compact else 18,
            textColor=NAVY,
            spaceBefore=7 if compact else 14,
            spaceAfter=3 if compact else 6,
            keepWithNext=True,
        ),
        "h3": ParagraphStyle(
            "Heading3",
            parent=base["Heading3"],
            fontName="Helvetica-Bold",
            fontSize=10 if compact else 11.5,
            leading=12.5 if compact else 14,
            textColor=NAVY_DARK,
            spaceBefore=5 if compact else 10,
            spaceAfter=3,
            keepWithNext=True,
        ),
        "table": ParagraphStyle(
            "TableBody",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=8 if compact else 8.2,
            leading=9.5 if compact else 10.5,
            textColor=TEXT,
        ),
        "table_header": ParagraphStyle(
            "TableHeader",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=8 if compact else 8.2,
            leading=9.5 if compact else 10.5,
            textColor=colors.white,
        ),
    }
    return styles


def markdown_flowables(markdown: str, styles: dict, available_width: float) -> list:
    lines = markdown.splitlines()
    flowables: list = []
    index = 0

    while index < len(lines):
        line = lines[index].strip()
        if not line:
            index += 1
            continue

        if line.startswith("# "):
            flowables.append(Paragraph(inline_markup(line[2:]), styles["h1"]))
            flowables.append(HRFlowable(width="100%", thickness=3, color=GOLD, spaceAfter=5))
            index += 1
            continue
        if line.startswith("## "):
            if line == "## Safe retry sequence":
                flowables.append(PageBreak())
            flowables.append(Paragraph(inline_markup(line[3:]), styles["h2"]))
            index += 1
            continue
        if line.startswith("### "):
            flowables.append(Paragraph(inline_markup(line[4:]), styles["h3"]))
            index += 1
            continue

        if line.startswith("|") and index + 1 < len(lines) and re.match(r"^\|?[\s:|-]+\|$", lines[index + 1].strip()):
            table_lines = [line]
            index += 2
            while index < len(lines) and lines[index].strip().startswith("|"):
                table_lines.append(lines[index].strip())
                index += 1
            rows = [[cell.strip() for cell in row.strip("|").split("|")] for row in table_lines]
            column_count = len(rows[0])
            if column_count == 3:
                widths = [available_width * 0.25, available_width * 0.31, available_width * 0.44]
            else:
                widths = [available_width / column_count] * column_count
            formatted = []
            for row_index, row in enumerate(rows):
                style = styles["table_header"] if row_index == 0 else styles["table"]
                formatted.append([Paragraph(inline_markup(cell), style) for cell in row])
            table = Table(formatted, colWidths=widths, repeatRows=1, hAlign="LEFT")
            table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), NAVY),
                ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
            ]))
            flowables.extend([table, Spacer(1, 7)])
            continue

        list_match = re.match(r"^(?:- |(\d+)\. )(.*)$", line)
        if list_match:
            numbered = list_match.group(1) is not None
            items = []
            start = int(list_match.group(1)) if numbered else None
            while index < len(lines):
                current = lines[index].strip()
                current_match = re.match(r"^(?:- |(\d+)\. )(.*)$", current)
                if not current_match or (current_match.group(1) is not None) != numbered:
                    break
                items.append(ListItem(Paragraph(inline_markup(current_match.group(2)), styles["body"]), leftIndent=12))
                index += 1
            flowables.append(ListFlowable(
                items,
                bulletType="1" if numbered else "bullet",
                start=start,
                leftIndent=17,
                bulletFontName="Helvetica-Bold",
                bulletFontSize=styles["body"].fontSize,
                spaceAfter=4,
            ))
            continue

        paragraph_lines = [line]
        index += 1
        while index < len(lines):
            candidate = lines[index].strip()
            if not candidate or candidate.startswith("#") or candidate.startswith("|") or re.match(r"^(?:- |\d+\. )", candidate):
                break
            paragraph_lines.append(candidate)
            index += 1
        flowables.append(Paragraph(inline_markup(" ".join(paragraph_lines)), styles["body"]))

    return flowables


def page_decor(canvas, doc):
    canvas.saveState()
    width, height = LETTER
    canvas.setFillColor(NAVY)
    canvas.rect(0, height - 0.22 * inch, width, 0.22 * inch, stroke=0, fill=1)
    canvas.setFillColor(GOLD)
    canvas.rect(0, height - 0.27 * inch, width, 0.05 * inch, stroke=0, fill=1)
    canvas.setFont("Helvetica-Bold", 7.5)
    canvas.setFillColor(NAVY)
    canvas.drawString(doc.leftMargin, 0.34 * inch, "CEDARVILLE UNIVERSITY APP PORTAL")
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawRightString(width - doc.rightMargin, 0.34 * inch, f"Page {doc.page}")
    canvas.restoreState()


def build_document(path: Path, story: Iterable, compact: bool = False):
    margin = 0.45 * inch if compact else 0.62 * inch
    top = 0.48 * inch if compact else 0.62 * inch
    bottom = 0.5 * inch
    doc = BaseDocTemplate(
        str(path),
        pagesize=LETTER,
        leftMargin=margin,
        rightMargin=margin,
        topMargin=top,
        bottomMargin=bottom,
        title="Cedarville App Portal User Documentation",
        author="Cedarville IT",
        subject="First-time user instructions for creating and publishing apps",
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="normal")
    doc.addPageTemplates([PageTemplate(id="portal", frames=[frame], onPage=page_decor)])
    doc.build(list(story))


def build_quick_start() -> Path:
    _, markdown = read_markdown("quick-start.md")
    styles = make_styles(compact=True)
    width = LETTER[0] - 0.9 * inch
    path = OUTPUT_DIR / "cedarville-app-portal-quick-start.pdf"
    build_document(path, markdown_flowables(markdown, styles, width), compact=True)
    page_count = len(PdfReader(str(path)).pages)
    if page_count != 1:
        raise RuntimeError(f"Quick Start must be exactly one page; generated {page_count} pages")
    return path


def build_complete_guide() -> Path:
    styles = make_styles()
    width = LETTER[0] - 1.24 * inch
    story = [
        Spacer(1, 1.25 * inch),
        Paragraph("Cedarville App Portal", ParagraphStyle(
            "CoverTitle", fontName="Helvetica-Bold", fontSize=30, leading=34,
            textColor=NAVY, alignment=TA_CENTER, spaceAfter=12,
        )),
        Paragraph("First-Time User Guide", ParagraphStyle(
            "CoverSubtitle", fontName="Helvetica", fontSize=18, leading=22,
            textColor=NAVY_DARK, alignment=TA_CENTER, spaceAfter=20,
        )),
        HRFlowable(width="70%", thickness=5, color=GOLD, hAlign="CENTER", spaceAfter=18),
        Paragraph(
            "Create, publish, manage, and troubleshoot Cedarville apps without prior development or hosting experience.",
            ParagraphStyle("CoverBody", parent=styles["body"], fontSize=12, leading=17, alignment=TA_CENTER, textColor=MUTED),
        ),
        Spacer(1, 0.45 * inch),
        Paragraph("Includes the complete guide, troubleshooting, FAQ, and glossary.", ParagraphStyle(
            "CoverNote", parent=styles["body"], alignment=TA_CENTER, textColor=MUTED,
        )),
        PageBreak(),
    ]
    names = ["guide.md", "troubleshooting.md", "faq.md", "glossary.md"]
    for position, name in enumerate(names):
        _, markdown = read_markdown(name)
        story.extend(markdown_flowables(markdown, styles, width))
        if position < len(names) - 1:
            story.append(PageBreak())
    path = OUTPUT_DIR / "cedarville-app-portal-user-guide.pdf"
    build_document(path, story)
    return path


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    generated = [build_quick_start(), build_complete_guide()]
    for path in generated:
        shutil.copy2(path, PUBLIC_DIR / path.name)
        reader = PdfReader(str(path))
        if not reader.pages:
            raise RuntimeError(f"{path.name} has no pages")
        extracted = "\n".join((page.extract_text() or "") for page in reader.pages)
        if "cedarville" not in extracted.lower() or "app portal" not in extracted.lower():
            raise RuntimeError(f"{path.name} failed text validation")
        print(f"Built {path.relative_to(ROOT)} ({len(reader.pages)} pages)")


if __name__ == "__main__":
    main()
