"""Command-line interface for open-gov-data."""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from typing import Any

from .catalog import APIFY_SOURCES, RAPIDAPI_SOURCES, catalog_dict
from .client import OpenGovDataClient
from .errors import OpenGovDataError, safe_error


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="open-gov-data",
        description="Query allowlisted public government-data products.",
    )
    parser.add_argument("--version", action="version", version="%(prog)s 0.1.0")
    subparsers = parser.add_subparsers(dest="command", required=True)

    catalog = subparsers.add_parser("catalog", help="show the closed source catalog")
    catalog.add_argument("--compact", action="store_true", help="emit compact JSON")

    apify = subparsers.add_parser("apify", help="run an allowlisted Apify Actor")
    apify.add_argument("source", choices=tuple(APIFY_SOURCES))
    apify.add_argument(
        "--input-json", default="{}", help="Actor input as one JSON object"
    )
    apify.add_argument("--max-items", type=int, default=10)
    apify.add_argument("--max-total-charge-usd", default="0.25")
    apify.add_argument("--timeout", type=float, default=30.0, help="seconds")
    apify.add_argument("--compact", action="store_true", help="emit compact JSON")

    rapidapi = subparsers.add_parser(
        "rapidapi", help="query an allowlisted RapidAPI REST API"
    )
    rapidapi.add_argument("source", choices=tuple(RAPIDAPI_SOURCES))
    rapidapi.add_argument(
        "--input-json", default="{}", help="query parameters as one JSON object"
    )
    rapidapi.add_argument("--max-items", type=int, default=10)
    rapidapi.add_argument("--timeout", type=float, default=30.0, help="seconds")
    rapidapi.add_argument("--compact", action="store_true", help="emit compact JSON")
    return parser


def _write_json(stream: Any, value: object, *, compact: bool) -> None:
    options: dict[str, Any] = {"ensure_ascii": False, "sort_keys": True}
    if compact:
        options["separators"] = (",", ":")
    else:
        options["indent"] = 2
    stream.write(json.dumps(value, **options))
    stream.write("\n")


def main(argv: Sequence[str] | None = None) -> int:
    """Run the CLI, returning a process exit code."""

    args = _parser().parse_args(argv)
    try:
        if args.command == "catalog":
            _write_json(sys.stdout, catalog_dict(), compact=args.compact)
            return 0
        if args.command == "apify":
            client = OpenGovDataClient.from_env(
                max_total_charge_usd=args.max_total_charge_usd,
                timeout=args.timeout,
            )
            result = client.run_actor(
                args.source,
                args.input_json,
                max_items=args.max_items,
            )
        else:
            client = OpenGovDataClient.from_env(timeout=args.timeout)
            result = client.query_rapidapi(
                args.source,
                args.input_json,
                max_items=args.max_items,
            )
        _write_json(sys.stdout, result, compact=args.compact)
        return 0
    except OpenGovDataError as error:
        _write_json(sys.stderr, safe_error(error), compact=True)
        return 2
    except (BrokenPipeError, KeyboardInterrupt):
        return 130
    except Exception as error:  # defensive CLI boundary; details stay private
        _write_json(sys.stderr, safe_error(error), compact=True)
        return 1


__all__ = ["main"]

