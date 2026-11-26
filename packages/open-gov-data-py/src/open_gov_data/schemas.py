"""Embedded validation snapshots derived from repository schemas and OpenAPI."""

from __future__ import annotations

from types import MappingProxyType
from typing import Any, Final, Mapping


def _field(kind: str, **constraints: Any) -> Mapping[str, Any]:
    return MappingProxyType({"type": kind, **constraints})


TRIAL_STATUSES: Final = (
    "RECRUITING",
    "NOT_YET_RECRUITING",
    "ACTIVE_NOT_RECRUITING",
    "COMPLETED",
    "ENROLLING_BY_INVITATION",
    "SUSPENDED",
    "TERMINATED",
    "WITHDRAWN",
    "UNKNOWN",
)
GREEN_MARK_RATINGS: Final = ("Platinum", "Goldplus", "Gold", "Certified")

_ACTOR_INPUT_SCHEMAS: dict[str, Mapping[str, Mapping[str, Any]]] = {
    "ats_jobs_hiring_signals": MappingProxyType(
        {
            "preset": _field(
                "string",
                enum=("ai_leaders", "fintech_saas", "all_curated", "custom_only"),
                default="ai_leaders",
            ),
            "companyBoards": _field("array", default=(), items="string"),
            "keywords": _field("string", default=""),
            "remoteOnly": _field("boolean", default=False),
            "departmentFilter": _field("string", default=""),
            "includeDescription": _field("boolean", default=False),
            "maxItems": _field("integer", minimum=1, maximum=10_000, default=10),
        }
    ),
    "sec_edgar": MappingProxyType(
        {
            "mode": _field(
                "string",
                enum=("form_d_funding", "xbrl_financials", "filings"),
                default="form_d_funding",
            ),
            "query": _field("string", default=""),
            "ticker": _field("string", default=""),
            "cik": _field("string", default=""),
            "forms": _field("string", default="10-K,10-Q,8-K"),
            "startDate": _field("string", default=""),
            "endDate": _field("string", default=""),
            "excludePooledFunds": _field("boolean", default=False),
            "minOfferingAmountUsd": _field("integer", minimum=0),
            "industryFilter": _field("string", default=""),
            "includeAmendments": _field("boolean", default=True),
            "maxItems": _field("integer", minimum=1, maximum=5_000, default=10),
        }
    ),
    "global_public_tenders": MappingProxyType(
        {
            "sources": _field(
                "array",
                items="string",
                default=(
                    "uk_find_a_tender",
                    "eu_ted",
                    "us_grants_gov",
                    "usaspending",
                    "world_bank",
                    "canada_contracts",
                    "austender",
                ),
            ),
            "opportunityTypes": _field(
                "array", items="string", default=("tender", "grant", "award")
            ),
            "keyword": _field("string", default=""),
            "dateFrom": _field("string", default=""),
            "dateTo": _field("string", default=""),
            "maxItems": _field("integer", minimum=1, maximum=5_000, default=10),
            "perSourceLimit": _field(
                "integer", minimum=1, maximum=1_000, default=2
            ),
            "sourceTimeoutSecs": _field(
                "integer", minimum=1, maximum=30, default=20
            ),
        }
    ),
    "pharma_pipeline_intelligence": MappingProxyType(
        {
            "mode": _field(
                "string", enum=("drug_dossier", "pipeline_feed"), default="drug_dossier"
            ),
            "query": _field(
                "string", minLength=1, maxLength=200, default="semaglutide"
            ),
            "drugNames": _field("array", items="string", default=()),
            "maxItems": _field("integer", minimum=1, maximum=1_000, default=10),
            "sourceItemsPerQuery": _field(
                "integer", minimum=1, maximum=25, default=5
            ),
            "sourceTimeoutSeconds": _field(
                "integer", minimum=2, maximum=60, default=25
            ),
            "requestDelayMs": _field(
                "integer", minimum=0, maximum=5_000, default=150
            ),
        }
    ),
    "usaspending_contracts": MappingProxyType(
        {
            "keyword": _field("string", default=""),
            "awardCategory": _field(
                "string", enum=("contracts", "grants", "idvs"), default="contracts"
            ),
            "startDate": _field("string", default="2025-01-01"),
            "endDate": _field("string", default="2026-12-31"),
            "awardingAgency": _field("string", default=""),
            "minAwardAmount": _field("number", minimum=0),
            "naicsCode": _field("string", default=""),
            "sortOrder": _field("string", enum=("desc", "asc"), default="desc"),
            "maxItems": _field("integer", minimum=1, maximum=5_000, default=10),
        }
    ),
    "clinical_trials": MappingProxyType(
        {
            "condition": _field("string", default=""),
            "intervention": _field("string", default=""),
            "status": _field("string", enum=("", *TRIAL_STATUSES), default=""),
            "sponsor": _field("string", default=""),
            "queryTerm": _field("string", default=""),
            "maxItems": _field("integer", minimum=1, maximum=5_000, default=10),
        }
    ),
    "uk_gov_tenders": MappingProxyType(
        {
            "keyword": _field("string", maxLength=120, default=""),
            "stages": _field(
                "string",
                enum=("tender", "planning", "award", "planning,tender,award"),
                default="tender",
            ),
            "minValue": _field("number", minimum=0),
            "publishedFrom": _field("string", maxLength=40, default=""),
            "maxItems": _field("integer", minimum=1, maximum=2_000, default=10),
        }
    ),
    "singapore_green_mark": MappingProxyType(
        {
            "query": _field("string", maxLength=120, default=""),
            "rating": _field("string", enum=("", *GREEN_MARK_RATINGS), default=""),
            "expiresWithinDays": _field("integer", minimum=0, maximum=3_650),
            "maxItems": _field("integer", minimum=1, maximum=1_000, default=10),
        }
    ),
}

