"""Offline JSON schema export CLI."""

from __future__ import annotations

import argparse
import json
from collections.abc import Sequence

from .exports import (
    catalog_snapshot,
    export_anthropic_tools,
    export_gemini_function_declarations,
    export_gemini_tools,
    export_openai_tools,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="open-gov-ai-tools",
        description="Export exactly twelve allowlisted public-data tools as JSON.",
    )
    parser.add_argument(
        "format",
        choices=(
            "openai",
            "openai-responses",
            "anthropic",
            "gemini",
            "gemini-tools",
            "catalog",
        ),
    )
    parser.add_argument(
        "--max-total-charge-usd",
        default="0.25",
        help="Fixed Apify hard cap embedded in schemas (default: 0.25).",
    )
    parser.add_argument("--compact", action="store_true", help="Emit compact JSON.")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    options = {"max_total_charge_usd": args.max_total_charge_usd}
    if args.format == "openai":
        value = export_openai_tools(**options)
    elif args.format == "openai-responses":
        value = export_openai_tools(style="responses", **options)
    elif args.format == "anthropic":
        value = export_anthropic_tools(**options)
    elif args.format == "gemini":
        value = export_gemini_function_declarations(**options)
    elif args.format == "gemini-tools":
        value = export_gemini_tools(**options)
    else:
        value = catalog_snapshot(**options)
    separators = (",", ":") if args.compact else None
    print(json.dumps(value, ensure_ascii=False, indent=None if args.compact else 2, separators=separators))
    return 0


__all__ = ["build_parser", "main"]

