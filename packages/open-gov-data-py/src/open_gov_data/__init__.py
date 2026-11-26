"""Zero-runtime-dependency SDK for selected open government-data products."""

from .catalog import (
    APIFY_SOURCES,
    RAPIDAPI_SOURCES,
    ApifySource,
    RapidAPISource,
    catalog_dict,
)
from .client import OpenGovDataClient, extract_records
from .errors import OpenGovDataError, safe_error

__version__ = "0.1.0"

__all__ = [
    "APIFY_SOURCES",
    "RAPIDAPI_SOURCES",
    "ApifySource",
    "OpenGovDataClient",
    "OpenGovDataError",
    "RapidAPISource",
    "catalog_dict",
    "extract_records",
    "safe_error",
]

