from __future__ import annotations

import json
import os
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs

from helpers import APIFY_TOKEN, RAPIDAPI_KEY, loopback_server

from open_gov_ai_tools import APIFY_ACTOR_IDS, OpenGovToolsError, ToolDispatcher, catalog_snapshot


def dispatcher(base_url: str, **kwargs: object) -> ToolDispatcher:
    return ToolDispatcher(
        apify_token=APIFY_TOKEN,
        rapidapi_key=RAPIDAPI_KEY,
        _apify_base_url=base_url,
        _rapidapi_base_url=base_url,
        timeout=3,
        **kwargs,
    )


class DispatcherLoopbackTests(unittest.TestCase):
    def test_all_twelve_tools_execute_only_against_loopback(self) -> None:
        catalog = catalog_snapshot()
        with loopback_server() as (base_url, state):
            client = dispatcher(base_url)
            results = [client.dispatch(item["name"], {}) for item in catalog]
        self.assertEqual(len(state.requests), 12)
        self.assertEqual(len(results), 12)
        for index, (definition, request, result) in enumerate(zip(catalog, state.requests, results)):
            with self.subTest(tool=definition["name"]):
                self.assertEqual(result["tool_name"], definition["name"])
                self.assertEqual(result["provider"], definition["provider"])
                self.assertNotIn(APIFY_TOKEN, json.dumps(result))
                self.assertNotIn(RAPIDAPI_KEY, json.dumps(result))
                self.assertTrue(request["path"].startswith("/"))
                if index < 8:
                    self.assertEqual(request["method"], "POST")
                    self.assertEqual(
                        request["path"],
                        f"/v2/acts/{APIFY_ACTOR_IDS[index]}/run-sync-get-dataset-items",
                    )
                    query = parse_qs(request["query"])
                    self.assertEqual(query["maxTotalChargeUsd"], ["0.25"])
                    self.assertEqual(query["clean"], ["true"])
                    self.assertEqual(request["headers"]["authorization"], f"Bearer {APIFY_TOKEN}")
                    body = json.loads(request["body"].decode("utf-8"))
                    self.assertNotIn("maxTotalChargeUsd", body)
                    self.assertEqual(body["maxItems"], 10)
                else:
                    self.assertEqual(request["method"], "GET")
                    self.assertEqual(request["path"], definition["path"])
                    self.assertEqual(
                        request["headers"]["x-rapidapi-host"],
                        definition["host"],
                    )
                    self.assertEqual(request["headers"]["x-rapidapi-key"], RAPIDAPI_KEY)
                    self.assertEqual(parse_qs(request["query"], keep_blank_values=True)["limit"], ["5"])

    def test_apify_cap_can_be_lowered_but_never_raised(self) -> None:
        with loopback_server() as (base_url, state):
            client = dispatcher(base_url)
            result = client.dispatch(
                "apify_global_public_tenders",
                {"keyword": "clean energy", "maxItems": 3, "maxTotalChargeUsd": 0.1},
            )
            with self.assertRaises(OpenGovToolsError) as raised:
                client.dispatch(
                    "apify_clinical_trials",
                    {"maxTotalChargeUsd": "0.250001"},
                )
        self.assertEqual(result["max_total_charge_usd"], "0.1")
        self.assertEqual(raised.exception.code, "COST_LIMIT_EXCEEDED")
        self.assertEqual(len(state.requests), 1)
        self.assertEqual(parse_qs(state.requests[0]["query"])["maxTotalChargeUsd"], ["0.1"])

    def test_rapidapi_route_and_host_are_not_argument_controlled(self) -> None:
        with loopback_server() as (base_url, state):
            result = dispatcher(base_url).dispatch(
                "rapidapi_openfda",
                {"dataset": "device_recall", "classification": "Class I", "limit": 2},
            )
        request = state.requests[0]
        self.assertEqual(request["path"], "/v1/openfda/records")
        query = parse_qs(request["query"])
        self.assertEqual(query["dataset"], ["device_recall"])
        self.assertEqual(query["classification"], ["Class I"])
        self.assertEqual(query["limit"], ["2"])
        self.assertEqual(result["api_slug"], "openfda-recalls-enforcement-approvals")

    def test_redirect_is_blocked_without_followup_request(self) -> None:
        with loopback_server() as (base_url, state):
            state.mode = "redirect"
            with self.assertRaises(OpenGovToolsError) as raised:
                dispatcher(base_url).dispatch("rapidapi_openfda", {})
        self.assertEqual(raised.exception.code, "REDIRECT_BLOCKED")
        self.assertEqual(raised.exception.status_code, 302)
        self.assertEqual(len(state.requests), 1)

    def test_response_size_limits_cover_header_and_stream(self) -> None:
        for mode in ("oversized_header", "oversized_body"):
            with self.subTest(mode=mode):
                with loopback_server() as (base_url, state):
                    state.mode = mode
                    with self.assertRaises(OpenGovToolsError) as raised:
                        dispatcher(base_url, max_response_bytes=128).dispatch(
                            "rapidapi_openfda", {}
                        )
                self.assertEqual(raised.exception.code, "RESPONSE_TOO_LARGE")

    def test_invalid_json_and_http_errors_are_sanitized(self) -> None:
        with loopback_server() as (base_url, state):
            state.mode = "invalid_json"
            with self.assertRaises(OpenGovToolsError) as invalid:
                dispatcher(base_url).dispatch("rapidapi_openfda", {})
        self.assertEqual(invalid.exception.code, "RESPONSE_INVALID")

        with loopback_server() as (base_url, state):
            state.mode = "http_error"
            with self.assertRaises(OpenGovToolsError) as failed:
                dispatcher(base_url).dispatch("rapidapi_openfda", {})
        self.assertEqual(failed.exception.code, "HTTP_503")
        self.assertNotIn("sensitive upstream body", str(failed.exception))
        self.assertNotIn(RAPIDAPI_KEY, str(failed.exception))

    def test_empty_response_is_supported(self) -> None:
        with loopback_server() as (base_url, state):
            state.mode = "empty"
            result = dispatcher(base_url).dispatch("rapidapi_sg_green_mark", {})
        self.assertIsNone(result["data"])

    def test_missing_credentials_and_unknown_tools_fail_before_network(self) -> None:
        with loopback_server() as (base_url, state):
            client = ToolDispatcher(_apify_base_url=base_url, _rapidapi_base_url=base_url)
            with self.assertRaises(OpenGovToolsError) as rapid:
                client.dispatch("rapidapi_openfda", {})
            with self.assertRaises(OpenGovToolsError) as apify:
                client.dispatch("apify_sec_edgar_intelligence", {})
            with self.assertRaises(OpenGovToolsError) as unknown:
                client.dispatch("unlisted_tool", {})
        self.assertEqual(rapid.exception.code, "AUTH_MISSING")
        self.assertEqual(apify.exception.code, "AUTH_MISSING")
        self.assertEqual(unknown.exception.code, "TOOL_NOT_ALLOWED")
        self.assertEqual(state.requests, [])

    def test_endpoint_overrides_are_explicit_loopback_only(self) -> None:
        invalid = (
            "https://example.com",
            "http://127.0.0.1",
            "http://user:pass@127.0.0.1:1234",
            "http://127.0.0.1:1234/path",
            "http://127.0.0.1:1234?next=http://example.com",
        )
        for value in invalid:
            with self.subTest(value=value):
                with self.assertRaises(OpenGovToolsError) as raised:
                    ToolDispatcher(_rapidapi_base_url=value)
                self.assertEqual(raised.exception.code, "ENDPOINT_INVALID")

    def test_offline_verification_guard_blocks_production_before_network(self) -> None:
        client = ToolDispatcher(rapidapi_key=RAPIDAPI_KEY)
        with patch.dict(os.environ, {"OPEN_GOV_AI_TOOLS_OFFLINE_TEST": "1"}):
            with self.assertRaises(OpenGovToolsError) as raised:
                client.dispatch("rapidapi_openfda", {})
        self.assertEqual(raised.exception.code, "OFFLINE_BLOCKED")

    def test_credentials_are_absent_from_repr_and_environment_result(self) -> None:
        client = ToolDispatcher.from_env(
            environ={"APIFY_TOKEN": APIFY_TOKEN, "RAPIDAPI_KEY": RAPIDAPI_KEY}
        )
        rendered = repr(client)
        self.assertNotIn(APIFY_TOKEN, rendered)
        self.assertNotIn(RAPIDAPI_KEY, rendered)
        self.assertIn("apify_configured=True", rendered)
        self.assertIn("rapidapi_configured=True", rendered)


if __name__ == "__main__":
    unittest.main()
