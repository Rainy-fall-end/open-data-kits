"""Dependency-free strict validation for untrusted model tool arguments."""

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

_SECRET_KEYS: Final = frozenset(
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
    raise ValueError(f"non-finite number {value} is not valid JSON")


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
                if key in result:
                    _fail(path, "must not contain duplicate object keys")
                if _normalized_key(key) in _SECRET_KEYS:
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
                _clone_json(
                    item,
                    path=f"{path}[{index}]",
                    depth=depth + 1,
                    active=active,
                )
                for index, item in enumerate(value)
            ]
        finally:
            active.remove(identity)
    _fail(path, "must contain JSON-compatible values only")


def parse_arguments(arguments: Mapping[str, Any] | str | None) -> dict[str, Any]:
    """Parse and defensively clone an argument object without accepting secrets."""

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
        _fail("$", "must be an object or a JSON object string")

    cloned = _clone_json(parsed, path="$", depth=0, active=set())
    if not isinstance(cloned, dict):
        _fail("$", "must be an object")
    try:
        encoded = json.dumps(
            cloned,
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":"),
        ).encode("utf-8")
    except (TypeError, ValueError, UnicodeError):
        _fail("$", "must be JSON serializable")
    if len(encoded) > MAX_ARGUMENT_BYTES:
        _fail("$", "exceeds the argument size limit")
    return cloned


def _is_object(value: Any) -> bool:
    return isinstance(value, dict)


def _matches(value: Any, schema: Mapping[str, Any]) -> bool:
    try:
        validate_against_schema(value, schema)
        return True
    except SchemaValidationError:
        return False


def _validate_type(value: Any, expected: str, path: str) -> None:
    valid = (
        (expected == "object" and _is_object(value))
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


def _validate_date(value: str, path: str) -> None:
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value) is None:
        _fail(path, "must be an RFC 3339 full-date")
    try:
        parsed = date.fromisoformat(value)
    except ValueError:
        _fail(path, "must be a valid calendar date")
    if parsed.isoformat() != value:
        _fail(path, "must be a valid calendar date")


def _decimal(value: Any, path: str) -> Decimal:
    try:
        number = Decimal(str(value))
    except (InvalidOperation, ValueError):
        _fail(path, "must be a finite decimal number")
    if not number.is_finite():
        _fail(path, "must be a finite decimal number")
    return number


def validate_against_schema(
    value: Any,
    schema: Mapping[str, Any],
    path: str = "$",
) -> Any:
    """Validate the JSON-Schema subset used by this package's closed catalog."""

    if not isinstance(schema, Mapping):
        raise TypeError("schema must be a mapping")

    if "const" in schema and value != schema["const"]:
        _fail(path, "must equal the required constant")
    enum = schema.get("enum")
    if enum is not None and not any(value == item and type(value) is type(item) for item in enum):
        _fail(path, "must be one of the allowed values")

    for child in schema.get("allOf", ()):
        validate_against_schema(value, child, path)
    any_of = schema.get("anyOf")
    if any_of is not None and not any(_matches(value, child) for child in any_of):
        _fail(path, "must match at least one allowed schema")
    condition = schema.get("if")
    if condition is not None and _matches(value, condition):
        then = schema.get("then")
        if then is not None:
            validate_against_schema(value, then, path)
    elif condition is not None:
        otherwise = schema.get("else")
        if otherwise is not None:
            validate_against_schema(value, otherwise, path)

    expected = schema.get("type")
    if expected is not None:
        if isinstance(expected, str):
            _validate_type(value, expected, path)
        elif isinstance(expected, (list, tuple)):
            if not any(_matches(value, {"type": item}) for item in expected):
                _fail(path, "must match one of the allowed types")
        else:
            raise TypeError("schema type must be a string or sequence")

    if isinstance(value, str):
        minimum_length = schema.get("minLength")
        maximum_length = schema.get("maxLength")
        if minimum_length is not None and len(value) < minimum_length:
            _fail(path, f"must contain at least {minimum_length} characters")
        if maximum_length is not None and len(value) > maximum_length:
            _fail(path, f"must contain at most {maximum_length} characters")
        pattern = schema.get("pattern")
        if pattern is not None and re.search(pattern, value) is None:
            _fail(path, "does not match the required pattern")
        if schema.get("format") == "date":
            _validate_date(value, path)

    if not isinstance(value, bool) and isinstance(value, (int, float)):
        number = _decimal(value, path)
        if "minimum" in schema and number < _decimal(schema["minimum"], path):
            _fail(path, f"must be at least {schema['minimum']}")
        if "maximum" in schema and number > _decimal(schema["maximum"], path):
            _fail(path, f"must be at most {schema['maximum']}")
        if "exclusiveMinimum" in schema and number <= _decimal(
            schema["exclusiveMinimum"], path
        ):
            _fail(path, f"must be greater than {schema['exclusiveMinimum']}")
        if "exclusiveMaximum" in schema and number >= _decimal(
            schema["exclusiveMaximum"], path
        ):
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
        item_schema = schema.get("items")
        if item_schema is not None:
            for index, item in enumerate(value):
                validate_against_schema(item, item_schema, f"{path}[{index}]")

    if isinstance(value, dict):
        properties = schema.get("properties", {})
        required = schema.get("required", ())
        for key in required:
            if key not in value:
                _fail(f"{path}.{key}", "is required")
        for key, item in value.items():
            if key in properties:
                validate_against_schema(item, properties[key], f"{path}.{key}")
            elif schema.get("additionalProperties") is False:
                _fail(f"{path}.{key}", "is not allowed")
            elif isinstance(schema.get("additionalProperties"), Mapping):
                validate_against_schema(item, schema["additionalProperties"], f"{path}.{key}")
    return value


def _apply_defaults(value: Any, schema: Mapping[str, Any]) -> Any:
    if isinstance(value, dict):
        result = dict(value)
        properties = schema.get("properties", {})
        if isinstance(properties, Mapping):
            for key, child_schema in properties.items():
                if key not in result and "default" in child_schema:
                    result[key] = _clone_json(
                        child_schema["default"],
                        path=f"$.{key}",
                        depth=1,
                        active=set(),
                    )
                elif key in result:
                    result[key] = _apply_defaults(result[key], child_schema)
        return result
    if isinstance(value, list) and isinstance(schema.get("items"), Mapping):
        return [_apply_defaults(item, schema["items"]) for item in value]
    return value


def validate_tool_arguments(
    arguments: Mapping[str, Any] | str | None,
    schema: Mapping[str, Any],
) -> dict[str, Any]:
    """Parse, apply declared defaults, and strictly validate tool arguments."""

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
