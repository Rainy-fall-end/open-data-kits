"""Validation helpers shared by the SDK and CLI."""

from __future__ import annotations

import json
import math
import re
from collections.abc import Mapping
from decimal import Decimal, InvalidOperation
from typing import Any, Final

from .errors import OpenGovDataError


MAX_ITEMS: Final = 1_000
MIN_TIMEOUT_SECONDS: Final = 0.1
MAX_TIMEOUT_SECONDS: Final = 300.0
MIN_CHARGE_USD: Final = Decimal("0.00005")
MAX_CHARGE_USD: Final = Decimal("100")
MAX_INPUT_BYTES: Final = 1_000_000
MAX_INPUT_DEPTH: Final = 32

_APIFY_TOKEN = re.compile(r"^apify_api_[A-Za-z0-9_-]{12,}$", re.ASCII)
_RAPIDAPI_KEY = re.compile(r"^[A-Za-z0-9_-]{20,256}$", re.ASCII)
_SECRET_KEYS = frozenset(
    {
        "authorization",
        "apikey",
        "apifytoken",
        "credential",
        "password",
        "rapidapikey",
        "secret",
        "token",
        "xrapidapikey",
    }
)


def _fail(code: str, message: str) -> OpenGovDataError:
    return OpenGovDataError(code, message)


def validate_credential(provider: str, value: object) -> str:
    """Validate a provider credential without echoing any portion of it."""

    label = "Apify credential" if provider == "apify" else "RapidAPI credential"
    if not isinstance(value, str) or not value:
        raise _fail("AUTH_MISSING", f"{label} is required")
    if value != value.strip() or any(char.isspace() for char in value):
        raise _fail("AUTH_INVALID", f"{label} has an invalid format")
    pattern = _APIFY_TOKEN if provider == "apify" else _RAPIDAPI_KEY
    if pattern.fullmatch(value) is None:
        raise _fail("AUTH_INVALID", f"{label} has an invalid format")
    return value


def validate_max_items(value: object) -> int:
    """Require an integer row cap in the supported range."""

    if isinstance(value, bool) or not isinstance(value, int):
        raise _fail(
            "MAX_ITEMS_INVALID", f"max_items must be an integer from 1 to {MAX_ITEMS}"
        )
    if value < 1 or value > MAX_ITEMS:
        raise _fail(
            "MAX_ITEMS_INVALID", f"max_items must be an integer from 1 to {MAX_ITEMS}"
        )
    return value


def validate_timeout(value: object) -> float:
    """Validate a urllib timeout expressed in seconds."""

    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise _fail(
            "TIMEOUT_INVALID",
            f"timeout must be from {MIN_TIMEOUT_SECONDS} to {MAX_TIMEOUT_SECONDS} seconds",
        )
    number = float(value)
    if (
        not math.isfinite(number)
        or number < MIN_TIMEOUT_SECONDS
        or number > MAX_TIMEOUT_SECONDS
    ):
        raise _fail(
            "TIMEOUT_INVALID",
            f"timeout must be from {MIN_TIMEOUT_SECONDS} to {MAX_TIMEOUT_SECONDS} seconds",
        )
    return number


def validate_charge(value: object) -> Decimal:
    """Return an exact decimal Apify run cap."""

    if isinstance(value, bool) or not isinstance(value, (str, int, float, Decimal)):
        raise _fail(
            "COST_LIMIT_INVALID",
            f"max_total_charge_usd must be from {MIN_CHARGE_USD} to {MAX_CHARGE_USD}",
        )
    try:
        number = Decimal(str(value))
    except (InvalidOperation, ValueError):
        raise _fail(
            "COST_LIMIT_INVALID",
            f"max_total_charge_usd must be from {MIN_CHARGE_USD} to {MAX_CHARGE_USD}",
        ) from None
    if not number.is_finite() or number < MIN_CHARGE_USD or number > MAX_CHARGE_USD:
        raise _fail(
            "COST_LIMIT_INVALID",
            f"max_total_charge_usd must be from {MIN_CHARGE_USD} to {MAX_CHARGE_USD}",
        )
    return number


