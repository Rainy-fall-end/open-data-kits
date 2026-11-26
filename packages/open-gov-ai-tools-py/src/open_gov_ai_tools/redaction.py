"""Recursive secret redaction for logs, diagnostics, and RAG payloads."""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from typing import Any, Final


REDACTED: Final = "[REDACTED]"
_SECRET_KEY: Final = re.compile(
    r"^(?:api[-_]?key|apify[-_]?token|authorization|credential|password|"
    r"rapidapi[-_]?key|secret|token|x[-_]?rapidapi[-_]?key)$",
    re.IGNORECASE,
)
_APIFY_VALUE: Final = re.compile(r"apify_api_[A-Za-z0-9_-]{12,}")
_BEARER_VALUE: Final = re.compile(r"(?i)\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}")
_ASSIGNED_SECRET: Final = re.compile(
    r"(?i)(\b(?:api[-_]?key|token|secret|password|authorization)\b\s*[:=]\s*)"
    r"([^\s,;]+)"
)


def redact_text(text: str, *, secrets: Sequence[str] = ()) -> str:
    """Redact recognizable credentials plus caller-supplied exact secrets."""

    result = text
    for secret in sorted((item for item in secrets if item), key=len, reverse=True):
        result = result.replace(secret, REDACTED)
    result = _APIFY_VALUE.sub(REDACTED, result)
    result = _BEARER_VALUE.sub(lambda match: f"{match.group(1)} {REDACTED}", result)
    result = _ASSIGNED_SECRET.sub(lambda match: f"{match.group(1)}{REDACTED}", result)
    return result


def redact_secrets(value: Any, *, secrets: Sequence[str] = ()) -> Any:
    """Return a JSON-like clone with secret fields and values redacted."""

    if isinstance(value, str):
        return redact_text(value, secrets=secrets)
    if isinstance(value, Mapping):
        return {
            str(key): (
                REDACTED
                if _SECRET_KEY.fullmatch(str(key))
                else redact_secrets(item, secrets=secrets)
            )
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [redact_secrets(item, secrets=secrets) for item in value]
    if isinstance(value, tuple):
        return tuple(redact_secrets(item, secrets=secrets) for item in value)
    return value


__all__ = ["REDACTED", "redact_secrets", "redact_text"]
