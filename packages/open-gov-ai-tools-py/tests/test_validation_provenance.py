from __future__ import annotations

import json
import unittest
from decimal import Decimal

from helpers import APIFY_TOKEN, RAPIDAPI_KEY

from open_gov_ai_tools import (
    REDACTED,
    OpenGovToolsError,
    ProvenanceFormatter,
    SchemaValidationError,
    ToolDispatcher,
    catalog_snapshot,
    format_rag_records,
    redact_secrets,
    redact_text,
)


class ValidationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.dispatcher = ToolDispatcher(max_total_charge_usd="0.25")

    def test_defaults_match_actor_and_rapidapi_contracts(self) -> None:
        sec = self.dispatcher.validate("apify_sec_edgar_intelligence", {})
        self.assertEqual(sec["mode"], "form_d_funding")
        self.assertEqual(sec["forms"], "10-K,10-Q,8-K")
        self.assertEqual(sec["maxItems"], 10)
        self.assertEqual(sec["maxTotalChargeUsd"], 0.25)
        ats = self.dispatcher.validate("apify_ats_jobs_hiring_signals", {})
        self.assertEqual(ats["preset"], "ai_leaders")
        self.assertFalse(ats["remoteOnly"])
        pharma = self.dispatcher.validate("apify_pharma_pipeline_intelligence", {})
        self.assertEqual(pharma["query"], "semaglutide")
        rapid = self.dispatcher.validate("rapidapi_openfda", {})
        self.assertEqual(rapid, {"dataset": "drug_enforcement", "limit": 5})

    def test_unknown_type_enum_pattern_date_and_bounds_are_rejected(self) -> None:
        invalid_cases = [
            ("rapidapi_openfda", {"unknown": 1}),
            ("rapidapi_openfda", {"limit": True}),
            ("rapidapi_openfda", {"limit": 21}),
            ("rapidapi_openfda", {"dataset": "unlisted"}),
            ("apify_sec_edgar_intelligence", {"ticker": "not valid"}),
            ("apify_usaspending_contracts", {"startDate": "2026-02-30"}),
            ("apify_pharma_pipeline_intelligence", {"query": ""}),
            ("apify_ats_jobs_hiring_signals", {"maxItems": 10_001}),
        ]
        for tool, arguments in invalid_cases:
            with self.subTest(tool=tool, arguments=arguments):
                with self.assertRaises(SchemaValidationError):
                    self.dispatcher.validate(tool, arguments)

    def test_json_duplicates_non_objects_and_non_finite_values_are_rejected(self) -> None:
        with self.assertRaises(SchemaValidationError):
            self.dispatcher.validate("rapidapi_openfda", '{"limit":2,"limit":3}')
        with self.assertRaises(SchemaValidationError):
            self.dispatcher.validate("rapidapi_openfda", "[]")
        with self.assertRaises(SchemaValidationError):
            self.dispatcher.validate("rapidapi_openfda", '{"limit":NaN}')

    def test_secret_fields_are_rejected_without_echoing_values(self) -> None:
        secret = "DO_NOT_ECHO_VALUE"
        for key in ("token", "api_key", "Authorization", "x-rapidapi-key"):
            with self.subTest(key=key):
                with self.assertRaises(SchemaValidationError) as raised:
                    self.dispatcher.validate("rapidapi_openfda", {key: secret})
                self.assertNotIn(secret, str(raised.exception))

    def test_apify_budget_is_immutable_and_can_only_be_lowered(self) -> None:
        lowered = self.dispatcher.validate(
            "apify_clinical_trials", {"maxTotalChargeUsd": 0.1}
        )
        self.assertEqual(lowered["maxTotalChargeUsd"], 0.1)
        with self.assertRaises(OpenGovToolsError) as raised:
            self.dispatcher.validate(
                "apify_clinical_trials", {"maxTotalChargeUsd": 0.250001}
            )
        self.assertEqual(raised.exception.code, "COST_LIMIT_EXCEEDED")
        self.assertEqual(self.dispatcher.max_total_charge_usd, Decimal("0.25"))
        with self.assertRaises(AttributeError):
            self.dispatcher.max_total_charge_usd = Decimal("1")  # type: ignore[misc]


