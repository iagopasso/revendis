#!/usr/bin/env python3
"""
Extracts product candidates from a Natura magazine PDF.
Output is JSON on stdout:
{
  "data": [{ "code": "...", "name": "...", "price": 0.0, "page": 1 }, ...],
  "meta": { ... }
}
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List


def _bootstrap_and_reexec_if_needed() -> None:
    try:
        import pypdf  # noqa: F401
        return
    except ModuleNotFoundError:
        pass

    script_path = Path(__file__).resolve()
    venv_dir = script_path.parent / ".natura-magazine-venv"
    if os.name == "nt":
        py_bin = venv_dir / "Scripts" / "python.exe"
    else:
        py_bin = venv_dir / "bin" / "python"

    running_inside_venv = Path(sys.prefix).resolve() == venv_dir.resolve()
    if not running_inside_venv:
        if not py_bin.exists():
            subprocess.run([sys.executable, "-m", "venv", str(venv_dir)], check=True)
            subprocess.run(
                [str(py_bin), "-m", "pip", "install", "--quiet", "pypdf"],
                check=True,
            )
        os.execv(str(py_bin), [str(py_bin), str(script_path), *sys.argv[1:]])

    subprocess.run([sys.executable, "-m", "pip", "install", "--quiet", "pypdf"], check=True)
    os.execv(str(py_bin), [str(py_bin), str(script_path), *sys.argv[1:]])


_bootstrap_and_reexec_if_needed()

from pypdf import PdfReader  # type: ignore  # noqa: E402


CODE_RE = re.compile(r"\((\d[\d\s]{3,10})\)")
PRICE_BRL_RE = re.compile(r"R\$\s*(\d{1,3}(?:\.\d{3})*|\d+)\s*,\s*(\d{2})")
PRICE_LOOSE_RE = re.compile(r"(?<!\d)(\d{1,3}(?:\.\d{3})*|\d+)\s*,\s*(\d{2})(?!\d)")
SPACES_RE = re.compile(r"\s+")
NAME_NOISE_RE = re.compile(
    r"(?:\bde\s*R\$.*$|\beconomize\b.*$|\bna compra\b.*$|\bdurante o ciclo\b.*$)",
    re.IGNORECASE,
)


def normalize_spaces(value: str) -> str:
    return SPACES_RE.sub(" ", value).strip()


def parse_brl_price(integer_part: str, decimal_part: str) -> float:
    raw = integer_part.replace(".", "") + "." + decimal_part
    return float(raw)


def extract_nearest_price(context: str, code_offset: int) -> float | None:
    best_distance: int | None = None
    best_value: float | None = None

    for match in PRICE_BRL_RE.finditer(context):
        value = parse_brl_price(match.group(1), match.group(2))
        distance = abs(match.start() - code_offset)
        if best_distance is None or distance < best_distance:
            best_distance = distance
            best_value = value

    if best_value is not None:
        return best_value

    for match in PRICE_LOOSE_RE.finditer(context):
        value = parse_brl_price(match.group(1), match.group(2))
        if value < 1 or value > 5000:
            continue
        distance = abs(match.start() - code_offset)
        if best_distance is None or distance < best_distance:
            best_distance = distance
            best_value = value

    return best_value


def extract_candidate_name(left_context: str) -> str | None:
    candidate = normalize_spaces(left_context[-220:])
    if not candidate:
        return None

    candidate = NAME_NOISE_RE.sub("", candidate)
    candidate = re.sub(r"^\d+\.\s*", "", candidate)
    candidate = candidate.strip(" -.,;:")
    candidate = normalize_spaces(candidate)

    if not candidate:
        return None

    # Keep the tail where the product label usually appears.
    if len(candidate) > 120:
        candidate = candidate[-120:]
        candidate = candidate.lstrip(" -.,;:")

    # Avoid obvious non-name fragments.
    if candidate.lower().startswith("r$"):
        return None

    letters_count = len(re.findall(r"[A-Za-zÀ-ÿ]", candidate))
    if letters_count < 4:
        return None

    return candidate


def score_candidate(name: str | None, price: float | None) -> float:
    score = 0.0
    if price is not None:
        score += 3.0
    if name:
        score += min(len(name), 100) / 50.0
        if "REFIL REFIL" in name.upper():
            score -= 0.5
    return score


def extract_products(pdf_path: Path, limit: int) -> Dict[str, Any]:
    reader = PdfReader(str(pdf_path))
    deduped: Dict[str, Dict[str, Any]] = {}
    scanned_hits = 0

    for page_idx, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        if not text.strip():
            continue

        for match in CODE_RE.finditer(text):
            scanned_hits += 1
            raw_code = match.group(1)
            code = "".join(ch for ch in raw_code if ch.isdigit())
            if len(code) < 4 or len(code) > 8:
                continue

            left_start = max(0, match.start() - 260)
            right_end = min(len(text), match.end() + 240)
            left = text[left_start : match.start()]
            context = text[left_start:right_end]
            local_code_offset = match.start() - left_start

            name = extract_candidate_name(left)
            price = extract_nearest_price(context, local_code_offset)
            score = score_candidate(name, price)

            previous = deduped.get(code)
            if previous and previous.get("_score", 0.0) >= score:
                continue

            deduped[code] = {
                "code": code,
                "name": name,
                "price": price,
                "page": page_idx,
                "_score": score,
            }

    items = sorted(deduped.values(), key=lambda item: item["code"])
    if limit > 0:
        items = items[:limit]

    for item in items:
        item.pop("_score", None)

    return {
        "data": items,
        "meta": {
            "totalPages": len(reader.pages),
            "matchesScanned": scanned_hits,
            "uniqueCodes": len(deduped),
            "returned": len(items),
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract Natura magazine products from PDF")
    parser.add_argument("--pdf", required=True, help="Absolute or relative path to the PDF file")
    parser.add_argument("--limit", type=int, default=10000, help="Maximum number of items to return")
    args = parser.parse_args()

    pdf_path = Path(args.pdf).expanduser().resolve()
    if not pdf_path.exists() or not pdf_path.is_file():
        print(
            json.dumps(
                {
                    "error": "pdf_not_found",
                    "message": f"PDF file not found: {pdf_path}",
                }
            )
        )
        return 2

    try:
        payload = extract_products(pdf_path, max(1, int(args.limit)))
        print(json.dumps(payload, ensure_ascii=False))
        return 0
    except Exception as exc:  # pragma: no cover - defensive for runtime failures
        print(
            json.dumps(
                {
                    "error": "magazine_parse_failed",
                    "message": str(exc),
                }
            )
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
