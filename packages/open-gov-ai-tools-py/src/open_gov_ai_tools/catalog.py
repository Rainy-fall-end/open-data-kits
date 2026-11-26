"""Closed catalog for the eight public paid open-government tools."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from types import MappingProxyType
from typing import Any, Final, Mapping


APIFY_ACTOR_IDS: Final = (
    "8LFIbRbidiHPknMz5",
    "KchE3qKKrwU0rCe9f",
    "txnvyTckeQx4hVBc6",
    "Z3ioK0wOAeczj6nCx",
)

RAPIDAPI_SLUGS: Final = (
    "sec-edgar-corporate-filings",
    "clinicaltrials-gov-studies-trials",
    "openfda-recalls-enforcement-approvals",
    "singapore-bca-green-mark-buildings",
)

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


@dataclass(frozen=True, slots=True)
class ProvenancePolicy:
    """Official source and licensing metadata for one upstream dataset."""

    publisher: str
    source_url: str
    license_name: str
    license_url: str
    attribution: str
    allowed_source_hosts: tuple[str, ...]
    source_url_fields: tuple[str, ...]
    identifier_fields: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class ToolDefinition:
    """One immutable allowlisted tool definition."""

    name: str
    title: str
    description: str
    provider: str
    source: str
    parameters: Mapping[str, Any]
    provenance: ProvenancePolicy
    actor_id: str | None = None
    api_slug: str | None = None
    host: str | None = None
    path: str | None = None


SEC_PROVENANCE: Final = ProvenancePolicy(
    publisher="U.S. Securities and Exchange Commission (SEC)",
    source_url="https://www.sec.gov/edgar/search/",
    license_name="U.S. Government-created content / EDGAR public filing reuse",
    license_url="https://www.sec.gov/about/webmaster-frequently-asked-questions",
    attribution=(
        "Source: U.S. Securities and Exchange Commission (SEC EDGAR). "
        "Government-created SEC content and EDGAR public filing content are free to access and reuse."
    ),
    allowed_source_hosts=("sec.gov",),
    source_url_fields=("filingUrl", "documentUrl", "sourceUrl", "url"),
    identifier_fields=("accessionNumber", "accession_number", "cik", "ticker"),
)

CLINICAL_PROVENANCE: Final = ProvenancePolicy(
    publisher="ClinicalTrials.gov (U.S. National Library of Medicine, NIH)",
    source_url="https://clinicaltrials.gov/",
    license_name="U.S. Government Public Domain / ClinicalTrials.gov Terms and Conditions",
    license_url="https://clinicaltrials.gov/terms-conditions",
    attribution=(
        "Source: ClinicalTrials.gov, U.S. National Library of Medicine, NIH. "
        "Reuse remains subject to the official ClinicalTrials.gov Terms and Conditions."
    ),
    allowed_source_hosts=("clinicaltrials.gov",),
    source_url_fields=("studyUrl", "sourceUrl", "url"),
    identifier_fields=("nctId", "nct_id", "NCTId", "id"),
)

OPENFDA_PROVENANCE: Final = ProvenancePolicy(
    publisher="U.S. Food and Drug Administration (openFDA)",
    source_url="https://open.fda.gov/",
    license_name="Public Domain and CC0 1.0 Universal",
    license_url="https://open.fda.gov/terms/",
    attribution=(
        "Data provided by the U.S. Food and Drug Administration through openFDA; "
        "unless otherwise noted, openFDA data is public domain under CC0 1.0 Universal."
    ),
    allowed_source_hosts=("fda.gov",),
    source_url_fields=("sourceUrl", "reportUrl", "url"),
    identifier_fields=(
        "recallNumber",
        "recall_number",
        "applicationNumber",
        "application_number",
        "event_id",
        "id",
    ),
)

UK_TENDERS_PROVENANCE: Final = ProvenancePolicy(
    publisher="UK Government Contracts Finder (Cabinet Office)",
    source_url="https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search",
    license_name="Open Government Licence v3.0",
    license_url="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
    attribution="Contains public sector information licensed under the Open Government Licence v3.0.",
    allowed_source_hosts=("contractsfinder.service.gov.uk",),
    source_url_fields=("noticeUrl", "sourceUrl", "url"),
    identifier_fields=("ocid", "noticeId", "notice_id", "id"),
)

SINGAPORE_PROVENANCE: Final = ProvenancePolicy(
    publisher="Building and Construction Authority (BCA), Singapore",
    source_url=(
        "https://data.gov.sg/datasets/d_c4bd082b48fa7611713f39e23d250c27/view"
    ),
    license_name="Singapore Open Data Licence v1.0",
    license_url="https://developers.data.gov.sg/open-data-licence",
    attribution=(
        "Contains information from Green Mark Buildings by the Building and Construction "
        "Authority, Singapore, made available under the Singapore Open Data Licence v1.0."
    ),
    allowed_source_hosts=("data.gov.sg",),
    source_url_fields=("sourceUrl", "url"),
    identifier_fields=(
        "certificateReference",
        "certificate_reference",
        "referenceNo",
        "projectName",
        "id",
    ),
)


def _freeze(value: Any) -> Any:
    if isinstance(value, dict):
        return MappingProxyType({key: _freeze(item) for key, item in value.items()})
    if isinstance(value, list):
        return tuple(_freeze(item) for item in value)
    return value


def thaw(value: Any) -> Any:
    """Return a mutable JSON-compatible copy of recursively frozen catalog data."""

    if isinstance(value, Mapping):
        return {str(key): thaw(item) for key, item in value.items()}
    if isinstance(value, tuple):
        return [thaw(item) for item in value]
    return value


def _short_text(max_length: int, description: str) -> dict[str, Any]:
    return {
        "type": "string",
        "minLength": 1,
        "maxLength": max_length,
        "description": description,
    }


def _date(description: str) -> dict[str, Any]:
    return {"type": "string", "format": "date", "description": description}


def _closed(properties: dict[str, Any], **extras: Any) -> Mapping[str, Any]:
    return _freeze(
        {
            "type": "object",
            "properties": properties,
            "additionalProperties": False,
            **extras,
        }
    )


def _sec_properties(row_property: dict[str, Any]) -> dict[str, Any]:
    return {
        "mode": {
            "type": "string",
            "enum": ["search", "company"],
            "default": "search",
            "description": "Use search for recent/full-text filings or company for CIK/ticker lookup.",
        },
        "query": _short_text(200, "Full-text EDGAR keyword query."),
        "forms": {
            **_short_text(100, "Comma-separated SEC form types."),
            "default": "10-K,10-Q,8-K",
        },
        "cik": {
            **_short_text(10, "SEC Central Index Key, padded or unpadded."),
            "pattern": r"^\d{1,10}$",
        },
        "ticker": {
            **_short_text(16, "U.S. stock ticker symbol."),
            "pattern": r"^[A-Za-z][A-Za-z0-9.-]{0,15}$",
        },
        "startDate": _date("Earliest filing date (YYYY-MM-DD)."),
        "endDate": _date("Latest filing date (YYYY-MM-DD)."),
        **row_property,
    }


def _clinical_properties(row_property: dict[str, Any]) -> dict[str, Any]:
    return {
        "condition": _short_text(200, "Medical condition or disease."),
        "intervention": _short_text(200, "Intervention or treatment."),
        "status": {
            "type": "string",
            "enum": list(TRIAL_STATUSES),
            "description": "ClinicalTrials.gov overall recruitment status.",
        },
        "sponsor": _short_text(200, "Lead sponsor or collaborator."),
        "queryTerm": _short_text(200, "General keyword across study fields."),
        **row_property,
    }


def _rapid_limit() -> dict[str, Any]:
    return {
        "limit": {
            "type": "integer",
            "minimum": 1,
            "maximum": 20,
            "default": 5,
            "description": "Maximum rows returned by this single paid RapidAPI request.",
        }
    }


def _actor_controls(hard_charge_usd: Decimal, max_items: int) -> dict[str, Any]:
    cap = float(hard_charge_usd)
    return {
        "maxItems": {
            "type": "integer",
            "minimum": 1,
            "maximum": max_items,
            "default": 10,
            "description": "Maximum dataset items requested from the paid Actor.",
        },
        "maxTotalChargeUsd": {
            "type": "number",
            "exclusiveMinimum": 0,
            "maximum": cap,
            "multipleOf": 0.000001,
            "default": cap,
            "description": (
                "Mandatory server-side Apify charge cap in USD; the dispatcher rejects any "
                f"per-call value above its fixed USD {hard_charge_usd} hard limit."
            ),
        },
    }


def _company_requirement() -> list[dict[str, Any]]:
    return [
        {
            "if": {
                "type": "object",
                "properties": {"mode": {"const": "company"}},
                "required": ["mode"],
            },
            "then": {"anyOf": [{"required": ["cik"]}, {"required": ["ticker"]}]},
        }
    ]


def _description(subject: str, provider: str, cost_guard: str) -> str:
    return (
        f"Query {subject} through the allowlisted paid {provider} integration. "
        "Use this read-only tool when an answer needs current official public-sector records "
        "and retain the returned source and licence metadata in downstream citations. "
        f"{cost_guard} Credentials are supplied only by the dispatcher environment and must never "
        "be placed in tool arguments."
    )


def build_catalog(hard_charge_usd: Decimal) -> tuple[ToolDefinition, ...]:
    """Build the closed eight-tool catalog for a fixed dispatcher charge cap."""

    rapid_cost = "The request is row-limited; RapidAPI does not expose a per-call USD cap."
    apify_cost = "Every run carries an Apify server-side maxTotalChargeUsd cap."
    rapid = _rapid_limit()
    actor_sec = _actor_controls(hard_charge_usd, 5_000)
    actor_clinical = _actor_controls(hard_charge_usd, 5_000)
    actor_uk = _actor_controls(hard_charge_usd, 2_000)
    actor_sg = _actor_controls(hard_charge_usd, 1_000)

    return (
        ToolDefinition(
            name="rapidapi_sec_edgar_filings",
            title="RapidAPI: SEC EDGAR Corporate Filings",
            description=_description("SEC EDGAR corporate filings", "RapidAPI", rapid_cost),
            provider="rapidapi",
            source="sec_edgar",
            api_slug=RAPIDAPI_SLUGS[0],
            host=f"{RAPIDAPI_SLUGS[0]}.p.rapidapi.com",
            path="/v1/sec-edgar/filings",
            parameters=_closed(_sec_properties(rapid), allOf=_company_requirement()),
            provenance=SEC_PROVENANCE,
        ),
        ToolDefinition(
            name="rapidapi_clinical_trials",
            title="RapidAPI: ClinicalTrials.gov Studies",
            description=_description("ClinicalTrials.gov studies", "RapidAPI", rapid_cost),
            provider="rapidapi",
            source="clinical_trials",
            api_slug=RAPIDAPI_SLUGS[1],
            host=f"{RAPIDAPI_SLUGS[1]}.p.rapidapi.com",
            path="/v1/clinical-trials/studies",
            parameters=_closed(_clinical_properties(rapid)),
            provenance=CLINICAL_PROVENANCE,
        ),
        ToolDefinition(
            name="rapidapi_openfda_records",
            title="RapidAPI: openFDA Records",
            description=_description(
                "openFDA recall, enforcement, and drug-approval records", "RapidAPI", rapid_cost
            ),
            provider="rapidapi",
            source="openfda",
            api_slug=RAPIDAPI_SLUGS[2],
            host=f"{RAPIDAPI_SLUGS[2]}.p.rapidapi.com",
            path="/v1/openfda/records",
            parameters=_closed(
                {
                    "dataset": {
                        "type": "string",
                        "enum": [
                            "drug_enforcement",
                            "device_recall",
                            "food_enforcement",
                            "drug_approvals",
                        ],
                        "default": "drug_enforcement",
                        "description": "The allowlisted openFDA dataset to search.",
                    },
                    "searchQuery": _short_text(200, "openFDA search expression or keyword."),
                    "classification": {
                        "type": "string",
                        "enum": ["Class I", "Class II", "Class III"],
                    },
                    "status": {
                        "type": "string",
                        "enum": ["Ongoing", "Completed", "Terminated"],
                    },
                    **rapid,
                }
            ),
            provenance=OPENFDA_PROVENANCE,
        ),
        ToolDefinition(
            name="rapidapi_singapore_green_mark",
            title="RapidAPI: Singapore BCA Green Mark Buildings",
            description=_description(
                "Singapore BCA Green Mark building certificates", "RapidAPI", rapid_cost
            ),
            provider="rapidapi",
            source="singapore_green_mark",
            api_slug=RAPIDAPI_SLUGS[3],
            host=f"{RAPIDAPI_SLUGS[3]}.p.rapidapi.com",
            path="/v1/sg-green-mark/certificates",
            parameters=_closed(
                {
                    "rating": {"type": "string", "enum": list(GREEN_MARK_RATINGS)},
                    **rapid,
                }
            ),
            provenance=SINGAPORE_PROVENANCE,
        ),
        ToolDefinition(
            name="apify_sec_edgar_filings",
            title="Apify: SEC EDGAR Corporate Filings",
            description=_description("SEC EDGAR corporate filings", "Apify Actor", apify_cost),
            provider="apify",
            source="sec_edgar",
            actor_id=APIFY_ACTOR_IDS[0],
            parameters=_closed(_sec_properties(actor_sec), allOf=_company_requirement()),
            provenance=SEC_PROVENANCE,
        ),
        ToolDefinition(
            name="apify_clinical_trials",
            title="Apify: ClinicalTrials.gov Studies",
            description=_description("ClinicalTrials.gov studies", "Apify Actor", apify_cost),
            provider="apify",
            source="clinical_trials",
            actor_id=APIFY_ACTOR_IDS[1],
            parameters=_closed(_clinical_properties(actor_clinical)),
            provenance=CLINICAL_PROVENANCE,
        ),
        ToolDefinition(
            name="apify_uk_gov_tenders",
            title="Apify: UK Government Tenders",
            description=_description(
                "UK Contracts Finder planning, tender, and award notices", "Apify Actor", apify_cost
            ),
            provider="apify",
            source="uk_gov_tenders",
            actor_id=APIFY_ACTOR_IDS[2],
            parameters=_closed(
                {
                    "keyword": _short_text(120, "Case-insensitive notice keyword."),
                    "stages": {
                        "type": "string",
                        "enum": ["tender", "planning", "award", "planning,tender,award"],
                        "default": "tender",
                    },
                    "minValue": {"type": "number", "minimum": 0},
                    "publishedFrom": {
                        "type": "string",
                        "minLength": 10,
                        "maxLength": 40,
                        "pattern": r"^\d{4}-\d{2}-\d{2}(?:T[^\s]{1,30})?$",
                        "description": "Earliest publication date or ISO 8601 timestamp.",
                    },
                    **actor_uk,
                }
            ),
            provenance=UK_TENDERS_PROVENANCE,
        ),
        ToolDefinition(
            name="apify_singapore_green_mark",
            title="Apify: Singapore BCA Green Mark Buildings",
            description=_description(
                "Singapore BCA Green Mark building certificates", "Apify Actor", apify_cost
            ),
            provider="apify",
            source="singapore_green_mark",
            actor_id=APIFY_ACTOR_IDS[3],
            parameters=_closed(
                {
                    "query": _short_text(120, "Project name or certificate reference."),
                    "rating": {"type": "string", "enum": list(GREEN_MARK_RATINGS)},
                    "expiresWithinDays": {"type": "integer", "minimum": 0, "maximum": 3_650},
                    **actor_sg,
                }
            ),
            provenance=SINGAPORE_PROVENANCE,
        ),
    )


__all__ = [
    "APIFY_ACTOR_IDS",
    "RAPIDAPI_SLUGS",
    "ProvenancePolicy",
    "ToolDefinition",
    "build_catalog",
    "thaw",
]
