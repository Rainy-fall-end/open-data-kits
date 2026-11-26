from __future__ import annotations

import json
import math
import unittest
from decimal import Decimal

from open_gov_data import APIFY_SOURCES, RAPIDAPI_SOURCES, OpenGovDataError
from open_gov_data.validation import (
    format_charge,
    parse_input,
    rapidapi_query_value,
    validate_charge,
    validate_credential,
    validate_max_items,
    validate_timeout,
)


APIFY_TOKEN = f"apify_api_{'A' * 32}"
RAPIDAPI_KEY = f"rapid_{'B' * 32}"


class CatalogTests(unittest.TestCase):
    def test_catalog_contains_exactly_the_eight_approved_products(self) -> None:
        self.assertEqual(
            [source.actor_id for source in APIFY_SOURCES.values()],
            [
                "8LFIbRbidiHPknMz5",
                "KchE3qKKrwU0rCe9f",
                "txnvyTckeQx4hVBc6",
                "Z3ioK0wOAeczj6nCx",
            ],
        )
        self.assertEqual(
            [source.api_slug for source in RAPIDAPI_SOURCES.values()],
            [
                "sec-edgar-corporate-filings",
                "clinicaltrials-gov-studies-trials",
                "openfda-recalls-enforcement-approvals",
                "singapore-bca-green-mark-buildings",
            ],
        )
        serialized = json.dumps(
            {
                "apify": [source.actor_id for source in APIFY_SOURCES.values()],
                "rapidapi": [source.api_slug for source in RAPIDAPI_SOURCES.values()],
            }
        )
        self.assertNotRegex(serialized.casefold(), r"hong\s*kong|private-hk")

    def test_catalog_mappings_are_immutable(self) -> None:
        with self.assertRaises(TypeError):
            APIFY_SOURCES["custom"] = APIFY_SOURCES["sec_edgar"]  # type: ignore[index]


class ValidationTests(unittest.TestCase):
    def test_credentials_are_strict_and_never_echoed(self) -> None:
        self.assertEqual(validate_credential("apify", APIFY_TOKEN), APIFY_TOKEN)
        self.assertEqual(validate_credential("rapidapi", RAPIDAPI_KEY), RAPIDAPI_KEY)
        for provider, value in (
            ("apify", ""),
            ("apify", "apify_api_short"),
            ("apify", f"{APIFY_TOKEN} "),
            ("rapidapi", "too-short"),
            ("rapidapi", f"{RAPIDAPI_KEY}\n"),
        ):
            with self.subTest(provider=provider, length=len(value)):
                with self.assertRaises(OpenGovDataError) as caught:
                    validate_credential(provider, value)
                rendered = f"{caught.exception!s} {caught.exception!r}"
                if value:
                    self.assertNotIn(value, rendered)

    def test_numeric_limits_are_exact_and_bounded(self) -> None:
        self.assertEqual(validate_max_items(1), 1)
        self.assertEqual(validate_max_items(1000), 1000)
        for invalid in (True, 0, -1, 1001, 1.5, "10"):
            with self.subTest(invalid=invalid):
                with self.assertRaises(OpenGovDataError):
                    validate_max_items(invalid)

        self.assertEqual(validate_charge("0.1250"), Decimal("0.1250"))
        self.assertEqual(format_charge(Decimal("0.1250")), "0.125")
        for invalid in (True, 0, -1, 101, math.inf, "nan", "not-money"):
            with self.subTest(invalid=invalid):
                with self.assertRaises(OpenGovDataError):
                    validate_charge(invalid)

        self.assertEqual(validate_timeout(0.1), 0.1)
        self.assertEqual(validate_timeout(300), 300.0)
        for invalid in (True, 0, 301, math.nan, "30"):
            with self.subTest(invalid=invalid):
                with self.assertRaises(OpenGovDataError):
                    validate_timeout(invalid)

    def test_input_is_cloned_and_rejects_secret_fields_recursively(self) -> None:
        original = {"query": "climate", "nested": {"values": [1, 2]}}
        parsed = parse_input(original)
        original["nested"]["values"].append(3)  # type: ignore[index,union-attr]
        self.assertEqual(parsed["nested"], {"values": [1, 2]})

        for key in (
            "authorization",
            "Authorization",
            "APIFY_TOKEN",
            "x-rapidapi-key",
            "rapid_api_key",
            "password",
        ):
            with self.subTest(key=key):
                with self.assertRaises(OpenGovDataError) as caught:
                    parse_input({"nested": {key: APIFY_TOKEN}})
                self.assertEqual(caught.exception.code, "INPUT_SECRET_FIELD")
                self.assertNotIn(APIFY_TOKEN, str(caught.exception))

    def test_input_rejects_invalid_json_cycles_and_nonfinite_values(self) -> None:
        cyclic: dict[str, object] = {}
        cyclic["self"] = cyclic
        for invalid in ("{bad", [], {"number": math.nan}, cyclic, {1: "bad"}):
            with self.subTest(kind=type(invalid).__name__):
                with self.assertRaises(OpenGovDataError) as caught:
                    parse_input(invalid)
                self.assertEqual(caught.exception.code, "INPUT_INVALID")

    def test_rapidapi_query_serialization_is_deliberately_narrow(self) -> None:
        self.assertEqual(rapidapi_query_value(["ongoing", "completed"]), "ongoing,completed")
        self.assertEqual(rapidapi_query_value(True), "true")
        self.assertIsNone(rapidapi_query_value(None))
        with self.assertRaises(OpenGovDataError):
            rapidapi_query_value({"arbitrary": "json"})


if __name__ == "__main__":
    unittest.main()
