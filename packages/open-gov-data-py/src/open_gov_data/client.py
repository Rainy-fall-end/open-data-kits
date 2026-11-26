"""Synchronous standard-library client and twelve typed product helpers."""

from __future__ import annotations

import json
import os
import socket
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from decimal import Decimal
from http.client import HTTPException
from typing import Any, Final, Literal
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit, urlunsplit
from urllib.request import HTTPRedirectHandler, OpenerDirector, Request, build_opener

from .catalog import (
    APIFY_SOURCE_ALIASES,
    APIFY_SOURCES,
    RAPIDAPI_SOURCE_ALIASES,
    RAPIDAPI_SOURCES,
)
from .errors import OpenGovDataError
from .schemas import ACTOR_INPUT_SCHEMAS, RAPIDAPI_QUERY_SCHEMAS
from .validation import (
    TYPED_HELPER_MAX_CHARGE_USD,
    format_charge,
    parse_input,
    rapidapi_query_value,
    validate_charge,
    validate_credential,
    validate_max_items,
    validate_schema_input,
    validate_timeout,
)


APIFY_BASE_URL: Final = "https://api.apify.com"
MAX_RESPONSE_BYTES: Final = 10_000_000
USER_AGENT: Final = "open-gov-data/0.2.0 (Python urllib)"
_LOOPBACK_HOSTS: Final = frozenset({"127.0.0.1", "::1", "localhost"})

SecIntelligenceMode = Literal["form_d_funding", "xbrl_financials", "filings"]
RapidSecMode = Literal["search", "company"]
TrialStatus = Literal[
    "RECRUITING",
    "NOT_YET_RECRUITING",
    "ACTIVE_NOT_RECRUITING",
    "COMPLETED",
    "ENROLLING_BY_INVITATION",
    "SUSPENDED",
    "TERMINATED",
    "WITHDRAWN",
    "UNKNOWN",
]


class _NoRedirectHandler(HTTPRedirectHandler):
    def redirect_request(
        self,
        req: Request,
        fp: Any,
        code: int,
        msg: str,
        headers: Any,
        newurl: str,
    ) -> None:
        return None


def _validate_base_url(value: str, *, production_url: str | None) -> str:
    if not isinstance(value, str):
        raise OpenGovDataError("ENDPOINT_INVALID", "Endpoint base URL is invalid")
    parts = urlsplit(value)
    try:
        port = parts.port
    except ValueError:
        raise OpenGovDataError(
            "ENDPOINT_INVALID", "Endpoint base URL is invalid"
        ) from None
    is_production = production_url is not None and value.rstrip("/") == production_url
    is_loopback = (
        parts.scheme in {"http", "https"}
        and parts.hostname in _LOOPBACK_HOSTS
        and port is not None
    )
    if (
        (not is_production and not is_loopback)
        or parts.username is not None
        or parts.password is not None
        or parts.query
        or parts.fragment
        or parts.path not in {"", "/"}
    ):
        raise OpenGovDataError(
            "ENDPOINT_INVALID",
            "Endpoint overrides are restricted to local loopback testing",
        )
    return value.rstrip("/")


def _join_url(base_url: str, path: str, query: Mapping[str, str]) -> str:
    base = urlsplit(base_url)
    return urlunsplit((base.scheme, base.netloc, path, urlencode(query), ""))


def _extract_records(payload: object) -> list[object]:
    if isinstance(payload, list):
        return list(payload)
    if isinstance(payload, dict):
        for key in ("items", "results", "records", "data"):
            value = payload.get(key)
            if isinstance(value, list):
                return list(value)
        return [payload]
    if payload is None:
        return []
    return [{"value": payload}]


def _without_none(value: Mapping[str, Any]) -> dict[str, Any]:
    return {key: nested for key, nested in value.items() if nested is not None}


