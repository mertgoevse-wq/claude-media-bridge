#!/usr/bin/env python3
"""Render real CLI output to a terminal-style PNG for the README.

Runs each command in a sandboxed HOME, captures the actual coloured stdout,
converts the ANSI escapes to SVG and rasterises it with rsvg-convert.

Usage:  python3 scripts/screenshot.py <output-dir>
"""
from __future__ import annotations

import html
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

FONT = "DejaVu Sans Mono"
FONT_SIZE = 15
LINE_HEIGHT = 22
PAD = 26
CHROME = 40

BG = "#0b1220"
FG = "#e6edf7"
CHROME_BG = "#111c2e"

# xterm-ish palette for the SGR codes the CLI actually emits.
COLORS = {
    30: "#3b4a63", 31: "#f87171", 32: "#34d399", 33: "#fbbf24",
    34: "#60a5fa", 35: "#c084fc", 36: "#38bdf8", 37: "#e6edf7",
    90: "#6b7f9e", 91: "#fca5a5", 92: "#6ee7b7", 93: "#fcd34d",
    94: "#93c5fd", 95: "#d8b4fe", 96: "#7dd3fc", 97: "#ffffff",
}

ANSI = re.compile(r"\x1b\[([0-9;]*)m")


def tokenize(line: str):
    """Split a line into (text, colour, bold, dim) runs."""
    runs, pos = [], 0
    color, bold, dim = FG, False, False

    for match in ANSI.finditer(line):
        if match.start() > pos:
            runs.append((line[pos:match.start()], color, bold, dim))
        codes = [int(c) for c in match.group(1).split(";") if c != ""] or [0]
        for code in codes:
            if code == 0:
                color, bold, dim = FG, False, False
            elif code == 1:
                bold = True
            elif code == 2:
                dim = True
            elif code in COLORS:
                color = COLORS[code]
        pos = match.end()

    if pos < len(line):
        runs.append((line[pos:], color, bold, dim))
    return runs


def to_svg(lines: list[str], title: str) -> str:
    cols = max((len(ANSI.sub("", ln)) for ln in lines), default=0)
    width = PAD * 2 + cols * (FONT_SIZE * 0.6019)
    height = CHROME + PAD * 2 + len(lines) * LINE_HEIGHT

    out = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width:.0f}" height="{height:.0f}" '
        f'viewBox="0 0 {width:.0f} {height:.0f}">',
        f'<rect width="100%" height="100%" rx="10" fill="{BG}"/>',
        f'<rect width="100%" height="{CHROME}" rx="10" fill="{CHROME_BG}"/>',
        f'<rect y="{CHROME - 12}" width="100%" height="12" fill="{CHROME_BG}"/>',
    ]

    for i, dot in enumerate(("#ff5f57", "#febc2e", "#28c840")):
        out.append(f'<circle cx="{22 + i * 20}" cy="{CHROME / 2}" r="6" fill="{dot}"/>')
    out.append(
        f'<text x="{width / 2}" y="{CHROME / 2 + 5}" fill="#8fa3c0" font-family="{FONT}" '
        f'font-size="13" text-anchor="middle">{html.escape(title)}</text>'
    )

    y = CHROME + PAD + FONT_SIZE
    for line in lines:
        x = PAD
        for text, color, bold, dim in tokenize(line):
            if not text:
                continue
            fill = "#6b7f9e" if dim else color
            weight = "bold" if bold else "normal"
            shown = html.escape(text).replace(" ", "&#160;")
            out.append(
                f'<text x="{x:.1f}" y="{y}" fill="{fill}" font-family="{FONT}" '
                f'font-size="{FONT_SIZE}" font-weight="{weight}" '
                f'xml:space="preserve">{shown}</text>'
            )
            x += len(text) * FONT_SIZE * 0.6019
        y += LINE_HEIGHT

    out.append("</svg>")
    return "".join(out)


def capture(cmd: list[str], home: str) -> str:
    env = {**os.environ, "HOME": home, "FORCE_COLOR": "1", "NO_COLOR": ""}
    proc = subprocess.run(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,  # keep progress lines in their real order
        text=True,
        env=env,
        timeout=180,
        cwd=home,
    )
    return proc.stdout.rstrip("\n")


def fit(lines: list[str], max_lines: int = 26) -> list[str]:
    """Trim long captures so README images stay readable rather than endless."""
    return lines if len(lines) <= max_lines else lines[:max_lines] + [f"  ... {len(lines) - max_lines} more lines"]


def render(lines: list[str], title: str, out_path: Path) -> None:
    svg_path = out_path.with_suffix(".svg")
    svg_path.write_text(to_svg(lines, title), encoding="utf-8")
    # Render at natural size. Forcing a width would upscale narrow captures and
    # produce absurdly tall images.
    subprocess.run(
        ["rsvg-convert", "-o", str(out_path), str(svg_path)],
        check=True,
        capture_output=True,
    )
    svg_path.unlink()


SHOTS = [
    ("setup", ["setup", "--yes", "--no-login"], "claude-media-bridge setup"),
    ("providers", ["providers"], "claude-media-bridge providers"),
    ("status", ["status"], "claude-media-bridge status"),
    ("models", ["models"], "claude-media-bridge models"),
    ("generate", ["generate",
                  "a weathered brass compass on a nautical chart, soft window light",
                  "--provider", "pollinations"], 'claude-media-bridge generate "..."'),
]


def main() -> None:
    repo = Path(__file__).resolve().parent.parent
    cli = str(repo / "bin" / "cli.mjs")
    out_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else repo / "assets" / "screenshots"
    out_dir.mkdir(parents=True, exist_ok=True)

    for name, shot_args, title in SHOTS:
        lines: list[str] = []
        # The keyless FLUX tier is throttled, so a generation shot may need a
        # few attempts before it returns an image.
        for attempt in range(1, 6):
            with tempfile.TemporaryDirectory() as home:
                raw = capture(["node", cli, *shot_args], home)
            lines = raw.split("\n")
            while lines and not lines[-1].strip():
                lines.pop()
            if lines and "failed" not in raw:
                break
            if attempt < 5:
                print(f"  {name}: attempt {attempt} throttled, retrying")
                time.sleep(5)

        if not lines:
            raise SystemExit(f"{name}: no output captured")
        lines = fit(lines)
        render(lines, title, out_dir / f"{name}.png")
        print(f"wrote {out_dir / f'{name}.png'} ({len(lines)} lines)")


if __name__ == "__main__":
    main()