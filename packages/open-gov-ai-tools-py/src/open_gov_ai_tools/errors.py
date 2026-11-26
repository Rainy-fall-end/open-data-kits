"""Public exception types for :mod:`open_gov_ai_tools`."""

from __future__ import annotations

from typing import Final


class OpenGovToolsError(Exception):
    """Base error with a stable, credential-safe machine code."""

    def __init__(
        self,
        code: str,
        message: str,
        *,
        status_code: int | None = None,
    ) -> None:
        super().__init__(message)
        self.code: Final = code
        self.message: Final = message
        self.status_code: Final = status_code

    def __str__(self) -> str:
        return f"{self.code}: {self.message}"

    def as_dict(self) -> dict[str, object]:
        """Return a JSON-safe error without requests, responses, or credentials."""

        result: dict[str, object] = {"code": self.code, "message": self.message}
        if self.status_code is not None:
            result["status_code"] = self.status_code
        return result


class SchemaValidationError(OpenGovToolsError):
    """Raised when model-provided tool arguments fail strict validation."""

    def __init__(self, message: str) -> None:
        super().__init__("ARGUMENTS_INVALID", message)


__all__ = ["OpenGovToolsError", "SchemaValidationError"]
