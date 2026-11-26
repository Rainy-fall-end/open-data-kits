"""Hardened zero-dependency executor for the closed tool catalog."""

from __future__ import annotations

import json
import math
import os
import re
import socket
from collections.abc import Mapping
from decimal import Decimal, InvalidOperation
from http.client import HTTPException
from typing import Any, Final
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit, urlunsplit
from urllib.request import HTTPRedirectHandler, OpenerDirector, Request, build_opener

from .catalog import ToolDefinition, build_catalog
from .errors import OpenGovToolsError
from .exports import (
    DEFAULT_MAX_TOTAL_CHARGE_USD,
    catalog_snapshot,
    export_anthropic_tools,
    export_gemini_function_declarations,
    export_gemini_tools,
    export_openai_tools,
)
from .validation import parse_arguments, validate_tool_arguments


APIFY_BASE_URL: Final = "https://api.apify.com"
DEFAULT_MAX_RESPONSE_BYTES: Final = 2_000_000
MAX_CONFIGURED_RESPONSE_BYTES: Final = 10_000_000
USER_AGENT: Final = "open-gov-ai-tools/0.1.0 (Python urllib)"
_LOOPBACK_HOSTS: Final = frozenset({"127.0.0.1", "::1", "localhost"})
_APIFY_TOKEN: Final = re.compile(r"^apify_api_[A-Za-z0-9_-]{12,}$", re.ASCII)
_RAPIDAPI_KEY: Final = re.compile(r"^[A-Za-z0-9_-]{20,256}$", re.ASCII)


class _NoRedirectHandler(HTTPRedirectHandler):
    """Turn every redirect into an HTTPError without forwarding credentials."""

    def redirect_request(
        self,
        req: Request,
        fp: Any,
        code: int,
        msg: str,
        headers: Any,
        newurl: str,
    ) -> None:
        return None


def _validate_credential(provider: str, value: object) -> str:
    label = "Apify credential" if provider == "apify" else "RapidAPI credential"
    if not isinstance(value, str) or not value:
        raise OpenGovToolsError("AUTH_MISSING", f"{label} is required")
    if value != value.strip() or any(character.isspace() for character in value):
        raise OpenGovToolsError("AUTH_INVALID", f"{label} has an invalid format")
    pattern = _APIFY_TOKEN if provider == "apify" else _RAPIDAPI_KEY
    if pattern.fullmatch(value) is None:
        raise OpenGovToolsError("AUTH_INVALID", f"{label} has an invalid format")
    return value


def _parse_charge(value: object) -> Decimal:
    if isinstance(value, bool) or not isinstance(value, (Decimal, str, int, float)):
        raise OpenGovToolsError(
            "COST_LIMIT_INVALID",
            "max_total_charge_usd must be a positive decimal with at most 6 decimal places",
        )
    try:
        number = Decimal(str(value))
    except (InvalidOperation, ValueError):
        raise OpenGovToolsError(
            "COST_LIMIT_INVALID",
            "max_total_charge_usd must be a positive decimal with at most 6 decimal places",
        ) from None
    if (
        not number.is_finite()
        or number <= 0
        or number > Decimal("100")
        or number.as_tuple().exponent < -6
    ):
        raise OpenGovToolsError(
            "COST_LIMIT_INVALID",
            "max_total_charge_usd must be greater than 0, no more than 100, and use at most 6 decimals",
        )
    return number


def _format_charge(value: Decimal) -> str:
    formatted = format(value, "f")
    return formatted.rstrip("0").rstrip(".") if "." in formatted else formatted


def _validate_timeout(value: object) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise OpenGovToolsError("TIMEOUT_INVALID", "timeout must be from 0.1 to 300 seconds")
    timeout = float(value)
    if not math.isfinite(timeout) or timeout < 0.1 or timeout > 300:
        raise OpenGovToolsError("TIMEOUT_INVALID", "timeout must be from 0.1 to 300 seconds")
    return timeout