class RedactionTests(unittest.TestCase):
    def test_recursive_redaction_handles_fields_values_and_exact_secrets(self) -> None:
        data = {
            "Authorization": "Bearer " + RAPIDAPI_KEY,
            "nested": {
                "api_key": RAPIDAPI_KEY,
                "message": "token=" + APIFY_TOKEN,
                "safe": "public",
            },
        }
        redacted = redact_secrets(data, secrets=(RAPIDAPI_KEY, APIFY_TOKEN))
        rendered = json.dumps(redacted)
        self.assertNotIn(RAPIDAPI_KEY, rendered)
        self.assertNotIn(APIFY_TOKEN, rendered)
        self.assertEqual(redacted["Authorization"], REDACTED)
        self.assertEqual(redacted["nested"]["api_key"], REDACTED)
        self.assertEqual(redacted["nested"]["safe"], "public")

    def test_text_redaction_preserves_non_secret_context(self) -> None:
        text = "request authorization: Bearer " + RAPIDAPI_KEY + " completed"
        redacted = redact_text(text, secrets=(RAPIDAPI_KEY,))
        self.assertIn("request", redacted)
        self.assertIn(REDACTED, redacted)
        self.assertNotIn(RAPIDAPI_KEY, redacted)


class ProvenanceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.formatter = ProvenanceFormatter()

    def test_all_twelve_tools_produce_citation_ready_documents(self) -> None:
        for definition in catalog_snapshot():
            with self.subTest(tool=definition["name"]):
                document = self.formatter.format_records(
                    definition["name"], [{"id": definition["name"], "title": "Fixture"}]
                )[0]
                self.assertEqual(document["id"], definition["name"])
                self.assertTrue(document["metadata"]["source_url"].startswith("https://"))
                self.assertTrue(document["metadata"]["license_url"].startswith("https://"))
                self.assertTrue(document["metadata"]["attribution"])
                self.assertEqual(document["metadata"]["tool_name"], definition["name"])

    def test_official_record_source_is_retained(self) -> None:
        record = {
            "accessionNumber": "0001",
            "filingUrl": "https://www.sec.gov/Archives/example",
        }
        document = format_rag_records("apify_sec_edgar_intelligence", [record])[0]
        self.assertEqual(document["metadata"]["source_url"], record["filingUrl"])
        self.assertEqual(document["record"], record)

    def test_untrusted_urls_cannot_poison_citations(self) -> None:
        document = self.formatter.format_records(
            "rapidapi_sec_edgar",
            [{
                "accessionNumber": "1",
                "filingUrl": "https://sec.gov.evil.invalid/phish",
                "licenseUrl": "https://evil.invalid/license",
            }],
        )[0]
        self.assertEqual(document["metadata"]["source_url"], "https://www.sec.gov/edgar/search/")
        self.assertNotIn("evil.invalid", json.dumps(document["metadata"]))

    def test_rag_formatter_redacts_secret_fields(self) -> None:
        document = self.formatter.format_records(
            "rapidapi_openfda",
            [{"id": "1", "api_key": RAPIDAPI_KEY, "notes": "safe"}],
        )[0]
        rendered = json.dumps(document)
        self.assertNotIn(RAPIDAPI_KEY, rendered)
        self.assertEqual(document["record"]["api_key"], REDACTED)

    def test_dispatch_envelope_and_fallback_identifier_are_deterministic(self) -> None:
        result = {
            "tool_name": "rapidapi_sg_green_mark",
            "data": {"items": [{"project": "Fixture"}]},
        }
        first = self.formatter.format_dispatch_result(result)[0]
        second = self.formatter.format_dispatch_result(result)[0]
        self.assertEqual(first["id"], second["id"])
        self.assertIn('"project":"Fixture"', first["text"])


if __name__ == "__main__":
    unittest.main()
