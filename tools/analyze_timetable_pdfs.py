#!/usr/bin/env python3
"""
Analyze timetable PDFs without third-party dependencies.

This script uses a lightweight parser for common PDF text streams so we can
compare exported timetable layouts and derive scheduling patterns such as:
- periods per day
- active weekdays
- lunch / mentoring markers
- theory vs practical distribution hints
- sample class rows and title lines

It is intentionally heuristic-driven rather than a full PDF parser, but it is
good enough for many table-based university timetable exports.
"""

from __future__ import annotations

import argparse
import re
import sys
import zlib
from collections import defaultdict
from pathlib import Path


DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
SEASON_WORDS = ["Spring", "Fall", "Autumn", "Odd", "Even"]
PROGRAM_HINTS = [
    "B.Sc",
    "M.Sc",
    "BCA",
    "MCA",
    "BBA",
    "MBA",
    "BPT",
    "LLB",
    "BA LLB",
    "B.Pharm",
    "M.Pharm",
    "BMLT",
    "DMLT",
    "B.Tech",
]


def decode_tj_array(array_text: str) -> str:
    parts: list[str] = []
    for match in re.finditer(r"\((.*?)(?<!\\)\)", array_text, re.S):
        text = match.group(1)
        output: list[str] = []
        index = 0
        while index < len(text):
            char = text[index]
            if char == "\\" and index + 1 < len(text):
                index += 1
                escaped = text[index]
                escape_map = {
                    "n": "\n",
                    "r": "\r",
                    "t": "\t",
                    "b": "\b",
                    "f": "\f",
                    "(": "(",
                    ")": ")",
                    "\\": "\\",
                }
                output.append(escape_map.get(escaped, escaped))
            else:
                output.append(char)
            index += 1
        parts.append("".join(output))
    return "".join(parts)


def extract_lines(pdf_path: Path) -> list[str]:
    data = pdf_path.read_bytes()
    items: list[tuple[float, float, str]] = []

    for stream_match in re.finditer(rb"stream\r?\n(.*?)\r?\nendstream", data, re.S):
        stream_data = stream_match.group(1)
        try:
            decoded = zlib.decompress(stream_data).decode("latin1", errors="ignore")
        except Exception:
            continue

        for block_match in re.finditer(r"BT(.*?)ET", decoded, re.S):
            block = block_match.group(1)
            matrix_match = re.search(r"1 0 0 1 ([\d.\-]+) ([\d.\-]+) Tm", block)
            if not matrix_match:
                continue

            x = float(matrix_match.group(1))
            y = float(matrix_match.group(2))

            text = ""
            for array_match in re.finditer(r"\[(.*?)\]\s*TJ", block, re.S):
                text += decode_tj_array(array_match.group(1))
            for string_match in re.finditer(r"\((.*?)(?<!\\)\)\s*Tj", block, re.S):
                text += string_match.group(1)

            text = " ".join(text.replace("\r", " ").replace("\n", " ").split())
            if text:
                items.append((round(y, 1), x, text))

    rows: dict[float, list[tuple[float, str]]] = defaultdict(list)
    for y, x, text in items:
        rows[y].append((x, text))

    lines: list[str] = []
    for y in sorted(rows.keys(), reverse=True):
        row = " | ".join(part for _, part in sorted(rows[y]))
        row = " ".join(row.split())
        if row:
            lines.append(row)

    return lines


def summarize_lines(lines: list[str]) -> dict[str, object]:
    text_blob = "\n".join(lines)
    periods = sorted({int(number) for number in re.findall(r"Period\s+(\d+)", text_blob)})
    days = [day for day in DAY_NAMES if day in text_blob]
    seasons = [season for season in SEASON_WORDS if season in text_blob]

    title = next((line for line in lines if "Time Table" in line), "N/A")
    department = next((line for line in lines if "Department of" in line), "N/A")

    sample_rows: list[str] = []
    seen_rows: set[str] = set()
    for line in lines:
        if any(hint in line for hint in PROGRAM_HINTS):
            normalized = re.sub(r"\s+", " ", line)
            if normalized in seen_rows:
                continue
            seen_rows.add(normalized)
            sample_rows.append(line)
            if len(sample_rows) == 5:
                break

    keyword_counts = {
        "lunch": text_blob.upper().count("LUNCH"),
        "mentoring": text_blob.upper().count("MENTORING"),
        "theory_markers": len(re.findall(r"\bT\b|\(T\)", text_blob)),
        "practical_markers": len(re.findall(r"\bP\b|\(P\)", text_blob)),
    }

    return {
        "title": title,
        "department": department,
        "periods": periods,
        "days": days,
        "seasons": seasons,
        "keyword_counts": keyword_counts,
        "sample_rows": sample_rows,
    }


def analyze_path(path: Path) -> tuple[Path, dict[str, object]]:
    lines = extract_lines(path)
    return path, summarize_lines(lines)


def print_report(results: list[tuple[Path, dict[str, object]]]) -> None:
    for path, summary in results:
        print("=" * 100)
        print(path.name)
        print(f"TITLE: {summary['title']}")
        print(f"DEPARTMENT: {summary['department']}")
        print(f"PERIODS: {summary['periods']}")
        print(f"DAYS: {summary['days']}")
        print(f"SEASONS: {summary['seasons']}")
        print(f"COUNTS: {summary['keyword_counts']}")
        print("SAMPLE ROWS:")
        sample_rows = summary["sample_rows"]
        if not sample_rows:
            print("- None detected")
            continue
        for row in sample_rows:
            print(f"- {row}")


def collect_pdf_paths(input_path: Path) -> list[Path]:
    if input_path.is_file():
        return [input_path]
    return sorted(input_path.glob("*.pdf"))


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Analyze timetable PDFs without external dependencies.")
    parser.add_argument("path", help="Path to a PDF file or a folder containing timetable PDFs.")
    args = parser.parse_args(argv)

    input_path = Path(args.path)
    if not input_path.exists():
        print(f"Path not found: {input_path}", file=sys.stderr)
        return 1

    pdf_paths = collect_pdf_paths(input_path)
    if not pdf_paths:
        print(f"No PDF files found in: {input_path}", file=sys.stderr)
        return 1

    results = [analyze_path(pdf_path) for pdf_path in pdf_paths]
    print_report(results)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