@dataclass(slots=True)
class OpenGovDataClient:
    """Zero-dependency client for eight Apify and four RapidAPI products.

    The v0.1 ``request``, ``run_actor``, ``query_rapidapi``, ``records``, and
    ``from_env`` interfaces remain available. Credentials are excluded from
    repr and comparison. Private base URL overrides accept loopback origins
    only and exist for deterministic integration tests.
    """

    apify_token: str | None = field(default=None, repr=False, compare=False)
    rapidapi_key: str | None = field(default=None, repr=False, compare=False)
    max_total_charge_usd: Decimal | str | int | float = Decimal("0.25")
    timeout: float = 30.0
    _apify_base_url: str = field(
        default=APIFY_BASE_URL, repr=False, compare=False, kw_only=True
    )
    _rapidapi_base_url: str | None = field(
        default=None, repr=False, compare=False, kw_only=True
    )
    _opener: OpenerDirector | None = field(
        default=None, repr=False, compare=False, kw_only=True
    )

    def __post_init__(self) -> None:
        self.max_total_charge_usd = validate_charge(self.max_total_charge_usd)
        self.timeout = validate_timeout(self.timeout)
        self._apify_base_url = _validate_base_url(
            self._apify_base_url, production_url=APIFY_BASE_URL
        )
        if self._rapidapi_base_url is not None:
            self._rapidapi_base_url = _validate_base_url(
                self._rapidapi_base_url, production_url=None
            )
        if self.apify_token is not None:
            validate_credential("apify", self.apify_token)
        if self.rapidapi_key is not None:
            validate_credential("rapidapi", self.rapidapi_key)
        if self._opener is None:
            self._opener = build_opener(_NoRedirectHandler())

    @classmethod
    def from_env(
        cls,
        *,
        environ: Mapping[str, str] | None = None,
        max_total_charge_usd: Decimal | str | int | float = Decimal("0.25"),
        timeout: float = 30.0,
    ) -> OpenGovDataClient:
        """Load optional credentials from conventional environment variables."""

        values = os.environ if environ is None else environ
        rapidapi_key = (
            values.get("RAPIDAPI_KEY")
            or values.get("X_RAPIDAPI_KEY")
            or values.get("X-RapidAPI-Key")
        )
        return cls(
            apify_token=values.get("APIFY_TOKEN"),
            rapidapi_key=rapidapi_key,
            max_total_charge_usd=max_total_charge_usd,
            timeout=timeout,
        )

    def request(
        self,
        provider: str,
        source: str,
        request_input: Mapping[str, Any] | str | None = None,
        *,
        max_items: int = 10,
        max_total_charge_usd: Decimal | str | int | float | None = None,
    ) -> object:
        """Execute one closed-catalog request with one attempt and no retries."""

        if not isinstance(provider, str):
            raise OpenGovDataError("PROVIDER_NOT_ALLOWED", "Provider is not allowed")
        if provider == "apify":
            return self.run_actor(
                source,
                request_input,
                max_items=max_items,
                max_total_charge_usd=max_total_charge_usd,
            )
        if provider == "rapidapi":
            if max_total_charge_usd is not None:
                raise OpenGovDataError(
                    "COST_LIMIT_UNSUPPORTED",
                    "RapidAPI does not expose a per-request dollar cap; use max_items",
                )
            return self.query_rapidapi(source, request_input, max_items=max_items)
        raise OpenGovDataError("PROVIDER_NOT_ALLOWED", "Provider is not allowed")

    def run_actor(
        self,
        source: str,
        actor_input: Mapping[str, Any] | str | None = None,
        *,
        max_items: int = 10,
        max_total_charge_usd: Decimal | str | int | float | None = None,
    ) -> object:
        """Run an allowlisted Apify Actor synchronously with a server-side cap."""

        if not isinstance(source, str):
            raise OpenGovDataError("SOURCE_NOT_ALLOWED", "Source is not allowed")
        canonical = APIFY_SOURCE_ALIASES.get(source, source)
        definition = APIFY_SOURCES.get(canonical)
        if definition is None:
            raise OpenGovDataError("SOURCE_NOT_ALLOWED", "Source is not allowed")
        parsed = parse_input(actor_input)
        maximum = int(ACTOR_INPUT_SCHEMAS[canonical]["maxItems"]["maximum"])
        item_limit = validate_max_items(max_items, maximum=maximum)
        credential = validate_credential("apify", self.apify_token)
        cap = (
            self.max_total_charge_usd
            if max_total_charge_usd is None
            else validate_charge(max_total_charge_usd)
        )
        if cap > self.max_total_charge_usd:
            raise OpenGovDataError(
                "COST_LIMIT_EXCEEDED",
                "Per-request charge cap cannot exceed the client hard limit",
            )
        parsed.pop("maxItems", None)
        parsed["maxItems"] = item_limit
        body = json.dumps(
            parsed, ensure_ascii=False, allow_nan=False, separators=(",", ":")
        ).encode("utf-8")
        url = _join_url(
            self._apify_base_url,
            f"/v2/acts/{definition.actor_id}/run-sync-get-dataset-items",
            {"maxTotalChargeUsd": format_charge(cap), "clean": "true"},
        )
        request = Request(
            url,
            data=body,
            method="POST",
            headers={
                "Accept": "application/json",
                "Authorization": f"Bearer {credential}",
                "Content-Type": "application/json; charset=utf-8",
                "User-Agent": USER_AGENT,
            },
        )
        return self._fetch_json(request)

    def query_rapidapi(
        self,
        source: str,
        query: Mapping[str, Any] | str | None = None,
        *,
        max_items: int = 10,
    ) -> object:
        """Query an allowlisted RapidAPI route with a returned-row cap."""

        if not isinstance(source, str):
            raise OpenGovDataError("SOURCE_NOT_ALLOWED", "Source is not allowed")
        canonical = RAPIDAPI_SOURCE_ALIASES.get(source, source)
        definition = RAPIDAPI_SOURCES.get(canonical)
        if definition is None:
            raise OpenGovDataError("SOURCE_NOT_ALLOWED", "Source is not allowed")
        parsed = parse_input(query)
        item_limit = validate_max_items(max_items)
        credential = validate_credential("rapidapi", self.rapidapi_key)
        parsed.pop("limit", None)
        parsed.pop("maxItems", None)
        query_values: dict[str, str] = {}
        for key, value in parsed.items():
            serialized = rapidapi_query_value(value)
            if serialized is not None:
                query_values[key] = serialized
        query_values["limit"] = str(item_limit)
        base_url = self._rapidapi_base_url or f"https://{definition.host}"
        url = _join_url(base_url, definition.path, query_values)
        request = Request(
            url,
            method="GET",
            headers={
                "Accept": "application/json",
                "User-Agent": USER_AGENT,
                "X-RapidAPI-Host": definition.host,
                "X-RapidAPI-Key": credential,
            },
        )
        return self._fetch_json(request)

    def records(
        self,
        provider: str,
        source: str,
        request_input: Mapping[str, Any] | str | None = None,
        *,
        max_items: int = 10,
        max_total_charge_usd: Decimal | str | int | float | None = None,
    ) -> list[object]:
        """Execute a request and normalize common response envelopes to a list."""

        return _extract_records(
            self.request(
                provider,
                source,
                request_input,
                max_items=max_items,
                max_total_charge_usd=max_total_charge_usd,
            )
        )

    def _typed_actor(
        self,
        source: str,
        payload: Mapping[str, Any],
        max_total_charge_usd: Decimal | str | int | float | None,
    ) -> object:
        validated = validate_schema_input(payload, ACTOR_INPUT_SCHEMAS[source])
        max_items = int(validated.pop("maxItems"))
        if max_total_charge_usd is None:
            cap = min(self.max_total_charge_usd, TYPED_HELPER_MAX_CHARGE_USD)
        else:
            cap = validate_charge(max_total_charge_usd)
            if cap > TYPED_HELPER_MAX_CHARGE_USD:
                raise OpenGovDataError(
                    "COST_LIMIT_EXCEEDED",
                    "Typed helper charge cap cannot exceed 0.25 USD",
                )
        return self.run_actor(
            source,
            validated,
            max_items=max_items,
            max_total_charge_usd=cap,
        )

    def _typed_rapidapi(self, source: str, payload: Mapping[str, Any]) -> object:
        validated = validate_schema_input(payload, RAPIDAPI_QUERY_SCHEMAS[source])
        max_items = int(validated.pop("limit"))
        return self.query_rapidapi(source, validated, max_items=max_items)

    # --- Eight typed Apify helpers -------------------------------------------------

    def ats_jobs_hiring_signals(
        self,
        *,
        preset: Literal[
            "ai_leaders", "fintech_saas", "all_curated", "custom_only"
        ] = "ai_leaders",
        company_boards: Sequence[str] = (),
        keywords: str = "",
        remote_only: bool = False,
        department_filter: str = "",
        include_description: bool = False,
        max_items: int = 10,
        max_total_charge_usd: Decimal | str | int | float | None = None,
    ) -> object:
        return self._typed_actor(
            "ats_jobs_hiring_signals",
            {
                "preset": preset,
                "companyBoards": list(company_boards),
                "keywords": keywords,
                "remoteOnly": remote_only,
                "departmentFilter": department_filter,
                "includeDescription": include_description,
                "maxItems": max_items,
            },
            max_total_charge_usd,
        )

    def sec_edgar_intelligence(
        self,
        *,
        mode: SecIntelligenceMode = "form_d_funding",
        query: str = "",
        ticker: str = "",
        cik: str = "",
        forms: str = "10-K,10-Q,8-K",
        start_date: str = "",
        end_date: str = "",
        exclude_pooled_funds: bool = False,
        min_offering_amount_usd: int | None = None,
        industry_filter: str = "",
        include_amendments: bool = True,
        max_items: int = 10,
        max_total_charge_usd: Decimal | str | int | float | None = None,
    ) -> object:
        return self._typed_actor(
            "sec_edgar",
            _without_none(
                {
                    "mode": mode,
                    "query": query,
                    "ticker": ticker,
                    "cik": cik,
                    "forms": forms,
                    "startDate": start_date,
                    "endDate": end_date,
                    "excludePooledFunds": exclude_pooled_funds,
                    "minOfferingAmountUsd": min_offering_amount_usd,
                    "industryFilter": industry_filter,
                    "includeAmendments": include_amendments,
                    "maxItems": max_items,
                }
            ),
            max_total_charge_usd,
        )

    def global_public_tenders(
        self,
        *,
        sources: Sequence[str] = (
            "uk_find_a_tender",
            "eu_ted",
            "us_grants_gov",
            "usaspending",
            "world_bank",
            "canada_contracts",
            "austender",
        ),
        opportunity_types: Sequence[str] = ("tender", "grant", "award"),
        keyword: str = "",
        date_from: str = "",
        date_to: str = "",
        per_source_limit: int = 2,
        source_timeout_secs: int = 20,
        max_items: int = 10,
        max_total_charge_usd: Decimal | str | int | float | None = None,
    ) -> object:
        return self._typed_actor(
            "global_public_tenders",
            {
                "sources": list(sources),
                "opportunityTypes": list(opportunity_types),
                "keyword": keyword,
                "dateFrom": date_from,
                "dateTo": date_to,
                "perSourceLimit": per_source_limit,
                "sourceTimeoutSecs": source_timeout_secs,
                "maxItems": max_items,
            },
            max_total_charge_usd,
        )

    def pharma_pipeline_intelligence(
        self,
        *,
        mode: Literal["drug_dossier", "pipeline_feed"] = "drug_dossier",
        query: str = "semaglutide",
        drug_names: Sequence[str] = (),
        source_items_per_query: int = 5,
        source_timeout_seconds: int = 25,
        request_delay_ms: int = 150,
        max_items: int = 10,
        max_total_charge_usd: Decimal | str | int | float | None = None,
    ) -> object:
        return self._typed_actor(
            "pharma_pipeline_intelligence",
            {
                "mode": mode,
                "query": query,
                "drugNames": list(drug_names),
                "sourceItemsPerQuery": source_items_per_query,
                "sourceTimeoutSeconds": source_timeout_seconds,
                "requestDelayMs": request_delay_ms,
                "maxItems": max_items,
            },
            max_total_charge_usd,
        )

    def usaspending_contracts(
        self,
        *,
        keyword: str = "",
        award_category: Literal["contracts", "grants", "idvs"] = "contracts",
        start_date: str = "2025-01-01",
        end_date: str = "2026-12-31",
        awarding_agency: str = "",
        min_award_amount: int | float | None = None,
        naics_code: str = "",
        sort_order: Literal["desc", "asc"] = "desc",
        max_items: int = 10,
        max_total_charge_usd: Decimal | str | int | float | None = None,
    ) -> object:
        return self._typed_actor(
            "usaspending_contracts",
            _without_none(
                {
                    "keyword": keyword,
                    "awardCategory": award_category,
                    "startDate": start_date,
                    "endDate": end_date,
                    "awardingAgency": awarding_agency,
                    "minAwardAmount": min_award_amount,
                    "naicsCode": naics_code,
                    "sortOrder": sort_order,
                    "maxItems": max_items,
                }
            ),
            max_total_charge_usd,
        )

    def clinical_trials(
        self,
        *,
        condition: str = "",
        intervention: str = "",
        status: str = "",
        sponsor: str = "",
        query_term: str = "",
        max_items: int = 10,
        max_total_charge_usd: Decimal | str | int | float | None = None,
    ) -> object:
        return self._typed_actor(
            "clinical_trials",
            {
                "condition": condition,
                "intervention": intervention,
                "status": status,
                "sponsor": sponsor,
                "queryTerm": query_term,
                "maxItems": max_items,
            },
            max_total_charge_usd,
        )

    def uk_gov_tenders(
        self,
        *,
        keyword: str = "",
        stages: Literal[
            "tender", "planning", "award", "planning,tender,award"
        ] = "tender",
        min_value: int | float | None = None,
        published_from: str = "",
        max_items: int = 10,
        max_total_charge_usd: Decimal | str | int | float | None = None,
    ) -> object:
        return self._typed_actor(
            "uk_gov_tenders",
            _without_none(
                {
                    "keyword": keyword,
                    "stages": stages,
                    "minValue": min_value,
                    "publishedFrom": published_from,
                    "maxItems": max_items,
                }
            ),
            max_total_charge_usd,
        )

    def sg_green_mark(
        self,
        *,
        query: str = "",
        rating: Literal["", "Platinum", "Goldplus", "Gold", "Certified"] = "",
        expires_within_days: int | None = None,
        max_items: int = 10,
        max_total_charge_usd: Decimal | str | int | float | None = None,
    ) -> object:
        return self._typed_actor(
            "singapore_green_mark",
            _without_none(
                {
                    "query": query,
                    "rating": rating,
                    "expiresWithinDays": expires_within_days,
                    "maxItems": max_items,
                }
            ),
            max_total_charge_usd,
        )

    # --- Four typed RapidAPI helpers ---------------------------------------------

    def sec_edgar_corporate_filings(
        self,
        *,
        mode: RapidSecMode = "search",
        query: str = "",
        forms: str = "10-K,10-Q,8-K",
        cik: str = "",
        ticker: str = "",
        start_date: str = "",
        end_date: str = "",
        max_items: int = 5,
    ) -> object:
        return self._typed_rapidapi(
            "sec_edgar",
            {
                "mode": mode,
                "query": query,
                "forms": forms,
                "cik": cik,
                "ticker": ticker,
                "startDate": start_date,
                "endDate": end_date,
                "limit": max_items,
            },
        )

    def clinicaltrials_studies(
        self,
        *,
        condition: str = "",
        intervention: str = "",
        status: TrialStatus | None = None,
        sponsor: str = "",
        query_term: str = "",
        max_items: int = 5,
    ) -> object:
        return self._typed_rapidapi(
            "clinical_trials",
            _without_none(
                {
                    "condition": condition,
                    "intervention": intervention,
                    "status": status,
                    "sponsor": sponsor,
                    "queryTerm": query_term,
                    "limit": max_items,
                }
            ),
        )

    def openfda_recalls(
        self,
        *,
        dataset: Literal[
            "drug_enforcement",
            "device_recall",
            "food_enforcement",
            "drug_approvals",
        ] = "drug_enforcement",
        search_query: str = "",
        classification: Literal["Class I", "Class II", "Class III"] | None = None,
        status: Literal["Ongoing", "Completed", "Terminated"] | None = None,
        max_items: int = 5,
    ) -> object:
        return self._typed_rapidapi(
            "openfda",
            _without_none(
                {
                    "dataset": dataset,
                    "searchQuery": search_query,
                    "classification": classification,
                    "status": status,
                    "limit": max_items,
                }
            ),
        )

    def sg_green_mark_buildings(
        self,
        *,
        rating: Literal["Platinum", "Goldplus", "Gold", "Certified"] | None = None,
        max_items: int = 5,
    ) -> object:
        return self._typed_rapidapi(
            "singapore_green_mark",
            _without_none({"rating": rating, "limit": max_items}),
        )

    def _fetch_json(self, request: Request) -> object:
        assert self._opener is not None
        try:
            with self._opener.open(request, timeout=self.timeout) as response:
                status = response.getcode()
                if status == 204:
                    return None
                payload = response.read(MAX_RESPONSE_BYTES + 1)
        except HTTPError as error:
            try:
                error.close()
            finally:
                status = int(error.code)
            raise OpenGovDataError(
                f"HTTP_{status}",
                f"Upstream request failed with HTTP {status}",
                status_code=status,
            ) from None
        except (TimeoutError, socket.timeout):
            raise OpenGovDataError("TIMEOUT", "Upstream request timed out") from None
        except URLError as error:
            if isinstance(error.reason, (TimeoutError, socket.timeout)):
                raise OpenGovDataError(
                    "TIMEOUT", "Upstream request timed out"
                ) from None
            raise OpenGovDataError(
                "NETWORK_ERROR", "Upstream network request failed"
            ) from None
        except (HTTPException, OSError, ValueError):
            raise OpenGovDataError(
                "NETWORK_ERROR", "Upstream network request failed"
            ) from None
        if len(payload) > MAX_RESPONSE_BYTES:
            raise OpenGovDataError(
                "RESPONSE_TOO_LARGE", "Upstream response exceeded the size limit"
            )
        if not payload:
            return None
        try:
            return json.loads(payload.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise OpenGovDataError(
                "RESPONSE_INVALID", "Upstream returned invalid JSON"
            ) from None


extract_records = _extract_records

__all__ = [
    "APIFY_BASE_URL",
    "OpenGovDataClient",
    "RapidSecMode",
    "SecIntelligenceMode",
    "TrialStatus",
    "extract_records",
]
