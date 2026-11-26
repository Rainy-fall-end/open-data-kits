"""Zero-runtime-dependency SDK for the closed Open Gov Data catalog."""

from .catalog import (
    APIFY_SOURCE_ALIASES,
    APIFY_SOURCES,
    RAPIDAPI_SOURCE_ALIASES,
    RAPIDAPI_SOURCES,
    ApifySource,
    RapidAPISource,
    catalog_dict,
)
from .client import (
    OpenGovDataClient,
    RapidSecMode,
    SecIntelligenceMode,
    TrialStatus,
    extract_records,
)
from .errors import OpenGovDataError, safe_error

__version__ = "0.2.0"

__all__ = [
    "APIFY_SOURCE_ALIASES",
    "APIFY_SOURCES",
    "RAPIDAPI_SOURCE_ALIASES",
    "RAPIDAPI_SOURCES",
    "ApifySource",
    "OpenGovDataClient",
    "OpenGovDataError",
    "RapidAPISource",
    "RapidSecMode",
    "SecIntelligenceMode",
    "TrialStatus",
    "catalog_dict",
    "extract_records",
    "safe_error",
]
