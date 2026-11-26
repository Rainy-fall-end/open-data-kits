"""Multi-model Function Calling and RAG tools for public data APIs."""

from .catalog import APIFY_ACTOR_IDS, RAPIDAPI_SLUGS, TOOL_NAMES
from .dispatcher import ToolDispatcher, extract_records
from .errors import OpenGovToolsError, SchemaValidationError
from .exports import (
    catalog_snapshot,
    export_anthropic_tools,
    export_gemini_function_declarations,
    export_gemini_tools,
    export_openai_tools,
)
from .provenance import ProvenanceFormatter, format_rag_records
from .redaction import REDACTED, redact_secrets, redact_text
from .validation import validate_against_schema, validate_tool_arguments


__version__ = "0.2.0"

__all__ = [
    "APIFY_ACTOR_IDS",
    "RAPIDAPI_SLUGS",
    "TOOL_NAMES",
    "OpenGovToolsError",
    "ProvenanceFormatter",
    "REDACTED",
    "SchemaValidationError",
    "ToolDispatcher",
    "catalog_snapshot",
    "export_anthropic_tools",
    "export_gemini_function_declarations",
    "export_gemini_tools",
    "export_openai_tools",
    "extract_records",
    "format_rag_records",
    "redact_secrets",
    "redact_text",
    "validate_against_schema",
    "validate_tool_arguments",
]

