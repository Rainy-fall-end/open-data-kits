"""Multi-model Function Calling tools for paid open-government data APIs."""

from .catalog import APIFY_ACTOR_IDS, RAPIDAPI_SLUGS
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
from .validation import validate_against_schema, validate_tool_arguments


__version__ = "0.1.0"

__all__ = [
    "APIFY_ACTOR_IDS",
    "RAPIDAPI_SLUGS",
    "OpenGovToolsError",
    "ProvenanceFormatter",
    "SchemaValidationError",
    "ToolDispatcher",
    "catalog_snapshot",
    "export_anthropic_tools",
    "export_gemini_function_declarations",
    "export_gemini_tools",
    "export_openai_tools",
    "extract_records",
    "format_rag_records",
    "validate_against_schema",
    "validate_tool_arguments",
]
