"""Dependency-free validation for untrusted model-generated arguments."""

from __future__ import annotations

import json
import math
import re
from collections.abc import Mapping
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any, Final

from .errors import SchemaValidationError


MAX_ARGUMENT_BYTES: Final = 100_000
MAX_ARGUMENT_DEPTH: Final = 16
MAX_CONTAINER_ITEMS: Final = 2_000
SECRET_KEYS: Final = frozenset(
    {
        "apikey",
        "apifytoken",
        "authorization",
        "credential",
        "password",
        "rapidapikey",
        "secret",
        "token",
        "xrapidapikey",
    }
)


def _fail(path: str, expectation: str) -> None:
    raise SchemaValidationError(f"{path} {expectation}")


def _normalized_key(key: str) -> str:
    return re.sub(r"[^a-z0-9]", "", key.casefold())


def _reject_constant(value: str) -> None:
    raise ValueError(f"non-finite number {value} is invalid")


def _object_from_pairs(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate object key")
        result[key] = value
    return result


def _clone_json(value: Any, *, path: str, depth: int, active: set[int]) -> Any:
    if depth > MAX_ARGUMENT_DEPTH:
        _fail(path, "is nested too deeply")
    if value is None or isinstance(value, (str, bool, int)):
        return value
    if isinstance(value, float):
        if not math.isfinite(value):
            _fail(path, "must not contain a non-finite number")
        return value
    if isinstance(value, Mapping):
        if len(value) > MAX_CONTAINER_ITEMS:
            _fail(path, "contains too many fields")
        identity = id(value)
        if identity in active:
            _fail(path, "must not contain a cycle")
        active.add(identity)
        try:
            result: dict[str, Any] = {}
            for key, item in value.items():
                if not isinstance(key, str):
                    _fail(path, "must use string object keys")
                if _normalized_key(key) in SECRET_KEYS:
                    _fail(path, "must not contain credentials or secret fields")
                result[key] = _clone_json(
                    item,
                    path=f"{path}.{key}",
                    depth=depth + 1,
                    active=active,
                )
            return result
        finally:
            active.remove(identity)
    if isinstance(value, (list, tuple)):
        if len(value) > MAX_CONTAINER_ITEMS:
            _fail(path, "contains too many items")
        identity = id(value)
        if identity in active:
            _fail(path, "must not contain a cycle")
        active.add(identity)
        try:
            return [
                _clone_json(item, path=f"{path}[{index}]", depth=depth + 1, active=active)
                for index, item in enumerate(value)
            ]
        finally:
            active.remove(identity)
    _fail(path, "must contain JSON-compatible values only")


def parse_arguments(arguments: Mapping[str, Any] | str | None) -> dict[str, Any]:
    """Parse and clone a JSON object while rejecting secret-bearing fields."""

    if arguments is None:
        parsed: Any = {}
    elif isinstance(arguments, str):
        if len(arguments.encode("utf-8")) > MAX_ARGUMENT_BYTES:
            _fail("$", "exceeds the argument size limit")
        try:
            parsed = json.loads(
                arguments,
                object_pairs_hook=_object_from_pairs,
                parse_constant=_reject_constant,
            )
        except (json.JSONDecodeError, UnicodeError, ValueError):
            _fail("$", "must be a valid JSON object with unique keys")
    elif isinstance(arguments, Mapping):
        parsed = arguments
    else:
        _fail("$", "must be an object or JSON object string")
    cloned = _clone_json(parsed, path="$", depth=0, active=set())
    if not isinstance(cloned, dict):
        _fail("$", "must be an object")
    encoded = json.dumps(cloned, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
    if len(encoded.encode("utf-8")) > MAX_ARGUMENT_BYTES:
        _fail("$", "exceeds the argument size limit")
    return cloned


def _matches(value: Any, schema: Mapping[str, Any]) -> bool:
    try:
        validate_against_schema(value, schema)
        return True
    except SchemaValidationError:
        return False


def _validate_type(value: Any, expected: str, path: str) -> None:
    valid = (
        (expected == "object" and isinstance(value, dict))
        or (expected == "array" and isinstance(value, list))
        or (expected == "string" and isinstance(value, str))
        or (
            expected == "number"
            and not isinstance(value, bool)
            and isinstance(value, (int, float))
            and math.isfinite(float(value))
        )
        or (expected == "integer" and not isinstance(value, bool) and isinstance(value, int))
        or (expected == "boolean" and isinstance(value, bool))
        or (expected == "null" and value is None)
    )
    if not valid:
        _fail(path, f"must be of type {expected}")


def _decimal(value: Any, path: str) -> Decimal:
    try:
        number = Decimal(str(value))
    except (InvalidOperation, ValueError):
        _fail(path, "must be a finite decimal number")
    if not number.is_finite():
        _fail(path, "must be a finite decimal number")
    return number


def validate_against_schema(value: Any, schema: Mapping[str, Any], path: str = "$") -> Any:
    """Validate the JSON Schema subset used by the closed catalog."""

    if "const" in schema and value != schema["const"]:
        _fail(path, "must equal the required constant")
    if "enum" in schema and not any(
        value == item and type(value) is type(item) for item in schema["enum"]
    ):
        _fail(path, "must be one of the allowed values")
    for child in schema.get("allOf", ()):
        validate_against_schema(value, child, path)
    if "anyOf" in schema and not any(_matches(value, child) for child in schema["anyOf"]):
        _fail(path, "must match at least one allowed schema")

    expected = schema.get("type")
    if isinstance(expected, str):
        _validate_type(value, expected, path)
    elif isinstance(expected, (list, tuple)):
        if not any(_matches(value, {"type": option}) for option in expected):
            _fail(path, "must match one of the allowed types")

    if isinstance(value, str):
        if "minLength" in schema and len(value) < schema["minLength"]:
            _fail(path, f"must contain at least {schema['minLength']} characters")
        if "maxLength" in schema and len(value) > schema["maxLength"]:
            _fail(path, f"must contain at most {schema['maxLength']} characters")
        if "pattern" in schema and re.search(schema["pattern"], value) is None:
            _fail(path, "does not match the required pattern")
        if schema.get("format") == "date":
            try:
                parsed = date.fromisoformat(value)
            except ValueError:
                _fail(path, "must be a valid RFC 3339 full-date")
            if parsed.isoformat() != value:
                _fail(path, "must be a valid RFC 3339 full-date")

    if not isinstance(value, bool) and isinstance(value, (int, float)):
        number = _decimal(value, path)
        if "minimum" in schema and number < _decimal(schema["minimum"], path):
            _fail(path, f"must be at least {schema['minimum']}")
        if "maximum" in schema and number > _decimal(schema["maximum"], path):
            _fail(path, f"must be at most {schema['maximum']}")
        if "exclusiveMinimum" in schema and number <= _decimal(schema["exclusiveMinimum"], path):
            _fail(path, f"must be greater than {schema['exclusiveMinimum']}")
        if "exclusiveMaximum" in schema and number >= _decimal(schema["exclusiveMaximum"], path):
            _fail(path, f"must be less than {schema['exclusiveMaximum']}")
        if "multipleOf" in schema:
            multiple = _decimal(schema["multipleOf"], path)
            if multiple <= 0 or number % multiple != 0:
                _fail(path, f"must be a multiple of {schema['multipleOf']}")

    if isinstance(value, list):
        if "minItems" in schema and len(value) < schema["minItems"]:
            _fail(path, f"must contain at least {schema['minItems']} items")
        if "maxItems" in schema and len(value) > schema["maxItems"]:
            _fail(path, f"must contain at most {schema['maxItems']} items")
        if isinstance(schema.get("items"), Mapping):
            for index, item in enumerate(value):
                validate_against_schema(item, schema["items"], f"{path}[{index}]")

    if isinstance(value, dict):
        properties = schema.get("properties", {})
        for key in schema.get("required", ()):
            if key not in value:
                _fail(f"{path}.{key}", "is required")
        for key, item in value.items():
            if key in properties:
                validate_against_schema(item, properties[key], f"{path}.{key}")
            elif schema.get("additionalProperties") is False:
                _fail(f"{path}.{key}", "is not allowed")
    return value


def _apply_defaults(value: Any, schema: Mapping[str, Any]) -> Any:
    if isinstance(value, dict):
        result = dict(value)
        properties = schema.get("properties", {})
        for key, child in properties.items():
            if key not in result and "default" in child:
                result[key] = _clone_json(child["default"], path=f"$.{key}", depth=1, active=set())
            elif key in result:
                result[key] = _apply_defaults(result[key], child)
        return result
    if isinstance(value, list) and isinstance(schema.get("items"), Mapping):
        return [_apply_defaults(item, schema["items"]) for item in value]
    return value


def validate_tool_arguments(
    arguments: Mapping[str, Any] | str | None,
    schema: Mapping[str, Any],
) -> dict[str, Any]:
    parsed = parse_arguments(arguments)
    with_defaults = _apply_defaults(parsed, schema)
    validate_against_schema(with_defaults, schema)
    return with_defaults


__all__ = [
    "MAX_ARGUMENT_BYTES",
    "parse_arguments",
    "validate_against_schema",
    "validate_tool_arguments",
]

