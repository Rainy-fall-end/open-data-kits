"""RAG-ready record formatting with per-record official provenance."""

from __future__ import annotations

import copy
import hashlib
import json
from collections.abc import Mapping, Sequence
from decimal import Decimal
from typing import Any
from urllib.parse import urlsplit

from .catalog import ToolDefinition, build_catalog
from .dispatcher import extract_records
from .errors import OpenGovToolsError
from .exports import DEFAULT_MAX_TOTAL_CHARGE_USD


def _host_allowed(url: object, allowed_hosts: tuple[str, ...]) -> bool:
    if not isinstance(url, str) or not url:
        return False
    try:
        parts = urlsplit(url)
        hostname = (parts.hostname or "").casefold()
        port = parts.port
    except ValueError:
        return False
    if parts.scheme not in {"http", "https"} or not hostname:
        return False
    if parts.username is not None or parts.password is not None or port is not None:
        return False
    return any(hostname == host or hostname.endswith(f".{host}") for host in allowed_hosts)


def _license_host(policy_url: str) -> tuple[str, ...]:
    hostname = (urlsplit(policy_url).hostname or "").casefold()
    return (hostname,) if hostname else ()


def _first_official_url(
    record: Mapping[str, Any],
    fields: tuple[str, ...],
    allowed_hosts: tuple[str, ...],
    fallback: str,
) -> str:
    for field in fields:
        candidate = record.get(field)
        if _host_allowed(candidate, allowed_hosts):
            return candidate
    return fallback


def _first_text(record: Mapping[str, Any], fields: tuple[str, ...]) -> str | None:
    for field in fields:
        candidate = record.get(field)
        if isinstance(candidate, (str, int)) and not isinstance(candidate, bool):
            text = str(candidate).strip()
            if text:
                return text
    return None


class ProvenanceFormatter:
    """Format upstream records for vector stores without dropping citations."""

    __slots__ = ("_definitions",)

    def __init__(
        self,
        *,
        max_total_charge_usd: Decimal | str | int | float = DEFAULT_MAX_TOTAL_CHARGE_USD,
        _catalog: Sequence[ToolDefinition] | None = None,
    ) -> None:
        definitions = tuple(_catalog or build_catalog(Decimal(str(max_total_charge_usd))))
        self._definitions = {definition.name: definition for definition in definitions}

    def format_records(
        self,
        tool_name: str,
        payload: object,
    ) -> list[dict[str, Any]]:
        """Return deterministic RAG documents with per-record source/licence fields."""

        definition = self._definition(tool_name)
        if (
            isinstance(payload, dict)
            and payload.get("tool_name") == tool_name
            and "data" in payload
        ):
            payload = payload["data"]
        return [
            self._format_record(definition, record, index)
            for index, record in enumerate(extract_records(payload))
        ]

    def format_dispatch_result(self, result: Mapping[str, Any]) -> list[dict[str, Any]]:
        """Format a result envelope returned by :class:`ToolDispatcher`."""

        tool_name = result.get("tool_name")
        if not isinstance(tool_name, str) or "data" not in result:
            raise OpenGovToolsError(
                "RESULT_INVALID",
                "Dispatcher result must contain tool_name and data",
            )
        return self.format_records(tool_name, result)

    def _definition(self, tool_name: object) -> ToolDefinition:
        if not isinstance(tool_name, str) or tool_name not in self._definitions:
            raise OpenGovToolsError("TOOL_NOT_ALLOWED", "Tool is not allowlisted")
        return self._definitions[tool_name]

    def _format_record(
        self,
        definition: ToolDefinition,
        raw_record: object,
        index: int,
    ) -> dict[str, Any]:
        record: dict[str, Any]
        if isinstance(raw_record, dict):
            record = copy.deepcopy(raw_record)
        else:
            record = {"value": copy.deepcopy(raw_record)}
        policy = definition.provenance
        source_url = _first_official_url(
            record,
            policy.source_url_fields,
            policy.allowed_source_hosts,
            policy.source_url,
        )
        record_license_url = record.get("licenceUrl", record.get("licenseUrl"))
        license_url = (
            record_license_url
            if _host_allowed(record_license_url, _license_host(policy.license_url))
            else policy.license_url
        )
        record_license_name = record.get("licenceName", record.get("licenseName"))
        license_name = (
            record_license_name.strip()
            if isinstance(record_license_name, str) and record_license_name.strip()
            else policy.license_name
        )
        record_attribution = record.get("attribution")
        attribution = (
            record_attribution.strip()
            if isinstance(record_attribution, str) and record_attribution.strip()
            else policy.attribution
        )
        text = json.dumps(
            record,
            ensure_ascii=False,
            sort_keys=True,
            allow_nan=False,
            separators=(",", ":"),
        )
        identifier = _first_text(record, policy.identifier_fields)
        if identifier is None:
            digest = hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]
            identifier = f"{definition.name}:{index}:{digest}"
        metadata = {
            "tool_name": definition.name,
            "provider": definition.provider,
            "source": definition.source,
            "publisher": policy.publisher,
            "source_url": source_url,
            "license_name": license_name,
            "license_url": license_url,
            "attribution": attribution,
        }
        return {
            "id": identifier,
            "text": text,
            "metadata": metadata,
            "record": record,
        }


def format_rag_records(
    tool_name: str,
    payload: object,
) -> list[dict[str, Any]]:
    """Convenience wrapper using the default USD 0.25 catalog cap."""

    return ProvenanceFormatter().format_records(tool_name, payload)


__all__ = ["ProvenanceFormatter", "format_rag_records"]