def format_charge(value: Decimal) -> str:
    """Format a validated cost cap without exponent notation or extra zeroes."""

    formatted = format(value, "f")
    if "." in formatted:
        formatted = formatted.rstrip("0").rstrip(".")
    return formatted


def _normalized_key(key: str) -> str:
    return re.sub(r"[^a-z0-9]", "", key.casefold())


def _clone_json(value: Any, *, depth: int, active: set[int]) -> Any:
    if depth > MAX_INPUT_DEPTH:
        raise _fail("INPUT_INVALID", "request input is nested too deeply")
    if value is None or isinstance(value, (str, bool, int)):
        return value
    if isinstance(value, float):
        if not math.isfinite(value):
            raise _fail("INPUT_INVALID", "request input contains a non-finite number")
        return value
    if isinstance(value, Mapping):
        identity = id(value)
        if identity in active:
            raise _fail("INPUT_INVALID", "request input must not be cyclic")
        active.add(identity)
        clone: dict[str, Any] = {}
        for key, nested in value.items():
            if not isinstance(key, str):
                raise _fail("INPUT_INVALID", "request input keys must be strings")
            if _normalized_key(key) in _SECRET_KEYS:
                raise _fail(
                    "INPUT_SECRET_FIELD",
                    "request input must not contain credential fields",
                )
            clone[key] = _clone_json(nested, depth=depth + 1, active=active)
        active.remove(identity)
        return clone
    if isinstance(value, (list, tuple)):
        identity = id(value)
        if identity in active:
            raise _fail("INPUT_INVALID", "request input must not be cyclic")
        active.add(identity)
        clone_list = [
            _clone_json(item, depth=depth + 1, active=active) for item in value
        ]
        active.remove(identity)
        return clone_list
    raise _fail("INPUT_INVALID", "request input must contain only JSON values")


def parse_input(value: object | None) -> dict[str, Any]:
    """Parse, validate, and defensively clone an input JSON object."""

    parsed: object | None = value
    if isinstance(value, str):
        if len(value.encode("utf-8")) > MAX_INPUT_BYTES:
            raise _fail("INPUT_INVALID", "request input is too large")
        try:
            parsed = json.loads(value)
        except (json.JSONDecodeError, UnicodeError):
            raise _fail("INPUT_INVALID", "request input must be valid JSON") from None
    if parsed is None:
        return {}
    if not isinstance(parsed, Mapping):
        raise _fail("INPUT_INVALID", "request input must be a JSON object")
    clone = _clone_json(parsed, depth=0, active=set())
    try:
        encoded = json.dumps(
            clone, ensure_ascii=False, allow_nan=False, separators=(",", ":")
        ).encode("utf-8")
    except (TypeError, ValueError, UnicodeError):
        raise _fail("INPUT_INVALID", "request input must contain valid JSON") from None
    if len(encoded) > MAX_INPUT_BYTES:
        raise _fail("INPUT_INVALID", "request input is too large")
    return clone


def rapidapi_query_value(value: object) -> str | None:
    """Serialize one validated RapidAPI query value."""

    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (str, int)):
        return str(value)
    if isinstance(value, float):
        if not math.isfinite(value):
            raise _fail("INPUT_INVALID", "query input contains a non-finite number")
        return str(value)
    if isinstance(value, list):
        parts: list[str] = []
        for item in value:
            if isinstance(item, (list, dict)) or item is None:
                raise _fail(
                    "INPUT_INVALID", "RapidAPI query arrays must contain scalar values"
                )
            serialized = rapidapi_query_value(item)
            if serialized is not None:
                parts.append(serialized)
        return ",".join(parts)
    raise _fail("INPUT_INVALID", "RapidAPI query values must be scalar or arrays")


__all__ = [
    "MAX_CHARGE_USD",
    "MAX_ITEMS",
    "MIN_CHARGE_USD",
    "format_charge",
    "parse_input",
    "rapidapi_query_value",
    "validate_charge",
    "validate_credential",
    "validate_max_items",
    "validate_timeout",
]