_RAPIDAPI_QUERY_SCHEMAS: dict[str, Mapping[str, Mapping[str, Any]]] = {
    "sec_edgar": MappingProxyType(
        {
            "mode": _field("string", enum=("search", "company"), default="search"),
            "query": _field("string", maxLength=200, default=""),
            "forms": _field("string", maxLength=100, default="10-K,10-Q,8-K"),
            "cik": _field("string", maxLength=20, default=""),
            "ticker": _field("string", maxLength=16, default=""),
            "startDate": _field("string", maxLength=10, default=""),
            "endDate": _field("string", maxLength=10, default=""),
            "limit": _field("integer", minimum=1, maximum=20, default=5),
        }
    ),
    "clinical_trials": MappingProxyType(
        {
            "condition": _field("string", maxLength=200, default=""),
            "intervention": _field("string", maxLength=200, default=""),
            "status": _field("string", enum=TRIAL_STATUSES),
            "sponsor": _field("string", maxLength=200, default=""),
            "queryTerm": _field("string", maxLength=200, default=""),
            "limit": _field("integer", minimum=1, maximum=20, default=5),
        }
    ),
    "openfda": MappingProxyType(
        {
            "dataset": _field(
                "string",
                enum=(
                    "drug_enforcement",
                    "device_recall",
                    "food_enforcement",
                    "drug_approvals",
                ),
                default="drug_enforcement",
            ),
            "searchQuery": _field("string", maxLength=200, default=""),
            "classification": _field(
                "string", enum=("Class I", "Class II", "Class III")
            ),
            "status": _field("string", enum=("Ongoing", "Completed", "Terminated")),
            "limit": _field("integer", minimum=1, maximum=20, default=5),
        }
    ),
    "singapore_green_mark": MappingProxyType(
        {
            "limit": _field("integer", minimum=1, maximum=20, default=5),
            "rating": _field("string", enum=GREEN_MARK_RATINGS),
        }
    ),
}

ACTOR_INPUT_SCHEMAS: Final[Mapping[str, Mapping[str, Mapping[str, Any]]]] = (
    MappingProxyType(_ACTOR_INPUT_SCHEMAS)
)
RAPIDAPI_QUERY_SCHEMAS: Final[Mapping[str, Mapping[str, Mapping[str, Any]]]] = (
    MappingProxyType(_RAPIDAPI_QUERY_SCHEMAS)
)

ACTOR_SCHEMA_FILES: Final[Mapping[str, str]] = MappingProxyType(
    {
        "ats_jobs_hiring_signals": "actors/ats-jobs-hiring-signals-scraper/.actor/input_schema.json",
        "sec_edgar": "actors/sec-edgar-filings-scraper/.actor/input_schema.json",
        "global_public_tenders": "actors/global-public-tenders-grants-aggregator/.actor/input_schema.json",
        "pharma_pipeline_intelligence": "actors/pharma-biotech-pipeline-intelligence/.actor/input_schema.json",
        "usaspending_contracts": "actors/usaspending-gov-contracts-scraper/.actor/input_schema.json",
        "clinical_trials": "actors/clinical-trials-scraper/.actor/input_schema.json",
        "uk_gov_tenders": "actors/uk-gov-tenders-scraper/.actor/input_schema.json",
        "singapore_green_mark": "actors/sg-green-mark-buildings/.actor/input_schema.json",
    }
)

RAPIDAPI_SCHEMA_FILES: Final[Mapping[str, str]] = MappingProxyType(
    {
        "sec_edgar": "pipelines/rapidapi_hub/openapi/sec-edgar-api.json",
        "clinical_trials": "pipelines/rapidapi_hub/openapi/clinical-trials-api.json",
        "openfda": "pipelines/rapidapi_hub/openapi/openfda-recalls-api.json",
        "singapore_green_mark": "pipelines/rapidapi_hub/openapi/sg-green-mark-api.json",
    }
)


__all__ = [
    "ACTOR_INPUT_SCHEMAS",
    "ACTOR_SCHEMA_FILES",
    "GREEN_MARK_RATINGS",
    "RAPIDAPI_QUERY_SCHEMAS",
    "RAPIDAPI_SCHEMA_FILES",
    "TRIAL_STATUSES",
]
