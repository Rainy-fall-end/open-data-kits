"""OpenAI, Anthropic, and Gemini Function Calling schema exports."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any, Final, Mapping, Sequence

from .catalog import ToolDefinition, build_catalog, thaw


DEFAULT_MAX_TOTAL_CHARGE_USD: Final = Decimal("0.25")


def _charge(value: Decimal | str | int | float) -> Decimal:
    if isinstance(value, bool):
        raise ValueError("max_total_charge_usd must be a positive finite decimal")
    try:
        number = Decimal(str(value))
    except (InvalidOperation, ValueError):
        raise ValueError("max_total_charge_usd must be a positive finite decimal") from None
    if not number.is_finite() or number <= 0 or number > Decimal("100"):
        raise ValueError("max_total_charge_usd must be greater than 0 and no more than 100")
    if number.as_tuple().exponent < -6:
        raise ValueError("max_total_charge_usd supports at most 6 decimal places")
    return number


def _definitions(
    max_total_charge_usd: Decimal | str | int | float,
    catalog: Sequence[ToolDefinition] | None,
) -> tuple[ToolDefinition, ...]:
    return tuple(catalog) if catalog is not None else build_catalog(_charge(max_total_charge_usd))


def export_openai_tools(
    *,
    style: str = "chat_completions",
    max_total_charge_usd: Decimal | str | int | float = DEFAULT_MAX_TOTAL_CHARGE_USD,
    _catalog: Sequence[ToolDefinition] | None = None,
) -> list[dict[str, Any]]:
    """Return nested Chat Completions or flat Responses function tools."""

    if style not in {"chat_completions", "responses"}:
        raise ValueError("style must be 'chat_completions' or 'responses'")
    result: list[dict[str, Any]] = []
    for definition in _definitions(max_total_charge_usd, _catalog):
        function = {
            "name": definition.name,
            "description": definition.description,
            "parameters": thaw(definition.parameters),
            "strict": False,
        }
        result.append(
            {"type": "function", "function": function}
            if style == "chat_completions"
            else {"type": "function", **function}
        )
    return result


def export_anthropic_tools(
    *,
    max_total_charge_usd: Decimal | str | int | float = DEFAULT_MAX_TOTAL_CHARGE_USD,
    _catalog: Sequence[ToolDefinition] | None = None,
) -> list[dict[str, Any]]:
    """Return Anthropic Claude tool definitions."""

    return [
        {
            "name": definition.name,
            "description": definition.description,
            "input_schema": thaw(definition.parameters),
        }
        for definition in _definitions(max_total_charge_usd, _catalog)
    ]


_GEMINI_SCHEMA_KEYS: Final = frozenset(
    {
        "description",
        "enum",
        "format",
        "items",
        "maxItems",
        "maxLength",
        "maximum",
        "minItems",
        "minLength",
        "minimum",
        "pattern",
        "properties",
        "required",
        "type",
    }
)


def _gemini_schema(schema: Mapping[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in schema.items():
        if key not in _GEMINI_SCHEMA_KEYS:
            continue
        if key == "properties" and isinstance(value, Mapping):
            result[key] = {
                str(name): _gemini_schema(child)
                for name, child in value.items()
                if isinstance(child, Mapping)
            }
        elif key == "items" and isinstance(value, Mapping):
            result[key] = _gemini_schema(value)
        else:
            result[key] = thaw(value)
    return result


def export_gemini_function_declarations(
    *,
    max_total_charge_usd: Decimal | str | int | float = DEFAULT_MAX_TOTAL_CHARGE_USD,
    _catalog: Sequence[ToolDefinition] | None = None,
) -> list[dict[str, Any]]:
    """Return Gemini ``functionDeclarations`` entries."""

    return [
        {
            "name": definition.name,
            "description": definition.description,
            "parameters": _gemini_schema(definition.parameters),
        }
        for definition in _definitions(max_total_charge_usd, _catalog)
    ]


def export_gemini_tools(
    *,
    max_total_charge_usd: Decimal | str | int | float = DEFAULT_MAX_TOTAL_CHARGE_USD,
    _catalog: Sequence[ToolDefinition] | None = None,
) -> list[dict[str, Any]]:
    """Return Gemini REST's ``tools`` array wrapper."""

    return [
        {
            "functionDeclarations": export_gemini_function_declarations(
                max_total_charge_usd=max_total_charge_usd,
                _catalog=_catalog,
            )
        }
    ]


def catalog_snapshot(
    *,
    max_total_charge_usd: Decimal | str | int | float = DEFAULT_MAX_TOTAL_CHARGE_USD,
    _catalog: Sequence[ToolDefinition] | None = None,
) -> list[dict[str, Any]]:
    """Return a mutable JSON-compatible copy of the immutable catalog."""

    result: list[dict[str, Any]] = []
    for definition in _definitions(max_total_charge_usd, _catalog):
        item: dict[str, Any] = {
            "name": definition.name,
            "title": definition.title,
            "description": definition.description,
            "provider": definition.provider,
            "source": definition.source,
            "parameters": thaw(definition.parameters),
            "provenance": {
                "publisher": definition.provenance.publisher,
                "source_url": definition.provenance.source_url,
                "license_name": definition.provenance.license_name,
                "license_url": definition.provenance.license_url,
                "attribution": definition.provenance.attribution,
            },
        }
        if definition.actor_id is not None:
            item["actor_id"] = definition.actor_id
        if definition.api_slug is not None:
            item.update(
                api_slug=definition.api_slug,
                host=definition.host,
                path=definition.path,
            )
        result.append(item)
    return result


__all__ = [
    "DEFAULT_MAX_TOTAL_CHARGE_USD",
    "catalog_snapshot",
    "export_anthropic_tools",
    "export_gemini_function_declarations",
    "export_gemini_tools",
    "export_openai_tools",
]

