"""Provider-specific Function Calling schema exporters."""

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
    hard_charge_usd: Decimal | str | int | float,
    definitions: Sequence[ToolDefinition] | None,
) -> tuple[ToolDefinition, ...]:
    if definitions is not None:
        return tuple(definitions)
    return build_catalog(_charge(hard_charge_usd))


def _description(definition: ToolDefinition) -> str:
    if definition.source == "sec_edgar":
        return (
            f"{definition.description} When mode is company, provide at least one of cik or ticker."
        )
    return definition.description


def export_openai_tools(
    *,
    style: str = "chat_completions",
    max_total_charge_usd: Decimal | str | int | float = DEFAULT_MAX_TOTAL_CHARGE_USD,
    _catalog: Sequence[ToolDefinition] | None = None,
) -> list[dict[str, Any]]:
    """Export OpenAI tools JSON.

    ``chat_completions`` returns the established nested ``function`` shape.
    ``responses`` returns the flat function shape used by the Responses API.
    Dispatcher-side validation remains authoritative, so exported functions use
    non-strict model generation while keeping ``additionalProperties: false``.
    """

    if style not in {"chat_completions", "responses"}:
        raise ValueError("style must be 'chat_completions' or 'responses'")
    result: list[dict[str, Any]] = []
    for definition in _definitions(max_total_charge_usd, _catalog):
        function = {
            "name": definition.name,
            "description": _description(definition),
            "parameters": thaw(definition.parameters),
            "strict": False,
        }
        if style == "chat_completions":
            result.append({"type": "function", "function": function})
        else:
            result.append({"type": "function", **function})
    return result


def export_anthropic_tools(
    *,
    max_total_charge_usd: Decimal | str | int | float = DEFAULT_MAX_TOTAL_CHARGE_USD,
    _catalog: Sequence[ToolDefinition] | None = None,
) -> list[dict[str, Any]]:
    """Export Anthropic Claude ``tools`` JSON."""

    return [
        {
            "name": definition.name,
            "description": _description(definition),
            "input_schema": thaw(definition.parameters),
        }
        for definition in _definitions(max_total_charge_usd, _catalog)
    ]


_GEMINI_SCHEMA_KEYS: Final = frozenset(
    {
        "description",
        "enum",
        "exclusiveMaximum",
        "exclusiveMinimum",
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
    """Project canonical JSON Schema onto Gemini's function parameter subset."""

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
        elif isinstance(value, tuple):
            result[key] = [thaw(item) for item in value]
        else:
            result[key] = thaw(value)
    return result


def export_gemini_function_declarations(
    *,
    max_total_charge_usd: Decimal | str | int | float = DEFAULT_MAX_TOTAL_CHARGE_USD,
    _catalog: Sequence[ToolDefinition] | None = None,
) -> list[dict[str, Any]]:
    """Export Google Gemini ``function_declarations`` JSON."""

    return [
        {
            "name": definition.name,
            "description": _description(definition),
            "parameters": _gemini_schema(definition.parameters),
        }
        for definition in _definitions(max_total_charge_usd, _catalog)
    ]


def export_gemini_tools(
    *,
    max_total_charge_usd: Decimal | str | int | float = DEFAULT_MAX_TOTAL_CHARGE_USD,
    _catalog: Sequence[ToolDefinition] | None = None,
) -> list[dict[str, Any]]:
    """Return the legacy Gemini ``tools`` wrapper around declarations."""

    return [
        {
            "function_declarations": export_gemini_function_declarations(
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
    """Return a JSON-safe copy of the closed catalog for inspection."""

    snapshot: list[dict[str, Any]] = []
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
            item["api_slug"] = definition.api_slug
            item["host"] = definition.host
            item["path"] = definition.path
        snapshot.append(item)
    return snapshot


__all__ = [
    "DEFAULT_MAX_TOTAL_CHARGE_USD",
    "catalog_snapshot",
    "export_anthropic_tools",
    "export_gemini_function_declarations",
    "export_gemini_tools",
    "export_openai_tools",
]
