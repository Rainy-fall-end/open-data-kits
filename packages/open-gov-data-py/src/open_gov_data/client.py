"""Synchronous standard-library client for the supported products."""

from __future__ import annotations

import json
import os
import socket
from collections.abc import Mapping
from dataclasses import dataclass, field
from decimal import Decimal
from http.client import HTTPException
from typing import Any, Final
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit, urlunsplit
from urllib.request import (
    HTTPRedirectHandler,
    OpenerDirector,
    Request,
    build_opener,
)

from .catalog import APIFY_SOURCES, RAPIDAPI_SOURCES
from .errors import OpenGovDataError
from .validation import (
    format_charge,
    parse_input,
    rapidapi_query_value,
    validate_charge,
    validate_credential,
    validate_max_items,
    validate_timeout,
)


APIFY_BASE_URL: Final = "https://api.apify.com"
MAX_RESPONSE_BYTES: Final = 10_000_000
USER_AGENT: Final = "open-gov-data/0.1.0 (Python urllib)"
_LOOPBACK_HOSTS: Final = frozenset({"127.0.0.1", "::1", "localhost"})


class _NoRedirectHandler(HTTPRedirectHandler):
    """Block redirects so authorization headers never cross origins."""

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


def _validate_base_url(value: str, *, production_url: str | None) -> str:
    if not isinstance(value, str):
        raise OpenGovDataError("ENDPOINT_INVALID", "Endpoint base URL is invalid")
    parts = urlsplit(value)
    try:
        port = parts.port
    except ValueError:
        raise OpenGovDataError("ENDPOINT_INVALID", "Endpoint base URL is invalid") from None
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
        raise OpenGovDataError(
            "ENDPOINT_INVALID",
            "Endpoint overrides are restricted to local loopback testing",
        )
    return value.rstrip("/")


def _join_url(base_url: str, path: str, query: Mapping[str, str]) -> str:
    base = urlsplit(base_url)
    return urlunsplit((base.scheme, base.netloc, path, urlencode(query), ""))


def _extract_records(payload: object) -> list[object]:
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


