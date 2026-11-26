from __future__ import annotations

import json
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlsplit
from unittest.mock import patch

from open_gov_data import OpenGovDataClient, OpenGovDataError, safe_error

from tests.helpers import loopback_server, read_body, send_json


APIFY_TOKEN = f"apify_api_{'A' * 32}"
RAPIDAPI_KEY = f"rapid_{'B' * 32}"


class ClientIntegrationTests(unittest.TestCase):
    def test_client_repr_never_contains_credentials(self) -> None:
        client = OpenGovDataClient(
            apify_token=APIFY_TOKEN, rapidapi_key=RAPIDAPI_KEY
        )
        rendered = repr(client)
        self.assertNotIn(APIFY_TOKEN, rendered)
        self.assertNotIn(RAPIDAPI_KEY, rendered)

    def test_missing_authentication_fails_before_transport(self) -> None:
        class FailOpener:
            calls = 0

            def open(self, *args: object, **kwargs: object) -> object:
                self.calls += 1
                raise AssertionError("transport must not run")

        opener = FailOpener()
        client = OpenGovDataClient(_opener=opener)  # type: ignore[arg-type]
        with self.assertRaises(OpenGovDataError) as caught:
            client.run_actor("sec_edgar")
        self.assertEqual(caught.exception.code, "AUTH_MISSING")
        self.assertEqual(opener.calls, 0)

    def test_apify_loopback_sends_auth_input_row_cap_and_cost_cap(self) -> None:
        captured: dict[str, object] = {}

        def handler(request: BaseHTTPRequestHandler) -> None:
            url = urlsplit(request.path)
            captured.update(
                method=request.command,
                path=url.path,
                query=parse_qs(url.query),
                authorization=request.headers.get("authorization"),
                content_type=request.headers.get("content-type"),
                body=json.loads(read_body(request)),
            )
            send_json(request, 200, [{"accessionNumber": "0001"}])

        with loopback_server(handler) as base_url:
            client = OpenGovDataClient(
                apify_token=APIFY_TOKEN,
                max_total_charge_usd="0.25",
                timeout=2,
                _apify_base_url=base_url,
            )
            payload = client.run_actor(
                "sec_edgar",
                {"query": "climate", "maxItems": 999},
                max_items=7,
                max_total_charge_usd="0.1250",
            )

        self.assertEqual(payload, [{"accessionNumber": "0001"}])
        self.assertEqual(captured["method"], "POST")
        self.assertEqual(
            captured["path"],
            "/v2/acts/8LFIbRbidiHPknMz5/run-sync-get-dataset-items",
        )
        self.assertEqual(
            captured["query"], {"maxTotalChargeUsd": ["0.125"], "clean": ["true"]}
        )
        self.assertEqual(captured["authorization"], f"Bearer {APIFY_TOKEN}")
        self.assertEqual(captured["body"], {"query": "climate", "maxItems": 7})

    def test_rapidapi_loopback_sends_fixed_host_key_and_limit(self) -> None:
        captured: dict[str, object] = {}

        def handler(request: BaseHTTPRequestHandler) -> None:
            url = urlsplit(request.path)
            captured.update(
                method=request.command,
                path=url.path,
                query=parse_qs(url.query),
                api_key=request.headers.get("x-rapidapi-key"),
                api_host=request.headers.get("x-rapidapi-host"),
            )
            send_json(request, 200, {"items": [{"recallNumber": "R-1"}]})

        with loopback_server(handler) as base_url:
            client = OpenGovDataClient(
                rapidapi_key=RAPIDAPI_KEY,
                timeout=2,
                _rapidapi_base_url=base_url,
            )
            records = client.records(
                "rapidapi",
                "openfda",
                {
                    "dataset": "drug_enforcement",
                    "status": ["ongoing", "completed"],
                    "limit": 999,
                    "maxItems": 888,
                },
                max_items=5,
            )

        self.assertEqual(records, [{"recallNumber": "R-1"}])
        self.assertEqual(captured["method"], "GET")
        self.assertEqual(captured["path"], "/v1/openfda/records")
        self.assertEqual(
            captured["query"],
            {
                "dataset": ["drug_enforcement"],
                "status": ["ongoing,completed"],
                "limit": ["5"],
            },
        )
        self.assertEqual(captured["api_key"], RAPIDAPI_KEY)
        self.assertEqual(
            captured["api_host"],
            "openfda-recalls-enforcement-approvals.p.rapidapi.com",
        )

    def test_client_hard_cap_cannot_be_raised_per_request(self) -> None:
        client = OpenGovDataClient(
            apify_token=APIFY_TOKEN, max_total_charge_usd="0.10"
        )
        with self.assertRaises(OpenGovDataError) as caught:
            client.run_actor(
                "clinical_trials", max_total_charge_usd="0.10001"
            )
        self.assertEqual(caught.exception.code, "COST_LIMIT_EXCEEDED")

    def test_rapidapi_rejects_a_false_dollar_cap_promise(self) -> None:
        client = OpenGovDataClient(rapidapi_key=RAPIDAPI_KEY)
        with self.assertRaises(OpenGovDataError) as caught:
            client.request(
                "rapidapi", "clinical_trials", max_total_charge_usd="0.25"
            )
        self.assertEqual(caught.exception.code, "COST_LIMIT_UNSUPPORTED")

    def test_http_errors_discard_reflected_bodies_and_preserve_status(self) -> None:
        statuses = iter((401, 429, 500))

        def handler(request: BaseHTTPRequestHandler) -> None:
            send_json(
                request,
                next(statuses),
                {"reflectedSecret": RAPIDAPI_KEY, "private": "upstream details"},
            )

        with loopback_server(handler) as base_url:
            client = OpenGovDataClient(
                rapidapi_key=RAPIDAPI_KEY,
                timeout=2,
                _rapidapi_base_url=base_url,
            )
            for status in (401, 429, 500):
                with self.subTest(status=status):
                    with self.assertRaises(OpenGovDataError) as caught:
                        client.query_rapidapi("clinical_trials")
                    error = caught.exception
                    self.assertEqual(error.code, f"HTTP_{status}")
                    self.assertEqual(error.status_code, status)
                    rendered = f"{error!s} {error!r} {safe_error(error)}"
                    self.assertNotIn(RAPIDAPI_KEY, rendered)
                    self.assertNotIn("upstream details", rendered)

    def test_timeout_is_stable_and_safe(self) -> None:
        def handler(request: BaseHTTPRequestHandler) -> None:
            time.sleep(0.3)
            try:
                send_json(request, 200, {"items": []})
            except OSError:
                pass

        with loopback_server(handler) as base_url:
            client = OpenGovDataClient(
                rapidapi_key=RAPIDAPI_KEY,
                timeout=0.1,
                _rapidapi_base_url=base_url,
            )
            with self.assertRaises(OpenGovDataError) as caught:
                client.query_rapidapi("singapore_green_mark")
            self.assertEqual(
                safe_error(caught.exception),
                {"code": "TIMEOUT", "message": "Upstream request timed out"},
            )

    def test_invalid_json_response_does_not_escape_its_body(self) -> None:
        def handler(request: BaseHTTPRequestHandler) -> None:
            body = f"not-json-{APIFY_TOKEN}".encode()
            request.send_response(200)
            request.send_header("content-length", str(len(body)))
            request.end_headers()
            request.wfile.write(body)

        with loopback_server(handler) as base_url:
            client = OpenGovDataClient(
                apify_token=APIFY_TOKEN, timeout=2, _apify_base_url=base_url
            )
            with self.assertRaises(OpenGovDataError) as caught:
                client.run_actor("uk_gov_tenders")
            self.assertEqual(caught.exception.code, "RESPONSE_INVALID")
            self.assertNotIn(APIFY_TOKEN, str(caught.exception))

    def test_oversized_response_is_stopped_at_the_hard_read_limit(self) -> None:
        def handler(request: BaseHTTPRequestHandler) -> None:
            body = b"x" * 17
            request.send_response(200)
            request.send_header("content-length", str(len(body)))
            request.end_headers()
            request.wfile.write(body)

        with loopback_server(handler) as base_url, patch(
            "open_gov_data.client.MAX_RESPONSE_BYTES", 16
        ):
            client = OpenGovDataClient(
                rapidapi_key=RAPIDAPI_KEY,
                timeout=2,
                _rapidapi_base_url=base_url,
            )
            with self.assertRaises(OpenGovDataError) as caught:
                client.query_rapidapi("openfda")
            self.assertEqual(caught.exception.code, "RESPONSE_TOO_LARGE")

    def test_redirect_is_blocked_and_never_reaches_target(self) -> None:
        target_calls = 0
        target_lock = threading.Lock()

        def target(request: BaseHTTPRequestHandler) -> None:
            nonlocal target_calls
            with target_lock:
                target_calls += 1
            send_json(request, 200, {"unexpected": True})

        with loopback_server(target) as target_url:
            def redirect(request: BaseHTTPRequestHandler) -> None:
                request.send_response(302)
                request.send_header("location", f"{target_url}/capture")
                request.end_headers()

            with loopback_server(redirect) as base_url:
                client = OpenGovDataClient(
                    rapidapi_key=RAPIDAPI_KEY,
                    timeout=2,
                    _rapidapi_base_url=base_url,
                )
                with self.assertRaises(OpenGovDataError) as caught:
                    client.query_rapidapi("sec_edgar")
                self.assertEqual(caught.exception.code, "HTTP_302")
        self.assertEqual(target_calls, 0)

    def test_unknown_provider_source_and_endpoint_are_closed(self) -> None:
        client = OpenGovDataClient()
        with self.assertRaises(OpenGovDataError) as caught:
            client.request("custom", "anything")
        self.assertEqual(caught.exception.code, "PROVIDER_NOT_ALLOWED")
        with self.assertRaises(OpenGovDataError) as caught:
            client.request([], "anything")  # type: ignore[arg-type]
        self.assertEqual(caught.exception.code, "PROVIDER_NOT_ALLOWED")
        for action in (
            lambda: client.run_actor([]),  # type: ignore[arg-type]
            lambda: client.query_rapidapi([]),  # type: ignore[arg-type]
            lambda: client.run_actor("private_hong_kong"),
            lambda: client.query_rapidapi("arbitrary_url"),
        ):
            with self.assertRaises(OpenGovDataError) as caught:
                action()
            self.assertEqual(caught.exception.code, "SOURCE_NOT_ALLOWED")
        with self.assertRaises(OpenGovDataError) as caught:
            OpenGovDataClient(_rapidapi_base_url="https://example.invalid")
        self.assertEqual(caught.exception.code, "ENDPOINT_INVALID")
        with self.assertRaises(OpenGovDataError) as caught:
            OpenGovDataClient(_rapidapi_base_url="http://localhost:not-a-port")
        self.assertEqual(caught.exception.code, "ENDPOINT_INVALID")

    def test_from_env_and_response_envelope_normalization(self) -> None:
        client = OpenGovDataClient.from_env(
            environ={"APIFY_TOKEN": APIFY_TOKEN, "X_RAPIDAPI_KEY": RAPIDAPI_KEY}
        )
        self.assertEqual(client.apify_token, APIFY_TOKEN)
        self.assertEqual(client.rapidapi_key, RAPIDAPI_KEY)
        from open_gov_data import extract_records

        self.assertEqual(extract_records({"results": [1, 2]}), [1, 2])
        self.assertEqual(extract_records(None), [])
        self.assertEqual(extract_records("value"), [{"value": "value"}])


if __name__ == "__main__":
    unittest.main()
