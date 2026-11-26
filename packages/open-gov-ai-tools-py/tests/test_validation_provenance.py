from __future__ import annotations

import unittest
from decimal import Decimal

from helpers import ROOT  # noqa: F401 - also installs src on sys.path

from open_gov_ai_tools import (
    OpenGovToolsError,
    ProvenanceFormatter,
    SchemaValidationError,
    ToolDispatcher,
    format_rag_records,
)


class ValidationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.dispatcher = ToolDispatcher(max_total_charge_usd="0.25")

    def test_defaults_are_applied_before_dispatch(self) -> None:
        rapid = self.dispatcher.validate("rapidapi_openfda_records", {})
        self.assertEqual(rapid["dataset"], "drug_enforcement")
        self.assertEqual(rapid["limit"], 5)
        apify = self.dispatcher.validate("apify_sec_edgar_filings", {})
        self.assertEqual(apify["mode"], "search")
        self.assertEqual(apify["forms"], "10-K,10-Q,8-K")
        self.assertEqual(apify["maxItems"], 10)
        self.assertEqual(apify["maxTotalChargeUsd"], 0.25)

    def test_strict_unknown_type_enum_pattern_and_date_validation(self) -> None:
        invalid_cases = [
            ("rapidapi_openfda_records", {"unknown": 1}),
            ("rapidapi_openfda_records", {"limit": True}),
            ("rapidapi_openfda_records", {"limit": 21}),
            ("rapidapi_openfda_records", {"dataset": "unlisted"}),
            ("apify_sec_edgar_filings", {"ticker": "not valid"}),
            ("apify_sec_edgar_filings", {"startDate": "2026-02-30"}),
        ]
        for tool, arguments in invalid_cases:
            with self.subTest(tool=tool, arguments=arguments):
                with self.assertRaises(SchemaValidationError):
                    self.dispatcher.validate(tool, arguments)

    def test_company_mode_requires_cik_or_ticker(self) -> None:
        with self.assertRaises(SchemaValidationError):
            self.dispatcher.validate("apify_sec_edgar_filings", {"mode": "company"})
        valid = self.dispatcher.validate(
            "apify_sec_edgar_filings",
            {"mode": "company", "cik": "320193"},
        )
        self.assertEqual(valid["cik"], "320193")

    def test_json_string_duplicate_and_non_object_rejection(self) -> None:
        with self.assertRaises(SchemaValidationError):
            self.dispatcher.validate("rapidapi_openfda_records", '{"limit":2,"limit":3}')
        with self.assertRaises(SchemaValidationError):
            self.dispatcher.validate("rapidapi_openfda_records", "[]")
        with self.assertRaises(SchemaValidationError):
            self.dispatcher.validate("rapidapi_openfda_records", '{"limit":NaN}')

    def test_secret_fields_are_rejected_without_echoing_values(self) -> None:
        secret = "DO_NOT_ECHO_THIS_SECRET"
        for key in ("token", "api_key", "Authorization", "x-rapidapi-key"):
            with self.subTest(key=key):
                with self.assertRaises(SchemaValidationError) as raised:
                    self.dispatcher.validate(
                        "rapidapi_openfda_records",
                        {key: secret},
                    )
                self.assertNotIn(secret, str(raised.exception))

    def test_apify_budget_can_only_be_lowered(self) -> None:
        lowered = self.dispatcher.validate(
            "apify_clinical_trials",
            {"maxTotalChargeUsd": 0.1},
        )
        self.assertEqual(lowered["maxTotalChargeUsd"], 0.1)
        with self.assertRaises(OpenGovToolsError) as raised:
            self.dispatcher.validate(
                "apify_clinical_trials",
                {"maxTotalChargeUsd": 0.250001},
            )
        self.assertEqual(raised.exception.code, "COST_LIMIT_EXCEEDED")
        self.assertEqual(self.dispatcher.max_total_charge_usd, Decimal("0.25"))
        with self.assertRaises(AttributeError):
            self.dispatcher.max_total_charge_usd = Decimal("1")  # type: ignore[misc]

    def test_tool_allowlist_is_closed(self) -> None:
        with self.assertRaises(OpenGovToolsError) as raised:
            self.dispatcher.validate("apify_private_actor", {})
        self.assertEqual(raised.exception.code, "TOOL_NOT_ALLOWED")


class ProvenanceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.formatter = ProvenanceFormatter()

    def test_each_dataset_gets_per_record_official_source_and_license(self) -> None:
        cases = [
            (
                "apify_sec_edgar_filings",
                {"accessionNumber": "0001", "filingUrl": "https://www.sec.gov/Archives/x"},
                "sec.gov",
                "sec.gov",
            ),
            (
                "rapidapi_clinical_trials",
                {"nctId": "NCT1", "studyUrl": "https://clinicaltrials.gov/study/NCT1"},
                "clinicaltrials.gov",
                "clinicaltrials.gov",
            ),
            (
                "rapidapi_openfda_records",
                {"recallNumber": "R1", "sourceUrl": "https://api.fda.gov/drug/enforcement.json"},
                "fda.gov",
                "open.fda.gov",
            ),
            (
                "apify_uk_gov_tenders",
                {
                    "ocid": "ocds-1",
                    "noticeUrl": "https://www.contractsfinder.service.gov.uk/Notice/1",
                    "licenceName": "Open Government Licence v3.0",
                    "licenceUrl": "http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
                },
                "contractsfinder.service.gov.uk",
                "nationalarchives.gov.uk",
            ),
            (
                "rapidapi_singapore_green_mark",
                {
                    "referenceNo": "SG-1",
                    "sourceUrl": "https://data.gov.sg/datasets/d_c4bd082b48fa7611713f39e23d250c27/view",
                    "licenceUrl": "https://developers.data.gov.sg/open-data-licence",
                },
                "data.gov.sg",
                "data.gov.sg",
            ),
        ]
        for tool, record, source_host, license_host in cases:
            with self.subTest(tool=tool):
                document = self.formatter.format_records(tool, [record])[0]
                self.assertIn(source_host, document["metadata"]["source_url"])
                self.assertIn(license_host, document["metadata"]["license_url"])
                self.assertTrue(document["metadata"]["license_name"])
                self.assertTrue(document["metadata"]["attribution"])
                self.assertEqual(document["record"], record)
                self.assertIn(str(document["id"]), {str(value) for value in record.values()})

    def test_original_attribution_is_preserved(self) -> None:
        attribution = "Original upstream attribution, accessed 2026-11-26."
        document = format_rag_records(
            "rapidapi_openfda_records",
            [{"id": "1", "attribution": attribution}],
        )[0]
        self.assertEqual(document["metadata"]["attribution"], attribution)
        self.assertEqual(document["record"]["attribution"], attribution)

    def test_untrusted_record_urls_cannot_poison_citations(self) -> None:
        document = self.formatter.format_records(
            "apify_sec_edgar_filings",
            [
                {
                    "accessionNumber": "1",
                    "filingUrl": "https://sec.gov.evil.invalid/phish",
                    "licenseUrl": "https://evil.invalid/license",
                }
            ],
        )[0]
        self.assertEqual(document["metadata"]["source_url"], "https://www.sec.gov/edgar/search/")
        self.assertIn("sec.gov", document["metadata"]["license_url"])
        self.assertNotIn("evil.invalid", str(document["metadata"]))

    def test_dispatch_envelope_and_fallback_identifier_are_supported(self) -> None:
        result = {
            "tool_name": "rapidapi_singapore_green_mark",
            "data": {"items": [{"project": "Fixture"}]},
        }
        first = self.formatter.format_dispatch_result(result)[0]
        second = self.formatter.format_dispatch_result(result)[0]
        self.assertEqual(first["id"], second["id"])
        self.assertIn('"project":"Fixture"', first["text"])
        self.assertEqual(first["metadata"]["license_name"], "Singapore Open Data Licence v1.0")


if __name__ == "__main__":
    unittest.main()