def _validate_response_limit(value: object) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise OpenGovToolsError(
            "RESPONSE_LIMIT_INVALID",
            f"max_response_bytes must be from 1 to {MAX_CONFIGURED_RESPONSE_BYTES}",
        )
    if value < 1 or value > MAX_CONFIGURED_RESPONSE_BYTES:
        raise OpenGovToolsError(
            "RESPONSE_LIMIT_INVALID",
            f"max_response_bytes must be from 1 to {MAX_CONFIGURED_RESPONSE_BYTES}",
        )
    return value


def _validate_base_url(value: str, *, production_url: str | None) -> str:
    if not isinstance(value, str):
        raise OpenGovToolsError("ENDPOINT_INVALID", "Endpoint base URL is invalid")
    parts = urlsplit(value)
    try:
        port = parts.port
    except ValueError:
        raise OpenGovToolsError("ENDPOINT_INVALID", "Endpoint base URL is invalid") from None
    is_production = production_url is not None and value.rstrip("/") == production_url
    is_loopback = (
        parts.scheme in {"http", "https"}
        and parts.hostname in _LOOPBACK_HOSTS
        and port is not None
    )
    if (
        (not is_production and not is_loopback)
        or parts.username is not None
        or parts.password is not None
        or parts.query
        or parts.fragment
        or parts.path not in {"", "/"}
    ):
        raise OpenGovToolsError(
            "ENDPOINT_INVALID",
            "Endpoint overrides are restricted to local loopback testing",
        )
    return value.rstrip("/")


def _url(base_url: str, path: str, query: Mapping[str, str]) -> str:
    base = urlsplit(base_url)
    return urlunsplit((base.scheme, base.netloc, path, urlencode(query), ""))


def extract_records(payload: object) -> list[object]:
    """Normalize common upstream envelopes to a record list."""

    if isinstance(payload, list):
        return list(payload)
    if isinstance(payload, dict):
        for key in ("items", "results", "records", "data"):
            value = payload.get(key)
            if isinstance(value, list):
                return list(value)
        return [payload]
    if payload is None:
        return []
    return [{"value": payload}]


