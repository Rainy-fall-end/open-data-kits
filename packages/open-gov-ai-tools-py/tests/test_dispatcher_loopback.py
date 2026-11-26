from __future__ import annotations

import json
import unittest
from urllib.parse import parse_qs

from helpers import loopback_server

from open_gov_ai_tools import OpenGovToolsError, ToolDispatcher


APIFY_TOKEN = "apify_api_" + "A" * 24
RAPIDAPI_KEY = "R" * 32


def dispatcher(base_url: str, **overrides: object) -> ToolDispatcher:
    options: dict[str, object] = {
        "apify_token": APIFY_TOKEN,
        "rapidapi_key": RAPIDAPI_KEY,
        "max_total_charge_usd": "0.25",
        "_apify_base_url": base_url,
        "_rapidapi_base_url": base_url,
    }
    options.update(overrides)
    return ToolDispatcher(**options)  # type: ignore[arg-type]


class DispatcherLoopbackTests(unittest.TestCase):
    def test_apify_request_uses_fixed_actor_budget_header_and_body(self) -> None:
        with loopback_server() as (base_url, state):
            state.payload = [{"accessionNumber": "0001"}]
            client = dispatcher(base_url)
            result = client.dispatch(
                "apify_sec_edgar_filings",
                {"query": "artificial intelligence", "maxItems": 3, "maxTotalChargeUsd": 0.1},
            )
        self.assertEqual(result["actor_id"], "8LFIbRbidiHPknMz5")
        self.assertEqual(result["max_total_charge_usd"], "0.1")
        self.assertEqual(result["data"], [{"accessionNumber": "0001"}])
        self.assertEqual(len(state.requests), 1)
        request = state.requests[0]
        self.assertEqual(request["method"], "POST")
        self.assertEqual(
            request["path"],
            "/v2/acts/8LFIbRbidiHPknMz5/run-sync-get-dataset-items",
        )
        self.assertEqual(
            parse_qs(request["query"]),
            {"maxTotalChargeUsd": ["0.1"], "clean": ["true"]},
        )
        self.assertEqual(request["headers"]["authorization"], f"Bearer {APIFY_TOKEN}")
        body = json.loads(request["body"].decode("utf-8"))
        self.assertEqual(body["maxItems"], 3)
        self.assertEqual(body["query"], "artificial intelligence")
        self.assertNotIn("maxTotalChargeUsd", body)
        self.assertNotIn(APIFY_TOKEN, json.dumps(result))
        self.assertNotIn(APIFY_TOKEN, request["query"])

    def test_rapidapi_request_uses_fixed_route_host_header_and_row_cap(self) -> None:
        with loopback_server() as (base_url, state):
            state.payload = {"records": [{"recallNumber": "R1"}]}
            result = dispatcher(base_url).dispatch(
                "rapidapi_openfda_records",
                {"dataset": "device_recall", "classification": "Class I", "limit": 2},
            )
        request = state.requests[0]
        self.assertEqual(request["method"], "GET")
        self.assertEqual(request["path"], "/v1/openfda/records")
        query = parse_qs(request["query"])
        self.assertEqual(query["limit"], ["2"])
        self.assertEqual(query["dataset"], ["device_recall"])
        self.assertEqual(query["classification"], ["Class I"])
        self.assertEqual(
            request["headers"]["x-rapidapi-host"],
            "openfda-recalls-enforcement-approvals.p.rapidapi.com",
        )
        self.assertEqual(request["headers"]["x-rapidapi-key"], RAPIDAPI_KEY)
        self.assertEqual(result["api_slug"], "openfda-recalls-enforcement-approvals")
        self.assertNotIn(RAPIDAPI_KEY, json.dumps(result))
        self.assertNotIn(RAPIDAPI_KEY, request["query"])

    def test_budget_raise_is_rejected_before_network(self) -> None:
        with loopback_server() as (base_url, state):
            client = dispatcher(base_url)
            with self.assertRaises(OpenGovToolsError) as raised:
                client.dispatch(
                    "apify_clinical_trials",
                    {"maxTotalChargeUsd": "0.250001"},
                )
        self.assertEqual(raised.exception.code, "COST_LIMIT_EXCEEDED")
        self.assertEqual(state.requests, [])

    def test_redirect_is_blocked_without_second_request(self) -> None:
        with loopback_server() as (base_url, state):
            state.mode = "redirect"
            with self.assertRaises(OpenGovToolsError) as raised:
                dispatcher(base_url).dispatch("rapidapi_openfda_records", {})
        self.assertEqual(raised.exception.code, "REDIRECT_BLOCKED")
        self.assertEqual(raised.exception.status_code, 302)
        self.assertEqual(len(state.requests), 1)

    def test_response_content_length_and_streaming_limits(self) -> None:
        for mode in ("oversized_header", "oversized_body"):
            with self.subTest(mode=mode):
                with loopback_server() as (base_url, state):
                    state.mode = mode
                    with self.assertRaises(OpenGovToolsError) as raised:
                        dispatcher(base_url, max_response_bytes=128).dispatch(
                            "rapidapi_openfda_records",
                            {},
                        )
                self.assertEqual(raised.exception.code, "RESPONSE_TOO_LARGE")

    def test_invalid_json_and_http_error_are_sanitized(self) -> None:
        with loopback_server() as (base_url, state):
            state.mode = "invalid_json"
            with self.assertRaises(OpenGovToolsError) as invalid:
                dispatcher(base_url).dispatch("rapidapi_openfda_records", {})
        self.assertEqual(invalid.exception.code, "RESPONSE_INVALID")

        with loopback_server() as (base_url, state):
            state.mode = "http_error"
            with self.assertRaises(OpenGovToolsError) as failed:
                dispatcher(base_url).dispatch("rapidapi_openfda_records", {})
        self.assertEqual(failed.exception.code, "HTTP_503")
        self.assertNotIn("SECRET_VALUE", str(failed.exception))
        self.assertNotIn(RAPIDAPI_KEY, str(failed.exception))

    def test_empty_response_is_supported(self) -> None:
        with loopback_server() as (base_url, state):
            state.mode = "empty"
            result = dispatcher(base_url).dispatch("rapidapi_openfda_records", {})
        self.assertIsNone(result["data"])

    def test_credentials_never_appear_in_repr(self) -> None:
        client = ToolDispatcher(apify_token=APIFY_TOKEN, rapidapi_key=RAPIDAPI_KEY)
        rendered = repr(client)
        self.assertNotIn(APIFY_TOKEN, rendered)
        self.assertNotIn(RAPIDAPI_KEY, rendered)
        self.assertIn("apify_configured=True", rendered)
        self.assertIn("rapidapi_configured=True", rendered)

    def test_missing_credentials_fail_before_network(self) -> None:
        with loopback_server() as (base_url, state):
            client = ToolDispatcher(
                _apify_base_url=base_url,
                _rapidapi_base_url=base_url,
            )
            with self.assertRaises(OpenGovToolsError) as rapid:
                client.dispatch("rapidapi_openfda_records", {})
            with self.assertRaises(OpenGovToolsError) as apify:
                client.dispatch("apify_sec_edgar_filings", {})
        self.assertEqual(rapid.exception.code, "AUTH_MISSING")
        self.assertEqual(apify.exception.code, "AUTH_MISSING")
        self.assertEqual(state.requests, [])

    def test_endpoint_overrides_accept_only_ported_loopback(self) -> None:
        invalid = (
            "https://example.com",
            "http://127.0.0.1",
            "http://user:pass@127.0.0.1:1234",
            "http://127.0.0.1:1234/path",
            "http://127.0.0.1:1234?query=1",
        )
        for value in invalid:
            with self.subTest(value=value):
                with self.assertRaises(OpenGovToolsError) as raised:
                    ToolDispatcher(_rapidapi_base_url=value)
                self.assertEqual(raised.exception.code, "ENDPOINT_INVALID")

    def test_from_env_does_not_expose_values(self) -> None:
        client = ToolDispatcher.from_env(
            environ={"APIFY_TOKEN": APIFY_TOKEN, "RAPIDAPI_KEY": RAPIDAPI_KEY}
        )
        self.assertNotIn(APIFY_TOKEN, repr(client))
        self.assertNotIn(RAPIDAPI_KEY, repr(client))


if __name__ == "__main__":
    unittest.main()
