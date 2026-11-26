"""Immutable allowlist for exactly twelve public-data tools."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from types import MappingProxyType
from typing import Any, Final, Mapping


APIFY_ACTOR_IDS: Final = (
    "CRulq5dak4mqAUmMn",
    "8LFIbRbidiHPknMz5",
    "ZlabhlvEIyRVdtKiQ",
    "re8aRvtqBonP5HMuY",
    "eQQ2beomyLlW4DTGM",
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

TOOL_NAMES: Final = (
    "apify_ats_jobs_hiring_signals",
    "apify_sec_edgar_intelligence",
    "apify_global_public_tenders",
    "apify_pharma_pipeline_intelligence",
    "apify_usaspending_contracts",
    "apify_clinical_trials",
    "apify_uk_gov_tenders",
    "apify_sg_green_mark",
    "rapidapi_sec_edgar",
    "rapidapi_clinical_trials",
    "rapidapi_openfda",
    "rapidapi_sg_green_mark",
)

TRIAL_STATUSES: Final = (
    "",
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

GREEN_MARK_RATINGS: Final = ("", "Platinum", "Goldplus", "Gold", "Certified")


@dataclass(frozen=True, slots=True)
class ProvenancePolicy:
    publisher: str
    source_url: str
    license_name: str
    license_url: str
    attribution: str
    allowed_source_hosts: tuple[str, ...]
    allowed_license_hosts: tuple[str, ...]
    source_url_fields: tuple[str, ...]
    identifier_fields: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class ToolDefinition:
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


ATS_PROVENANCE: Final = ProvenancePolicy(
    publisher="Public company ATS job boards",
    source_url="https://boards.greenhouse.io/",
    license_name="Official public job-posting terms",
    license_url="https://www.greenhouse.com/privacy-policy",
    attribution="Source: the employer's public Greenhouse, Ashby, or Lever job board.",
    allowed_source_hosts=("greenhouse.io", "ashbyhq.com", "lever.co"),
    allowed_license_hosts=("greenhouse.com", "ashbyhq.com", "lever.co"),
    source_url_fields=("jobUrl", "applyUrl", "sourceUrl", "url"),
    identifier_fields=("jobId", "id", "sourceId"),
)

SEC_PROVENANCE: Final = ProvenancePolicy(
    publisher="U.S. Securities and Exchange Commission (SEC)",
    source_url="https://www.sec.gov/edgar/search/",
    license_name="U.S. Government-created content / EDGAR public filing reuse",
    license_url="https://www.sec.gov/about/webmaster-frequently-asked-questions",
    attribution="Source: U.S. Securities and Exchange Commission, EDGAR.",
    allowed_source_hosts=("sec.gov",),
    allowed_license_hosts=("sec.gov",),
    source_url_fields=("filingUrl", "documentUrl", "sourceUrl", "url"),
    identifier_fields=("accessionNumber", "accession_number", "cik", "ticker", "id"),
)

GLOBAL_TENDERS_PROVENANCE: Final = ProvenancePolicy(
    publisher="Official public procurement and grant publishers",
    source_url="https://www.find-tender.service.gov.uk/Search",
    license_name="Official source-specific public data terms",
    license_url="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
    attribution="Source and reuse terms are retained from each official upstream record.",
    allowed_source_hosts=(
        "find-tender.service.gov.uk",
        "contractsfinder.service.gov.uk",
        "ted.europa.eu",
        "grants.gov",
        "usaspending.gov",
        "worldbank.org",
        "canadabuys.canada.ca",
        "tenders.gov.au",
    ),
    allowed_license_hosts=(
        "nationalarchives.gov.uk",
        "europa.eu",
        "grants.gov",
        "usaspending.gov",
        "worldbank.org",
        "canada.ca",
        "tenders.gov.au",
    ),
    source_url_fields=("sourceUrl", "noticeUrl", "url"),
    identifier_fields=("ocid", "noticeId", "awardId", "id"),
)

PHARMA_PROVENANCE: Final = ProvenancePolicy(
    publisher="ClinicalTrials.gov, FDA, ChEMBL, and Europe PMC",
    source_url="https://clinicaltrials.gov/",
    license_name="Official upstream biomedical data terms",
    license_url="https://clinicaltrials.gov/terms-conditions",
    attribution="Source: official public biomedical APIs; per-record provenance is retained.",
    allowed_source_hosts=("clinicaltrials.gov", "fda.gov", "ebi.ac.uk", "europepmc.org"),
    allowed_license_hosts=("clinicaltrials.gov", "fda.gov", "ebi.ac.uk", "europepmc.org"),
    source_url_fields=("sourceUrl", "studyUrl", "reportUrl", "url"),
    identifier_fields=("nctId", "chemblId", "pmcid", "id"),
)

USASPENDING_PROVENANCE: Final = ProvenancePolicy(
    publisher="USAspending.gov",
    source_url="https://www.usaspending.gov/search",
    license_name="U.S. Government public spending data",
    license_url="https://www.usaspending.gov/data",
    attribution="Source: USAspending.gov, the official source for U.S. federal spending data.",
    allowed_source_hosts=("usaspending.gov",),
    allowed_license_hosts=("usaspending.gov",),
    source_url_fields=("awardUrl", "sourceUrl", "url"),
    identifier_fields=("awardId", "generated_unique_award_id", "id"),
)

CLINICAL_PROVENANCE: Final = ProvenancePolicy(
    publisher="ClinicalTrials.gov (U.S. National Library of Medicine, NIH)",
    source_url="https://clinicaltrials.gov/",
    license_name="ClinicalTrials.gov Terms and Conditions",
    license_url="https://clinicaltrials.gov/terms-conditions",
    attribution="Source: ClinicalTrials.gov, U.S. National Library of Medicine, NIH.",
    allowed_source_hosts=("clinicaltrials.gov",),
    allowed_license_hosts=("clinicaltrials.gov",),
    source_url_fields=("studyUrl", "sourceUrl", "url"),
    identifier_fields=("nctId", "nct_id", "NCTId", "id"),
)

UK_TENDERS_PROVENANCE: Final = ProvenancePolicy(
    publisher="UK Government Contracts Finder",
    source_url="https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search",
    license_name="Open Government Licence v3.0",
    license_url="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
    attribution="Contains public sector information licensed under the Open Government Licence v3.0.",
    allowed_source_hosts=("contractsfinder.service.gov.uk",),
    allowed_license_hosts=("nationalarchives.gov.uk",),
    source_url_fields=("noticeUrl", "sourceUrl", "url"),
    identifier_fields=("ocid", "noticeId", "notice_id", "id"),
)

OPENFDA_PROVENANCE: Final = ProvenancePolicy(
    publisher="U.S. Food and Drug Administration (openFDA)",
    source_url="https://open.fda.gov/",
    license_name="Public Domain and CC0 1.0 Universal",
    license_url="https://open.fda.gov/terms/",
    attribution="Data provided by the U.S. Food and Drug Administration through openFDA.",
    allowed_source_hosts=("fda.gov",),
    allowed_license_hosts=("fda.gov",),
    source_url_fields=("sourceUrl", "reportUrl", "url"),
    identifier_fields=("recallNumber", "applicationNumber", "event_id", "id"),
)

SINGAPORE_PROVENANCE: Final = ProvenancePolicy(
    publisher="Building and Construction Authority, Singapore",
    source_url="https://data.gov.sg/datasets/d_c4bd082b48fa7611713f39e23d250c27/view",
    license_name="Singapore Open Data Licence v1.0",
    license_url="https://developers.data.gov.sg/open-data-licence",
    attribution="Contains BCA Green Mark information made available under the Singapore Open Data Licence v1.0.",
    allowed_source_hosts=("data.gov.sg",),
    allowed_license_hosts=("data.gov.sg",),
    source_url_fields=("sourceUrl", "url"),
    identifier_fields=("certificateReference", "referenceNo", "projectName", "id"),
)


def _freeze(value: Any) -> Any:
    if isinstance(value, dict):
        return MappingProxyType({key: _freeze(item) for key, item in value.items()})
    if isinstance(value, list):
        return tuple(_freeze(item) for item in value)
    return value


def thaw(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {str(key): thaw(item) for key, item in value.items()}
    if isinstance(value, tuple):
        return [thaw(item) for item in value]
    return value


def _closed(properties: dict[str, Any], **extras: Any) -> Mapping[str, Any]:
    return _freeze(
        {"type": "object", "properties": properties, "additionalProperties": False, **extras}
    )


def _string(description: str, *, default: str | None = None, max_length: int = 200,
            pattern: str | None = None) -> dict[str, Any]:
    result: dict[str, Any] = {
        "type": "string",
        "maxLength": max_length,
        "description": description,
    }
    if default is not None:
        result["default"] = default
    if pattern is not None:
        result["pattern"] = pattern
    return result


def _string_list(description: str, *, default: list[str], enum: list[str] | None = None,
                 max_items: int = 100) -> dict[str, Any]:
    items: dict[str, Any] = {"type": "string", "minLength": 1, "maxLength": 500}
    if enum is not None:
        items["enum"] = enum
    return {
        "type": "array",
        "items": items,
        "maxItems": max_items,
        "default": default,
        "description": description,
    }


def _charge_control(cap: Decimal) -> dict[str, Any]:
    return {
        "maxTotalChargeUsd": {
            "type": "number",
            "exclusiveMinimum": 0,
            "maximum": float(cap),
            "multipleOf": 0.000001,
            "default": float(cap),
            "description": "Server-side Apify run charge cap in USD; cannot exceed the dispatcher cap.",
        }
    }


def _max_items(maximum: int) -> dict[str, Any]:
    return {
        "type": "integer",
        "minimum": 1,
        "maximum": maximum,
        "default": 10,
        "description": "Maximum records returned by the Actor.",
    }


def _rapid_limit() -> dict[str, Any]:
    return {
        "type": "integer",
        "minimum": 1,
        "maximum": 20,
        "default": 5,
        "description": "Maximum rows requested from this RapidAPI endpoint.",
    }


def _description(subject: str, provider: str) -> str:
    cost = (
        "Every run has a maxTotalChargeUsd server-side cap."
        if provider == "Apify"
        else "The request is row-limited; RapidAPI billing is governed by the subscribed plan."
    )
    return (
        f"Read current {subject} from the allowlisted {provider} endpoint. {cost} "
        "Credentials come only from dispatcher configuration and must never be tool arguments."
    )


def _clinical_properties(limit_property: dict[str, Any]) -> dict[str, Any]:
    return {
        "condition": _string("Condition or disease.", default=""),
        "intervention": _string("Intervention or treatment.", default=""),
        "status": {
            "type": "string",
            "enum": list(TRIAL_STATUSES),
            "default": "",
            "description": "ClinicalTrials.gov overall recruitment status.",
        },
        "sponsor": _string("Lead sponsor or collaborator.", default=""),
        "queryTerm": _string("General study keyword.", default=""),
        "limit" if "default" in limit_property and limit_property.get("maximum") == 20 else "maxItems": limit_property,
    }


def _rapid_sec_properties() -> dict[str, Any]:
    return {
        "mode": {
            "type": "string",
            "enum": ["search", "company"],
            "default": "search",
            "description": "Full-text/recent filing search or company lookup.",
        },
        "query": _string("Full-text EDGAR keyword query."),
        "forms": _string("Comma-separated SEC form types.", default="10-K,10-Q,8-K", max_length=100),
        "cik": _string("SEC Central Index Key.", max_length=10, pattern=r"^\d{1,10}$"),
        "ticker": _string("U.S. stock ticker.", max_length=16, pattern=r"^[A-Za-z][A-Za-z0-9.-]{0,15}$"),
        "startDate": {"type": "string", "format": "date"},
        "endDate": {"type": "string", "format": "date"},
        "limit": _rapid_limit(),
    }


def build_catalog(hard_charge_usd: Decimal) -> tuple[ToolDefinition, ...]:
    """Build the closed twelve-tool catalog for an immutable Apify cap."""

    charge = _charge_control(hard_charge_usd)
    sources = [
        "uk_find_a_tender",
        "eu_ted",
        "us_grants_gov",
        "usaspending",
        "world_bank",
        "canada_contracts",
        "austender",
    ]
    opportunity_types = ["tender", "grant", "award"]

    return (
        ToolDefinition(
            name=TOOL_NAMES[0],
            title="Apify: ATS Jobs & Hiring Signals",
            description=_description("public ATS job postings and hiring signals", "Apify"),
            provider="apify",
            source="ats_jobs_hiring_signals",
            actor_id=APIFY_ACTOR_IDS[0],
            parameters=_closed({
                "preset": {
                    "type": "string",
                    "enum": ["ai_leaders", "fintech_saas", "all_curated", "custom_only"],
                    "default": "ai_leaders",
                },
                "companyBoards": _string_list("Custom ATS board shorthands or public career URLs.", default=[]),
                "keywords": _string("Comma-separated case-insensitive OR keywords.", default="", max_length=500),
                "remoteOnly": {"type": "boolean", "default": False},
                "departmentFilter": _string("Department, team, or signal-category substring.", default=""),
                "includeDescription": {"type": "boolean", "default": False},
                "maxItems": _max_items(10_000),
                **charge,
            }),
            provenance=ATS_PROVENANCE,
        ),
        ToolDefinition(
            name=TOOL_NAMES[1],
            title="Apify: SEC EDGAR Intelligence",
            description=_description("SEC Form D funding, XBRL financials, or filings", "Apify"),
            provider="apify",
            source="sec_edgar",
            actor_id=APIFY_ACTOR_IDS[1],
            parameters=_closed({
                "mode": {
                    "type": "string",
                    "enum": ["form_d_funding", "xbrl_financials", "filings"],
                    "default": "form_d_funding",
                },
                "query": _string("Funding or filing keyword.", default=""),
                "ticker": _string("U.S. stock ticker.", default="", max_length=16, pattern=r"^(?:|[A-Za-z][A-Za-z0-9.-]{0,15})$"),
                "cik": _string("SEC CIK.", default="", max_length=10, pattern=r"^(?:|\d{1,10})$"),
                "forms": _string("Comma-separated SEC form types.", default="10-K,10-Q,8-K", max_length=100),
                "startDate": _string("Earliest YYYY-MM-DD date.", default="", max_length=10, pattern=r"^(?:|\d{4}-\d{2}-\d{2})$"),
                "endDate": _string("Latest YYYY-MM-DD date.", default="", max_length=10, pattern=r"^(?:|\d{4}-\d{2}-\d{2})$"),
                "excludePooledFunds": {"type": "boolean", "default": False},
                "minOfferingAmountUsd": {"type": "integer", "minimum": 0},
                "industryFilter": _string("SEC industry-group substring.", default=""),
                "includeAmendments": {"type": "boolean", "default": True},
                "maxItems": _max_items(5_000),
                **charge,
            }),
            provenance=SEC_PROVENANCE,
        ),
        ToolDefinition(
            name=TOOL_NAMES[2],
            title="Apify: Global Public Tenders & Grants",
            description=_description("global public tenders, grants, and awards", "Apify"),
            provider="apify",
            source="global_public_tenders",
            actor_id=APIFY_ACTOR_IDS[2],
            parameters=_closed({
                "sources": _string_list("Official APIs to query.", default=sources, enum=sources, max_items=7),
                "opportunityTypes": _string_list("Normalized opportunity types.", default=opportunity_types, enum=opportunity_types, max_items=3),
                "keyword": _string("Optional opportunity keyword.", default=""),
                "dateFrom": _string("Optional YYYY-MM-DD start date.", default="", max_length=10, pattern=r"^(?:|\d{4}-\d{2}-\d{2})$"),
                "dateTo": _string("Optional YYYY-MM-DD end date.", default="", max_length=10, pattern=r"^(?:|\d{4}-\d{2}-\d{2})$"),
                "maxItems": _max_items(5_000),
                "perSourceLimit": {"type": "integer", "minimum": 1, "maximum": 1_000, "default": 2},
                "sourceTimeoutSecs": {"type": "integer", "minimum": 1, "maximum": 30, "default": 20},
                **charge,
            }),
            provenance=GLOBAL_TENDERS_PROVENANCE,
        ),
        ToolDefinition(
            name=TOOL_NAMES[3],
            title="Apify: Pharma & Biotech Pipeline Intelligence",
            description=_description("cross-linked pharma and biotech pipeline intelligence", "Apify"),
            provider="apify",
            source="pharma_pipeline",
            actor_id=APIFY_ACTOR_IDS[3],
            parameters=_closed({
                "mode": {"type": "string", "enum": ["drug_dossier", "pipeline_feed"], "default": "drug_dossier"},
                "query": {
                    **_string("Drug, molecule, or indication.", default="semaglutide", max_length=200),
                    "minLength": 1,
                },
                "drugNames": _string_list("Drug names that take precedence over query.", default=[], max_items=100),
                "maxItems": _max_items(1_000),
                "sourceItemsPerQuery": {"type": "integer", "minimum": 1, "maximum": 25, "default": 5},
                "sourceTimeoutSeconds": {"type": "integer", "minimum": 2, "maximum": 60, "default": 25},
                "requestDelayMs": {"type": "integer", "minimum": 0, "maximum": 5_000, "default": 150},
                **charge,
            }),
            provenance=PHARMA_PROVENANCE,
        ),
        ToolDefinition(
            name=TOOL_NAMES[4],
            title="Apify: USAspending Contracts & Grants",
            description=_description("U.S. federal awards from USAspending.gov", "Apify"),
            provider="apify",
            source="usaspending",
            actor_id=APIFY_ACTOR_IDS[4],
            parameters=_closed({
                "keyword": _string("Optional free-text award keyword.", default=""),
                "awardCategory": {"type": "string", "enum": ["contracts", "grants", "idvs"], "default": "contracts"},
                "startDate": {"type": "string", "format": "date", "default": "2025-01-01"},
                "endDate": {"type": "string", "format": "date", "default": "2026-12-31"},
                "awardingAgency": _string("Optional awarding agency name.", default=""),
                "minAwardAmount": {"type": "number", "minimum": 0},
                "naicsCode": _string("Optional NAICS code.", default="", max_length=20),
                "sortOrder": {"type": "string", "enum": ["desc", "asc"], "default": "desc"},
                "maxItems": _max_items(5_000),
                **charge,
            }),
            provenance=USASPENDING_PROVENANCE,
        ),
        ToolDefinition(
            name=TOOL_NAMES[5],
            title="Apify: ClinicalTrials.gov Studies",
            description=_description("ClinicalTrials.gov studies", "Apify"),
            provider="apify",
            source="clinical_trials",
            actor_id=APIFY_ACTOR_IDS[5],
            parameters=_closed({**_clinical_properties(_max_items(5_000)), **charge}),
            provenance=CLINICAL_PROVENANCE,
        ),
        ToolDefinition(
            name=TOOL_NAMES[6],
            title="Apify: UK Government Tenders",
            description=_description("UK Contracts Finder notices", "Apify"),
            provider="apify",
            source="uk_gov_tenders",
            actor_id=APIFY_ACTOR_IDS[6],
            parameters=_closed({
                "keyword": _string("Notice keyword.", default="", max_length=120),
                "stages": {"type": "string", "enum": ["tender", "planning", "award", "planning,tender,award"], "default": "tender"},
                "minValue": {"type": "number", "minimum": 0},
                "publishedFrom": _string("Earliest ISO 8601 publication date.", default="", max_length=40),
                "maxItems": _max_items(2_000),
                **charge,
            }),
            provenance=UK_TENDERS_PROVENANCE,
        ),
        ToolDefinition(
            name=TOOL_NAMES[7],
            title="Apify: Singapore BCA Green Mark Buildings",
            description=_description("Singapore BCA Green Mark certificates", "Apify"),
            provider="apify",
            source="singapore_green_mark",
            actor_id=APIFY_ACTOR_IDS[7],
            parameters=_closed({
                "query": _string("Project name or certificate reference.", default="", max_length=120),
                "rating": {"type": "string", "enum": list(GREEN_MARK_RATINGS), "default": ""},
                "expiresWithinDays": {"type": "integer", "minimum": 0, "maximum": 3_650},
                "maxItems": _max_items(1_000),
                **charge,
            }),
            provenance=SINGAPORE_PROVENANCE,
        ),
        ToolDefinition(
            name=TOOL_NAMES[8],
            title="RapidAPI: SEC EDGAR Corporate Filings",
            description=_description("SEC EDGAR corporate filings", "RapidAPI"),
            provider="rapidapi",
            source="sec_edgar",
            api_slug=RAPIDAPI_SLUGS[0],
            host=f"{RAPIDAPI_SLUGS[0]}.p.rapidapi.com",
            path="/v1/sec-edgar/filings",
            parameters=_closed(_rapid_sec_properties()),
            provenance=SEC_PROVENANCE,
        ),
        ToolDefinition(
            name=TOOL_NAMES[9],
            title="RapidAPI: ClinicalTrials.gov Studies",
            description=_description("ClinicalTrials.gov studies", "RapidAPI"),
            provider="rapidapi",
            source="clinical_trials",
            api_slug=RAPIDAPI_SLUGS[1],
            host=f"{RAPIDAPI_SLUGS[1]}.p.rapidapi.com",
            path="/v1/clinical-trials/studies",
            parameters=_closed(_clinical_properties(_rapid_limit())),
            provenance=CLINICAL_PROVENANCE,
        ),
        ToolDefinition(
            name=TOOL_NAMES[10],
            title="RapidAPI: openFDA Records",
            description=_description("openFDA recall, enforcement, and approval records", "RapidAPI"),
            provider="rapidapi",
            source="openfda",
            api_slug=RAPIDAPI_SLUGS[2],
            host=f"{RAPIDAPI_SLUGS[2]}.p.rapidapi.com",
            path="/v1/openfda/records",
            parameters=_closed({
                "dataset": {
                    "type": "string",
                    "enum": ["drug_enforcement", "device_recall", "food_enforcement", "drug_approvals"],
                    "default": "drug_enforcement",
                },
                "searchQuery": _string("openFDA search expression or keyword."),
                "classification": {"type": "string", "enum": ["Class I", "Class II", "Class III"]},
                "status": {"type": "string", "enum": ["Ongoing", "Completed", "Terminated"]},
                "limit": _rapid_limit(),
            }),
            provenance=OPENFDA_PROVENANCE,
        ),
        ToolDefinition(
            name=TOOL_NAMES[11],
            title="RapidAPI: Singapore BCA Green Mark Buildings",
            description=_description("Singapore BCA Green Mark certificates", "RapidAPI"),
            provider="rapidapi",
            source="singapore_green_mark",
            api_slug=RAPIDAPI_SLUGS[3],
            host=f"{RAPIDAPI_SLUGS[3]}.p.rapidapi.com",
            path="/v1/sg-green-mark/certificates",
            parameters=_closed({
                "rating": {"type": "string", "enum": list(GREEN_MARK_RATINGS), "default": ""},
                "limit": _rapid_limit(),
            }),
            provenance=SINGAPORE_PROVENANCE,
        ),
    )


__all__ = [
    "APIFY_ACTOR_IDS",
    "RAPIDAPI_SLUGS",
    "TOOL_NAMES",
    "ProvenancePolicy",
    "ToolDefinition",
    "build_catalog",
    "thaw",
]