class ToolDispatcher:
    """Execute only the eight allowlisted tools with fixed security limits.

    Credentials are stored in private attributes, omitted from ``repr``, never
    placed in request URLs, and never copied into result or error payloads.
    Endpoint overrides are private test hooks restricted to local loopback hosts.
    """

    __slots__ = (
        "_apify_base_url",
        "_apify_token",
        "_catalog",
        "_definitions",
        "_hard_charge_cap",
        "_max_response_bytes",
        "_opener",
        "_rapidapi_base_url",
        "_rapidapi_key",
        "_timeout",
    )

    def __init__(
        self,
        *,
        apify_token: str | None = None,
        rapidapi_key: str | None = None,
        max_total_charge_usd: Decimal | str | int | float = DEFAULT_MAX_TOTAL_CHARGE_USD,
        timeout: float = 30.0,
        max_response_bytes: int = DEFAULT_MAX_RESPONSE_BYTES,
        _apify_base_url: str = APIFY_BASE_URL,
        _rapidapi_base_url: str | None = None,
        _opener: OpenerDirector | None = None,
    ) -> None:
        self._hard_charge_cap = _parse_charge(max_total_charge_usd)
        self._timeout = _validate_timeout(timeout)
        self._max_response_bytes = _validate_response_limit(max_response_bytes)
        self._apify_base_url = _validate_base_url(
            _apify_base_url,
            production_url=APIFY_BASE_URL,
        )
        self._rapidapi_base_url = (
            None
            if _rapidapi_base_url is None
            else _validate_base_url(_rapidapi_base_url, production_url=None)
        )
        if apify_token is not None:
            _validate_credential("apify", apify_token)
        if rapidapi_key is not None:
            _validate_credential("rapidapi", rapidapi_key)
        self._apify_token = apify_token
        self._rapidapi_key = rapidapi_key
        definitions = build_catalog(self._hard_charge_cap)
        self._catalog = definitions
        self._definitions = {definition.name: definition for definition in definitions}
        self._opener = _opener or build_opener(_NoRedirectHandler())

    @classmethod
    def from_env(
        cls,
        *,
        environ: Mapping[str, str] | None = None,
        max_total_charge_usd: Decimal | str | int | float = DEFAULT_MAX_TOTAL_CHARGE_USD,
        timeout: float = 30.0,
        max_response_bytes: int = DEFAULT_MAX_RESPONSE_BYTES,
    ) -> "ToolDispatcher":
        """Load credentials from environment variables without logging them."""

        values = os.environ if environ is None else environ
        rapidapi_key = (
            values.get("RAPIDAPI_KEY")
            or values.get("X_RAPIDAPI_KEY")
            or values.get("X-RapidAPI-Key")
        )
        return cls(
            apify_token=values.get("APIFY_TOKEN"),
            rapidapi_key=rapidapi_key,
            max_total_charge_usd=max_total_charge_usd,
            timeout=timeout,
            max_response_bytes=max_response_bytes,
        )

    def __repr__(self) -> str:
        return (
            "ToolDispatcher("
            f"apify_configured={self._apify_token is not None}, "
            f"rapidapi_configured={self._rapidapi_key is not None}, "
            f"max_total_charge_usd='{self.max_total_charge_usd}', "
            f"timeout={self._timeout}, max_response_bytes={self._max_response_bytes})"
        )

    @property
    def max_total_charge_usd(self) -> Decimal:
        """The immutable per-dispatcher Apify charge ceiling."""

        return self._hard_charge_cap

    def catalog(self) -> list[dict[str, Any]]:
        return catalog_snapshot(_catalog=self._catalog)

    def openai_tools(self, *, style: str = "chat_completions") -> list[dict[str, Any]]:
        return export_openai_tools(style=style, _catalog=self._catalog)

    def anthropic_tools(self) -> list[dict[str, Any]]:
        return export_anthropic_tools(_catalog=self._catalog)

    def gemini_function_declarations(self) -> list[dict[str, Any]]:
        return export_gemini_function_declarations(_catalog=self._catalog)

    def gemini_tools(self) -> list[dict[str, Any]]:
        return export_gemini_tools(_catalog=self._catalog)

    def validate(
        self,
        tool_name: str,
        arguments: Mapping[str, Any] | str | None,
    ) -> dict[str, Any]:
        """Strictly validate and default arguments without making a request."""

        definition = self._definition(tool_name)
        parsed = parse_arguments(arguments)
        if definition.provider == "apify" and "maxTotalChargeUsd" in parsed:
            requested = _parse_charge(parsed["maxTotalChargeUsd"])
            if requested > self._hard_charge_cap:
                raise OpenGovToolsError(
                    "COST_LIMIT_EXCEEDED",
                    "Requested Apify charge cap exceeds the dispatcher hard limit",
                )
        return validate_tool_arguments(parsed, definition.parameters)

    def dispatch(
        self,
        tool_name: str,
        arguments: Mapping[str, Any] | str | None = None,
    ) -> dict[str, Any]:
        """Validate and execute one tool once; paid calls are never retried."""

        definition = self._definition(tool_name)
        validated = self.validate(tool_name, arguments)
        if definition.provider == "apify":
            return self._run_apify(definition, validated)
        if definition.provider == "rapidapi":
            return self._query_rapidapi(definition, validated)
        raise OpenGovToolsError("INTERNAL_ERROR", "Tool provider is invalid")

    def records(
        self,
        tool_name: str,
        arguments: Mapping[str, Any] | str | None = None,
    ) -> list[object]:
        return extract_records(self.dispatch(tool_name, arguments)["data"])

    def _definition(self, tool_name: object) -> ToolDefinition:
        if not isinstance(tool_name, str):
            raise OpenGovToolsError("TOOL_NOT_ALLOWED", "Tool is not allowlisted")
        definition = self._definitions.get(tool_name)
        if definition is None:
            raise OpenGovToolsError("TOOL_NOT_ALLOWED", "Tool is not allowlisted")
        return definition

    def _run_apify(
        self,
        definition: ToolDefinition,
        arguments: dict[str, Any],
    ) -> dict[str, Any]:
        credential = _validate_credential("apify", self._apify_token)
        actor_id = definition.actor_id
        assert actor_id is not None
        actor_input = dict(arguments)
        charge = _parse_charge(actor_input.pop("maxTotalChargeUsd"))
        if charge > self._hard_charge_cap:
            raise OpenGovToolsError(
                "COST_LIMIT_EXCEEDED",
                "Requested Apify charge cap exceeds the dispatcher hard limit",
            )
        body = json.dumps(
            actor_input,
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":"),
        ).encode("utf-8")
        request_url = _url(
            self._apify_base_url,
            f"/v2/acts/{actor_id}/run-sync-get-dataset-items",
            {"maxTotalChargeUsd": _format_charge(charge), "clean": "true"},
        )
        request = Request(
            request_url,
            data=body,
            method="POST",
            headers={
                "Accept": "application/json",
                "Accept-Encoding": "identity",
                "Authorization": f"Bearer {credential}",
                "Content-Type": "application/json; charset=utf-8",
                "User-Agent": USER_AGENT,
            },
        )
        data = self._fetch_json(request)
        return {
            "tool_name": definition.name,
            "provider": definition.provider,
            "source": definition.source,
            "actor_id": actor_id,
            "max_total_charge_usd": _format_charge(charge),
            "data": data,
        }

    def _query_rapidapi(
        self,
        definition: ToolDefinition,
        arguments: dict[str, Any],
    ) -> dict[str, Any]:
        credential = _validate_credential("rapidapi", self._rapidapi_key)
        assert definition.host is not None
        assert definition.path is not None
        assert definition.api_slug is not None
        base_url = self._rapidapi_base_url or f"https://{definition.host}"
        query = {key: str(value) for key, value in arguments.items()}
        request_url = _url(base_url, definition.path, query)
        request = Request(
            request_url,
            method="GET",
            headers={
                "Accept": "application/json",
                "Accept-Encoding": "identity",
                "User-Agent": USER_AGENT,
                "X-RapidAPI-Host": definition.host,
                "X-RapidAPI-Key": credential,
            },
        )
        data = self._fetch_json(request)
        return {
            "tool_name": definition.name,
            "provider": definition.provider,
            "source": definition.source,
            "api_slug": definition.api_slug,
            "data": data,
        }

    def _fetch_json(self, request: Request) -> object:
        try:
            with self._opener.open(request, timeout=self._timeout) as response:
                status = response.getcode()
                if status == 204:
                    return None
                length = response.headers.get("Content-Length")
                if length is not None and length.isdigit() and int(length) > self._max_response_bytes:
                    raise OpenGovToolsError(
                        "RESPONSE_TOO_LARGE",
                        "Upstream response exceeded the configured size limit",
                    )
                payload = response.read(self._max_response_bytes + 1)
        except HTTPError as error:
            status = int(error.code)
            error.close()
            if 300 <= status < 400:
                raise OpenGovToolsError(
                    "REDIRECT_BLOCKED",
                    "Upstream redirect was blocked",
                    status_code=status,
                ) from None
            raise OpenGovToolsError(
                f"HTTP_{status}",
                f"Upstream request failed with HTTP {status}",
                status_code=status,
            ) from None
        except OpenGovToolsError:
            raise
        except (TimeoutError, socket.timeout):
            raise OpenGovToolsError("TIMEOUT", "Upstream request timed out") from None
        except URLError as error:
            if isinstance(error.reason, (TimeoutError, socket.timeout)):
                raise OpenGovToolsError("TIMEOUT", "Upstream request timed out") from None
            raise OpenGovToolsError(
                "NETWORK_ERROR",
                "Upstream network request failed",
            ) from None
        except (HTTPException, OSError, ValueError):
            raise OpenGovToolsError(
                "NETWORK_ERROR",
                "Upstream network request failed",
            ) from None
        if len(payload) > self._max_response_bytes:
            raise OpenGovToolsError(
                "RESPONSE_TOO_LARGE",
                "Upstream response exceeded the configured size limit",
            )
        if not payload:
            return None
        try:
            return json.loads(payload.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise OpenGovToolsError(
                "RESPONSE_INVALID",
                "Upstream returned invalid JSON",
            ) from None


__all__ = [
    "APIFY_BASE_URL",
    "DEFAULT_MAX_RESPONSE_BYTES",
    "ToolDispatcher",
    "extract_records",
]
