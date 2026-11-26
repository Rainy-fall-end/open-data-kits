"""Credential-safe public exception types."""

from __future__ import annotations


class OpenGovToolsError(Exception):
    """Stable machine-readable failure without request or credential details."""

    def __init__(self, code: str, message: str, *, status_code: int | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code

    def __str__(self) -> str:
        return f"{self.code}: {self.message}"

    def as_dict(self) -> dict[str, object]:
        result: dict[str, object] = {"code": self.code, "message": self.message}
        if self.status_code is not None:
            result["status_code"] = self.status_code
        return result


class SchemaValidationError(OpenGovToolsError):
    def __init__(self, message: str) -> None:
        super().__init__("ARGUMENTS_INVALID", message)


__all__ = ["OpenGovToolsError", "SchemaValidationError"]
