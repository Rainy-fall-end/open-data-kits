"""Closed catalog for the supported public products."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from types import MappingProxyType
from typing import Final, Mapping


@dataclass(frozen=True, slots=True)
class ApifySource:
    """An allowlisted Apify Actor."""

    key: str
    label: str
    actor_id: str


@dataclass(frozen=True, slots=True)
class RapidAPISource:
    """An allowlisted RapidAPI product and route."""

    key: str
    label: str
    api_slug: str
    host: str
    path: str


_APIFY_SOURCES = {
    "ats_jobs_hiring_signals": ApifySource(
        "ats_jobs_hiring_signals", "ATS Jobs & Hiring Signals", "CRulq5dak4mqAUmMn"
    ),
    # This legacy v0.1 key remains canonical for backwards compatibility.
    "sec_edgar": ApifySource(
        "sec_edgar", "SEC EDGAR Intelligence", "8LFIbRbidiHPknMz5"
    ),
    "global_public_tenders": ApifySource(
        "global_public_tenders",
        "Global Public Tenders & Grants",
        "ZlabhlvEIyRVdtKiQ",
    ),
    "pharma_pipeline_intelligence": ApifySource(
        "pharma_pipeline_intelligence",
        "Pharma & Biotech Pipeline Intelligence",
        "re8aRvtqBonP5HMuY",
    ),
    "usaspending_contracts": ApifySource(
        "usaspending_contracts",
        "USAspending Federal Contracts & Grants",
        "eQQ2beomyLlW4DTGM",
    ),
    "clinical_trials": ApifySource(
        "clinical_trials", "ClinicalTrials.gov Studies", "KchE3qKKrwU0rCe9f"
    ),
    "uk_gov_tenders": ApifySource(
        "uk_gov_tenders", "UK Government Tenders", "txnvyTckeQx4hVBc6"
    ),
    # This legacy v0.1 key remains canonical for backwards compatibility.
    "singapore_green_mark": ApifySource(
        "singapore_green_mark",
        "Singapore BCA Green Mark Buildings",
        "Z3ioK0wOAeczj6nCx",
    ),
}

_RAPIDAPI_SOURCES = {
    "sec_edgar": RapidAPISource(
        "sec_edgar",
        "SEC EDGAR Corporate Filings",
        "sec-edgar-corporate-filings",
        "sec-edgar-corporate-filings.p.rapidapi.com",
        "/v1/sec-edgar/filings",
    ),
    "clinical_trials": RapidAPISource(
        "clinical_trials",
        "ClinicalTrials.gov Studies",
        "clinicaltrials-gov-studies-trials",
        "clinicaltrials-gov-studies-trials.p.rapidapi.com",
        "/v1/clinical-trials/studies",
    ),
    "openfda": RapidAPISource(
        "openfda",
        "openFDA Recalls, Enforcement & Approvals",
        "openfda-recalls-enforcement-approvals",
        "openfda-recalls-enforcement-approvals.p.rapidapi.com",
        "/v1/openfda/records",
    ),
    "singapore_green_mark": RapidAPISource(
        "singapore_green_mark",
        "Singapore BCA Green Mark Buildings",
        "singapore-bca-green-mark-buildings",
        "singapore-bca-green-mark-buildings.p.rapidapi.com",
        "/v1/sg-green-mark/certificates",
    ),
}

APIFY_SOURCES: Final[Mapping[str, ApifySource]] = MappingProxyType(_APIFY_SOURCES)
RAPIDAPI_SOURCES: Final[Mapping[str, RapidAPISource]] = MappingProxyType(
    _RAPIDAPI_SOURCES
)

# Additive spellings resolve to canonical keys without duplicating catalog entries.
APIFY_SOURCE_ALIASES: Final[Mapping[str, str]] = MappingProxyType(
    {
        "sec_edgar_intelligence": "sec_edgar",
        "pharma_pipeline": "pharma_pipeline_intelligence",
        "usaspending": "usaspending_contracts",
        "sg_green_mark": "singapore_green_mark",
    }
)
RAPIDAPI_SOURCE_ALIASES: Final[Mapping[str, str]] = MappingProxyType(
    {
        "sec_edgar_corporate_filings": "sec_edgar",
        "clinicaltrials_studies": "clinical_trials",
        "openfda_recalls": "openfda",
        "sg_green_mark_buildings": "singapore_green_mark",
    }
)


def catalog_dict() -> dict[str, list[dict[str, str]]]:
    """Return a JSON-serializable copy of the exact product catalog."""

    return {
        "apify": [asdict(source) for source in APIFY_SOURCES.values()],
        "rapidapi": [asdict(source) for source in RAPIDAPI_SOURCES.values()],
    }


__all__ = [
    "APIFY_SOURCE_ALIASES",
    "APIFY_SOURCES",
    "RAPIDAPI_SOURCE_ALIASES",
    "RAPIDAPI_SOURCES",
    "ApifySource",
    "RapidAPISource",
    "catalog_dict",
]
