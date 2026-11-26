"""Stable, credential-safe SDK exceptions."""

from __future__ import annotations

from typing import Any


class OpenGovDataError(Exception):
    """An expected SDK failure whose message is safe to display.

    Upstream response bodies and underlying exception strings are deliberately
    excluded so reflected credentials cannot escape through ``str(error)``.
    """

    def __init__(
        self, code: str, message: str, *, status_code: int | None = None
    ) -> None:
        super().__init__(message)
        self.code = code
        self.status_code = status_code

    def as_dict(self) -> dict[str, Any]:
        value: dict[str, Any] = {"code": self.code, "message": str(self)}
        if self.status_code is not None:
            value["status_code"] = self.status_code
        return value


def safe_error(error: BaseException) -> dict[str, Any]:
    """Convert any exception to a safe public error object."""

    if isinstance(error, OpenGovDataError):
        return error.as_dict()
    return {
        "code": "UNKNOWN_ERROR",
        "message": "Open Gov Data request failed",
    }


__all__ = ["OpenGovDataError", "safe_error"]