@dataclass(slots=True)
class OpenGovDataClient:
    """Client for four Apify Actors and four RapidAPI REST APIs.

    Credential fields never appear in this object's representation. Endpoint
    overrides are intentionally private and accept loopback origins only; they
    exist solely for offline integration testing.
    """

    apify_token: str | None = field(default=None, repr=False, compare=False)
    rapidapi_key: str | None = field(default=None, repr=False, compare=False)
    max_total_charge_usd: Decimal | str | int | float = Decimal("0.25")
    timeout: float = 30.0
    _apify_base_url: str = field(
        default=APIFY_BASE_URL, repr=False, compare=False, kw_only=True
    )
    _rapidapi_base_url: str | None = field(
        default=None, repr=False, compare=False, kw_only=True
    )
    _opener: OpenerDirector | None = field(
        default=None, repr=False, compare=False, kw_only=True
    )

    def __post_init__(self) -> None:
        self.max_total_charge_usd = validate_charge(self.max_total_charge_usd)
        self.timeout = validate_timeout(self.timeout)
        self._apify_base_url = _validate_base_url(
            self._apify_base_url, production_url=APIFY_BASE_URL
        )
        if self._rapidapi_base_url is not None:
            self._rapidapi_base_url = _validate_base_url(
                self._rapidapi_base_url, production_url=None
            )
        if self.apify_token is not None:
            validate_credential("apify", self.apify_token)
        if self.rapidapi_key is not None:
            validate_credential("rapidapi", self.rapidapi_key)
        if self._opener is None:
            self._opener = build_opener(_NoRedirectHandler())

    @classmethod
    def from_env(
        cls,
        *,
        environ: Mapping[str, str] | None = None,
        max_total_charge_usd: Decimal | str | int | float = Decimal("0.25"),
        timeout: float = 30.0,
    ) -> OpenGovDataClient:
        """Load optional credentials from conventional environment variables."""

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
        )

    def request(
        self,
        provider: str,
        source: str,
        request_input: Mapping[str, Any] | str | None = None,
        *,
        max_items: int = 10,
        max_total_charge_usd: Decimal | str | int | float | None = None,
    ) -> object:
        """Execute one allowlisted request with one attempt and no retries."""

        if not isinstance(provider, str):
            raise OpenGovDataError("PROVIDER_NOT_ALLOWED", "Provider is not allowed")
        if provider == "apify":
            return self.run_actor(
                source,
                request_input,
                max_items=max_items,
                max_total_charge_usd=max_total_charge_usd,
            )
        if provider == "rapidapi":
            if max_total_charge_usd is not None:
                raise OpenGovDataError(
                    "COST_LIMIT_UNSUPPORTED",
                    "RapidAPI does not expose a per-request dollar cap; use max_items",
                )
            return self.query_rapidapi(source, request_input, max_items=max_items)
        raise OpenGovDataError("PROVIDER_NOT_ALLOWED", "Provider is not allowed")

    def run_actor(
        self,
        source: str,
        actor_input: Mapping[str, Any] | str | None = None,
        *,
        max_items: int = 10,
        max_total_charge_usd: Decimal | str | int | float | None = None,
    ) -> object:
        """Run an allowlisted Apify Actor synchronously with a hard USD cap."""

        if not isinstance(source, str):
            raise OpenGovDataError("SOURCE_NOT_ALLOWED", "Source is not allowed")
        definition = APIFY_SOURCES.get(source)
        if definition is None:
            raise OpenGovDataError("SOURCE_NOT_ALLOWED", "Source is not allowed")
        parsed = parse_input(actor_input)
        item_limit = validate_max_items(max_items)
        credential = validate_credential("apify", self.apify_token)
        cap = (
            self.max_total_charge_usd
            if max_total_charge_usd is None
            else validate_charge(max_total_charge_usd)
        )
        if cap > self.max_total_charge_usd:
            raise OpenGovDataError(
                "COST_LIMIT_EXCEEDED",
                "Per-request charge cap cannot exceed the client hard limit",
            )
        parsed.pop("maxItems", None)
        parsed["maxItems"] = item_limit
        body = json.dumps(
            parsed, ensure_ascii=False, allow_nan=False, separators=(",", ":")
        ).encode("utf-8")
        url = _join_url(
            self._apify_base_url,
            f"/v2/acts/{definition.actor_id}/run-sync-get-dataset-items",
            {"maxTotalChargeUsd": format_charge(cap), "clean": "true"},
        )
        request = Request(
            url,
            data=body,
            method="POST",
            headers={
                "Accept": "application/json",
                "Authorization": f"Bearer {credential}",
                "Content-Type": "application/json; charset=utf-8",
                "User-Agent": USER_AGENT,
            },
        )
        return self._fetch_json(request)

    def query_rapidapi(
        self,
        source: str,
        query: Mapping[str, Any] | str | None = None,
        *,
        max_items: int = 10,
    ) -> object:
        """Query an allowlisted RapidAPI route with a hard returned-row cap."""

        if not isinstance(source, str):
            raise OpenGovDataError("SOURCE_NOT_ALLOWED", "Source is not allowed")
        definition = RAPIDAPI_SOURCES.get(source)
        if definition is None:
            raise OpenGovDataError("SOURCE_NOT_ALLOWED", "Source is not allowed")
        parsed = parse_input(query)
        item_limit = validate_max_items(max_items)
        credential = validate_credential("rapidapi", self.rapidapi_key)
        parsed.pop("limit", None)
        parsed.pop("maxItems", None)
        query_values: dict[str, str] = {}
        for key, value in parsed.items():
            serialized = rapidapi_query_value(value)
            if serialized is not None:
                query_values[key] = serialized
        query_values["limit"] = str(item_limit)
        base_url = self._rapidapi_base_url or f"https://{definition.host}"
        url = _join_url(base_url, definition.path, query_values)
        request = Request(
            url,
            method="GET",
            headers={
                "Accept": "application/json",
                "User-Agent": USER_AGENT,
                "X-RapidAPI-Host": definition.host,
                "X-RapidAPI-Key": credential,
            },
        )
        return self._fetch_json(request)

    def records(
        self,
        provider: str,
        source: str,
        request_input: Mapping[str, Any] | str | None = None,
        *,
        max_items: int = 10,
        max_total_charge_usd: Decimal | str | int | float | None = None,
    ) -> list[object]:
        """Execute a request and normalize common response envelopes to a list."""

        return _extract_records(
            self.request(
                provider,
                source,
                request_input,
                max_items=max_items,
                max_total_charge_usd=max_total_charge_usd,
            )
        )

    def _fetch_json(self, request: Request) -> object:
        assert self._opener is not None
        try:
            with self._opener.open(request, timeout=self.timeout) as response:
                status = response.getcode()
                if status == 204:
                    return None
                payload = response.read(MAX_RESPONSE_BYTES + 1)
        except HTTPError as error:
            try:
                error.close()
            finally:
                status = int(error.code)
            raise OpenGovDataError(
                f"HTTP_{status}",
                f"Upstream request failed with HTTP {status}",
                status_code=status,
            ) from None
        except (TimeoutError, socket.timeout):
            raise OpenGovDataError("TIMEOUT", "Upstream request timed out") from None
        except URLError as error:
            if isinstance(error.reason, (TimeoutError, socket.timeout)):
                raise OpenGovDataError(
                    "TIMEOUT", "Upstream request timed out"
                ) from None
            raise OpenGovDataError(
                "NETWORK_ERROR", "Upstream network request failed"
            ) from None
        except (HTTPException, OSError, ValueError):
            raise OpenGovDataError(
                "NETWORK_ERROR", "Upstream network request failed"
            ) from None
        if len(payload) > MAX_RESPONSE_BYTES:
            raise OpenGovDataError(
                "RESPONSE_TOO_LARGE", "Upstream response exceeded the size limit"
            )
        if not payload:
            return None
        try:
            return json.loads(payload.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise OpenGovDataError(
                "RESPONSE_INVALID", "Upstream returned invalid JSON"
            ) from None


extract_records = _extract_records

__all__ = ["APIFY_BASE_URL", "OpenGovDataClient", "extract_records"]
