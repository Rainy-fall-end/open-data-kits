from __future__ import annotations

import json
import math
import unittest
from decimal import Decimal
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlsplit

from open_gov_data import (
    APIFY_SOURCE_ALIASES,
    RAPIDAPI_SOURCE_ALIASES,
    OpenGovDataClient,
    OpenGovDataError,
    extract_records,
    safe_error,
)
from open_gov_data.validation import (
    format_charge,
    parse_input,
    rapidapi_query_value,
    validate_charge,
    validate_credential,
    validate_max_items,
    validate_timeout,
)

from tests.helpers import loopback_server, read_body, send_json


APIFY_TOKEN = f"apify_api_{'C' * 32}"
RAPIDAPI_KEY = f"rapid_{'D' * 32}"


class BackwardsCompatibilityTests(unittest.TestCase):
    def test_v010_public_class_and_generic_methods_remain_usable(self) -> None:
        calls: list[str] = []

        def handler(request: BaseHTTPRequestHandler) -> None:
            calls.append(urlsplit(request.path).path)
            if request.command == "POST":
                read_body(request)
            send_json(request, 200, {"items": [{"ok": True}]})

        with loopback_server(handler) as base_url:
            client = OpenGovDataClient(
                apify_token=APIFY_TOKEN,
                rapidapi_key=RAPIDAPI_KEY,
                timeout=2,
                _apify_base_url=base_url,
                _rapidapi_base_url=base_url,
            )
            self.assertEqual(client.run_actor("sec_edgar"), {"items": [{"ok": True}]})
            self.assertEqual(
                client.query_rapidapi("openfda"), {"items": [{"ok": True}]}
            )
            self.assertEqual(
                client.request("apify", "clinical_trials"),
                {"items": [{"ok": True}]},
            )
            self.assertEqual(
                client.records("rapidapi", "singapore_green_mark"), [{"ok": True}]
            )
        self.assertEqual(len(calls), 4)
        env_client = OpenGovDataClient.from_env(
            environ={"APIFY_TOKEN": APIFY_TOKEN, "X_RAPIDAPI_KEY": RAPIDAPI_KEY}
        )
        self.assertEqual(env_client.apify_token, APIFY_TOKEN)
        self.assertEqual(env_client.rapidapi_key, RAPIDAPI_KEY)
        self.assertEqual(extract_records({"results": [1, 2]}), [1, 2])
        self.assertEqual(extract_records(None), [])

    def test_all_additive_source_aliases_route_to_the_canonical_products(self) -> None:
        paths: list[str] = []

        def handler(request: BaseHTTPRequestHandler) -> None:
            paths.append(urlsplit(request.path).path)
            if request.command == "POST":
                read_body(request)
            send_json(request, 200, [])

        with loopback_server(handler) as base_url:
            client = OpenGovDataClient(
                apify_token=APIFY_TOKEN,
                rapidapi_key=RAPIDAPI_KEY,
                timeout=2,
                _apify_base_url=base_url,
                _rapidapi_base_url=base_url,
            )
            for alias in APIFY_SOURCE_ALIASES:
                client.run_actor(alias)
            for alias in RAPIDAPI_SOURCE_ALIASES:
                client.query_rapidapi(alias)
        self.assertEqual(len(paths), 8)

    def test_v010_validation_functions_keep_their_one_argument_contract(self) -> None:
        self.assertEqual(validate_max_items(1), 1)
        self.assertEqual(validate_max_items(1_000), 1_000)
        with self.assertRaises(OpenGovDataError):
            validate_max_items(1_001)
        self.assertEqual(validate_charge("0.1250"), Decimal("0.1250"))
        self.assertEqual(format_charge(Decimal("0.1250")), "0.125")
        self.assertEqual(validate_timeout(30), 30.0)
        self.assertEqual(rapidapi_query_value(["a", "b"]), "a,b")
        original = {"query": "climate", "nested": {"values": [1, 2]}}
        clone = parse_input(original)
        original["nested"]["values"].append(3)  # type: ignore[index,union-attr]
        self.assertEqual(clone["nested"], {"values": [1, 2]})


class SecurityAndFailureTests(unittest.TestCase):
    def test_credentials_are_strict_and_excluded_from_repr_and_errors(self) -> None:
        client = OpenGovDataClient(
            apify_token=APIFY_TOKEN, rapidapi_key=RAPIDAPI_KEY
        )
        rendered = repr(client)
        self.assertNotIn(APIFY_TOKEN, rendered)
        self.assertNotIn(RAPIDAPI_KEY, rendered)
        self.assertEqual(validate_credential("apify", APIFY_TOKEN), APIFY_TOKEN)
        self.assertEqual(validate_credential("rapidapi", RAPIDAPI_KEY), RAPIDAPI_KEY)
        for provider, value in (
            ("apify", "apify_api_short"),
            ("apify", f"{APIFY_TOKEN} "),
            ("rapidapi", "too-short"),
            ("rapidapi", f"{RAPIDAPI_KEY}\n"),
        ):
            with self.subTest(provider=provider):
                with self.assertRaises(OpenGovDataError) as caught:
                    validate_credential(provider, value)
                self.assertNotIn(value, f"{caught.exception!s} {caught.exception!r}")

    def test_secret_fields_cycles_and_nonfinite_numbers_are_rejected(self) -> None:
        cyclic: dict[str, object] = {}
        cyclic["self"] = cyclic
        for invalid in (
            {"authorization": APIFY_TOKEN},
            {"nested": {"x-rapidapi-key": RAPIDAPI_KEY}},
            cyclic,
            {"number": math.nan},
        ):
            with self.subTest(kind=type(invalid).__name__):
                with self.assertRaises(OpenGovDataError):
                    parse_input(invalid)

    def test_http_errors_discard_reflected_bodies(self) -> None:
        def handler(request: BaseHTTPRequestHandler) -> None:
            send_json(request, 429, {"secret": RAPIDAPI_KEY, "details": "private"})

        with loopback_server(handler) as base_url:
            client = OpenGovDataClient(
                rapidapi_key=RAPIDAPI_KEY,
                timeout=2,
                _rapidapi_base_url=base_url,
            )
            with self.assertRaises(OpenGovDataError) as caught:
                client.query_rapidapi("clinical_trials")
        self.assertEqual(caught.exception.code, "HTTP_429")
        rendered = json.dumps(safe_error(caught.exception))
        self.assertNotIn(RAPIDAPI_KEY, rendered)
        self.assertNotIn("private", rendered)

    def test_loopback_override_restriction_and_closed_sources(self) -> None:
        with self.assertRaises(OpenGovDataError) as caught:
            OpenGovDataClient(_rapidapi_base_url="https://example.invalid")
        self.assertEqual(caught.exception.code, "ENDPOINT_INVALID")
        client = OpenGovDataClient()
        for action in (
            lambda: client.request("custom", "anything"),
            lambda: client.run_actor("unknown"),
            lambda: client.query_rapidapi("unknown"),
        ):
            with self.assertRaises(OpenGovDataError):
                action()


if __name__ == "__main__":
    unittest.main()
