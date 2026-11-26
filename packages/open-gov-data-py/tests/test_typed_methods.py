from __future__ import annotations

import json
import unittest
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlsplit

from open_gov_data import OpenGovDataClient, OpenGovDataError

from tests.helpers import loopback_server, read_body, send_json


APIFY_TOKEN = f"apify_api_{'A' * 32}"
RAPIDAPI_KEY = f"rapid_{'B' * 32}"


class TypedMethodLoopbackTests(unittest.TestCase):
    def test_all_twelve_typed_methods_use_loopback_and_closed_routes(self) -> None:
        calls: list[dict[str, object]] = []

        def handler(request: BaseHTTPRequestHandler) -> None:
            url = urlsplit(request.path)
            call: dict[str, object] = {
                "method": request.command,
                "path": url.path,
                "query": parse_qs(url.query),
                "host": request.headers.get("x-rapidapi-host"),
                "authorization": request.headers.get("authorization"),
            }
            if request.command == "POST":
                call["body"] = json.loads(read_body(request))
            calls.append(call)
            send_json(request, 200, {"items": [{"call": len(calls)}]})

        with loopback_server(handler) as base_url:
            client = OpenGovDataClient(
                apify_token=APIFY_TOKEN,
                rapidapi_key=RAPIDAPI_KEY,
                max_total_charge_usd="1.00",
                timeout=2,
                _apify_base_url=base_url,
                _rapidapi_base_url=base_url,
            )
            results = [
                client.ats_jobs_hiring_signals(
                    preset="custom_only", company_boards=["greenhouse:example"], max_items=11
                ),
                client.sec_edgar_intelligence(
                    mode="xbrl_financials", ticker="AAPL", max_items=12
                ),
                client.global_public_tenders(
                    sources=["eu_ted"], opportunity_types=["tender"], max_items=13
                ),
                client.pharma_pipeline_intelligence(
                    mode="pipeline_feed", query="oncology", max_items=14
                ),
                client.usaspending_contracts(
                    award_category="contracts", min_award_amount=1000, max_items=15
                ),
                client.clinical_trials(condition="diabetes", max_items=16),
                client.uk_gov_tenders(stages="award", min_value=100, max_items=17),
                client.sg_green_mark(rating="Platinum", max_items=18),
                client.sec_edgar_corporate_filings(
                    mode="company", ticker="AAPL", max_items=6
                ),
                client.clinicaltrials_studies(
                    condition="diabetes", status="RECRUITING", max_items=7
                ),
                client.openfda_recalls(
                    dataset="device_recall", classification="Class I", max_items=8
                ),
                client.sg_green_mark_buildings(rating="Gold", max_items=9),
            ]

        self.assertEqual(len(results), 12)
        self.assertTrue(all(result == {"items": [{"call": index}]} for index, result in enumerate(results, 1)))
        self.assertEqual(len(calls), 12)
        self.assertEqual(
            [call["path"].split("/")[3] for call in calls[:8]],
            [
                "CRulq5dak4mqAUmMn",
                "8LFIbRbidiHPknMz5",
                "ZlabhlvEIyRVdtKiQ",
                "re8aRvtqBonP5HMuY",
                "eQQ2beomyLlW4DTGM",
                "KchE3qKKrwU0rCe9f",
                "txnvyTckeQx4hVBc6",
                "Z3ioK0wOAeczj6nCx",
            ],
        )
        self.assertTrue(all(call["method"] == "POST" for call in calls[:8]))
        self.assertTrue(
            all(call["query"]["maxTotalChargeUsd"] == ["0.25"] for call in calls[:8])
        )
        self.assertEqual(
            [call["body"]["maxItems"] for call in calls[:8]],
            list(range(11, 19)),
        )
        self.assertEqual(
            [call["path"] for call in calls[8:]],
            [
                "/v1/sec-edgar/filings",
                "/v1/clinical-trials/studies",
                "/v1/openfda/records",
                "/v1/sg-green-mark/certificates",
            ],
        )
        self.assertEqual(
            [call["query"]["limit"] for call in calls[8:]],
            [["6"], ["7"], ["8"], ["9"]],
        )
        self.assertTrue(all(call["method"] == "GET" for call in calls[8:]))

    def test_all_three_sec_intelligence_modes_validate(self) -> None:
        modes: list[str] = []

        def handler(request: BaseHTTPRequestHandler) -> None:
            modes.append(json.loads(read_body(request))["mode"])
            send_json(request, 200, [])

        with loopback_server(handler) as base_url:
            client = OpenGovDataClient(
                apify_token=APIFY_TOKEN, timeout=2, _apify_base_url=base_url
            )
            for mode in ("form_d_funding", "xbrl_financials", "filings"):
                client.sec_edgar_intelligence(mode=mode)  # type: ignore[arg-type]
        self.assertEqual(modes, ["form_d_funding", "xbrl_financials", "filings"])

    def test_typed_helpers_reject_schema_violations_before_transport(self) -> None:
        class FailOpener:
            calls = 0

            def open(self, *args: object, **kwargs: object) -> object:
                self.calls += 1
                raise AssertionError("transport must not run")

        opener = FailOpener()
        client = OpenGovDataClient(
            apify_token=APIFY_TOKEN,
            rapidapi_key=RAPIDAPI_KEY,
            max_total_charge_usd="1",
            _opener=opener,  # type: ignore[arg-type]
        )
        invalid_calls = [
            lambda: client.ats_jobs_hiring_signals(max_items=10_001),
            lambda: client.sec_edgar_intelligence(mode="bad"),  # type: ignore[arg-type]
            lambda: client.global_public_tenders(source_timeout_secs=31),
            lambda: client.pharma_pipeline_intelligence(query=""),
            lambda: client.usaspending_contracts(min_award_amount=-1),
            lambda: client.clinical_trials(status="INVALID"),
            lambda: client.uk_gov_tenders(keyword="x" * 121),
            lambda: client.sg_green_mark(expires_within_days=3651),
            lambda: client.sec_edgar_corporate_filings(max_items=21),
            lambda: client.clinicaltrials_studies(status="INVALID"),  # type: ignore[arg-type]
            lambda: client.openfda_recalls(dataset="invalid"),  # type: ignore[arg-type]
            lambda: client.sg_green_mark_buildings(rating="Silver"),  # type: ignore[arg-type]
        ]
        for action in invalid_calls:
            with self.subTest(action=action):
                with self.assertRaises(OpenGovDataError) as caught:
                    action()
                self.assertEqual(caught.exception.code, "SCHEMA_VALIDATION")
        self.assertEqual(opener.calls, 0)

    def test_typed_actor_cap_cannot_exceed_quarter_dollar(self) -> None:
        client = OpenGovDataClient(
            apify_token=APIFY_TOKEN, max_total_charge_usd="1.00"
        )
        with self.assertRaises(OpenGovDataError) as caught:
            client.clinical_trials(max_total_charge_usd="0.250001")
        self.assertEqual(caught.exception.code, "COST_LIMIT_EXCEEDED")


if __name__ == "__main__":
    unittest.main()
