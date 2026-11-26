from __future__ import annotations

import json
import os
import subprocess
import sys
import tomllib
import unittest

from helpers import ROOT

from open_gov_ai_tools import (
    APIFY_ACTOR_IDS,
    RAPIDAPI_SLUGS,
    TOOL_NAMES,
    ToolDispatcher,
    catalog_snapshot,
    export_anthropic_tools,
    export_gemini_function_declarations,
    export_gemini_tools,
    export_openai_tools,
)


EXPECTED_ACTORS = (
    "CRulq5dak4mqAUmMn",
    "8LFIbRbidiHPknMz5",
    "ZlabhlvEIyRVdtKiQ",
    "re8aRvtqBonP5HMuY",
    "eQQ2beomyLlW4DTGM",
    "KchE3qKKrwU0rCe9f",
    "txnvyTckeQx4hVBc6",
    "Z3ioK0wOAeczj6nCx",
)
EXPECTED_SLUGS = (
    "sec-edgar-corporate-filings",
    "clinicaltrials-gov-studies-trials",
    "openfda-recalls-enforcement-approvals",
    "singapore-bca-green-mark-buildings",
)
EXPECTED_NAMES = (
    "apify_ats_jobs_hiring_signals",
    "apify_sec_edgar_intelligence",
    "apify_global_public_tenders",
    "apify_pharma_pipeline_intelligence",
    "apify_usaspending_contracts",
    "apify_clinical_trials",
    "apify_uk_gov_tenders",
    "apify_sg_green_mark",
    "rapidapi_sec_edgar",
    "rapidapi_clinical_trials",
    "rapidapi_openfda",
    "rapidapi_sg_green_mark",
)
ACTOR_PROPERTIES = {
    EXPECTED_NAMES[0]: {"preset", "companyBoards", "keywords", "remoteOnly", "departmentFilter", "includeDescription", "maxItems"},
    EXPECTED_NAMES[1]: {"mode", "query", "ticker", "cik", "forms", "startDate", "endDate", "excludePooledFunds", "minOfferingAmountUsd", "industryFilter", "includeAmendments", "maxItems"},
    EXPECTED_NAMES[2]: {"sources", "opportunityTypes", "keyword", "dateFrom", "dateTo", "maxItems", "perSourceLimit", "sourceTimeoutSecs"},
    EXPECTED_NAMES[3]: {"mode", "query", "drugNames", "maxItems", "sourceItemsPerQuery", "sourceTimeoutSeconds", "requestDelayMs"},
    EXPECTED_NAMES[4]: {"keyword", "awardCategory", "startDate", "endDate", "awardingAgency", "minAwardAmount", "naicsCode", "sortOrder", "maxItems"},
    EXPECTED_NAMES[5]: {"condition", "intervention", "status", "sponsor", "queryTerm", "maxItems"},
    EXPECTED_NAMES[6]: {"keyword", "stages", "minValue", "publishedFrom", "maxItems"},
    EXPECTED_NAMES[7]: {"query", "rating", "expiresWithinDays", "maxItems"},
}


class CatalogExportTests(unittest.TestCase):
    def test_catalog_is_exact_closed_allowlist(self) -> None:
        catalog = catalog_snapshot()
        self.assertEqual(tuple(item["name"] for item in catalog), EXPECTED_NAMES)
        self.assertEqual(APIFY_ACTOR_IDS, EXPECTED_ACTORS)
        self.assertEqual(RAPIDAPI_SLUGS, EXPECTED_SLUGS)
        self.assertEqual(TOOL_NAMES, EXPECTED_NAMES)
        self.assertEqual(
            tuple(item["actor_id"] for item in catalog if "actor_id" in item),
            EXPECTED_ACTORS,
        )
        self.assertEqual(
            tuple(item["api_slug"] for item in catalog if "api_slug" in item),
            EXPECTED_SLUGS,
        )
        serialized = json.dumps(catalog, sort_keys=True).casefold()
        self.assertNotIn("hong" + " kong", serialized)
        self.assertNotIn("hk" + "_", serialized)

    def test_apify_properties_match_actor_inputs_plus_cost_control(self) -> None:
        by_name = {item["name"]: item for item in catalog_snapshot()}
        for name, actor_properties in ACTOR_PROPERTIES.items():
            with self.subTest(name=name):
                schema = by_name[name]["parameters"]
                self.assertEqual(set(schema["properties"]), actor_properties | {"maxTotalChargeUsd"})
                self.assertFalse(schema["additionalProperties"])
                cap = schema["properties"]["maxTotalChargeUsd"]
                self.assertEqual(cap["default"], 0.25)
                self.assertEqual(cap["maximum"], 0.25)
                self.assertEqual(cap["exclusiveMinimum"], 0)

    def test_real_mode_enums_and_limits_are_preserved(self) -> None:
        by_name = {item["name"]: item for item in catalog_snapshot()}
        sec = by_name["apify_sec_edgar_intelligence"]["parameters"]["properties"]
        self.assertEqual(sec["mode"]["enum"], ["form_d_funding", "xbrl_financials", "filings"])
        self.assertEqual(sec["mode"]["default"], "form_d_funding")
        self.assertEqual(sec["maxItems"]["maximum"], 5_000)
        self.assertEqual(sec["maxItems"]["default"], 10)
        ats = by_name["apify_ats_jobs_hiring_signals"]["parameters"]["properties"]
        self.assertEqual(ats["preset"]["default"], "ai_leaders")
        self.assertEqual(ats["maxItems"]["maximum"], 10_000)
        global_tools = by_name["apify_global_public_tenders"]["parameters"]["properties"]
        self.assertEqual(len(global_tools["sources"]["default"]), 7)
        self.assertEqual(global_tools["perSourceLimit"]["default"], 2)

    def test_all_three_model_formats_cover_all_twelve_names(self) -> None:
        openai_chat = export_openai_tools()
        openai_responses = export_openai_tools(style="responses")
        anthropic = export_anthropic_tools()
        gemini = export_gemini_function_declarations()
        self.assertEqual(
            tuple(item["function"]["name"] for item in openai_chat),
            EXPECTED_NAMES,
        )
        self.assertEqual(tuple(item["name"] for item in openai_responses), EXPECTED_NAMES)
        self.assertEqual(tuple(item["name"] for item in anthropic), EXPECTED_NAMES)
        self.assertEqual(tuple(item["name"] for item in gemini), EXPECTED_NAMES)
        for item in openai_chat:
            self.assertEqual(item["type"], "function")
            self.assertFalse(item["function"]["strict"])
            self.assertFalse(item["function"]["parameters"]["additionalProperties"])
        for item in anthropic:
            self.assertIn("input_schema", item)
        for item in gemini:
            self.assertIn("parameters", item)

    def test_gemini_rest_wrapper_uses_function_declarations(self) -> None:
        wrapped = export_gemini_tools()
        self.assertEqual(len(wrapped), 1)
        self.assertEqual(
            tuple(item["name"] for item in wrapped[0]["functionDeclarations"]),
            EXPECTED_NAMES,
        )

    def test_dispatcher_bound_exports_match_module_exports(self) -> None:
        dispatcher = ToolDispatcher()
        self.assertEqual(dispatcher.openai_tools(), export_openai_tools())
        self.assertEqual(dispatcher.anthropic_tools(), export_anthropic_tools())
        self.assertEqual(
            dispatcher.gemini_function_declarations(),
            export_gemini_function_declarations(),
        )

    def test_pep621_metadata_is_versioned_and_dependency_free(self) -> None:
        metadata = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))
        self.assertEqual(metadata["project"]["name"], "open-gov-ai-tools")
        self.assertEqual(metadata["project"]["version"], "0.2.0")
        self.assertEqual(metadata["project"]["requires-python"], ">=3.11")
        self.assertEqual(metadata["project"]["dependencies"], [])
        self.assertEqual(metadata["build-system"]["requires"], [])

    def test_cli_exports_offline_json(self) -> None:
        environment = os.environ.copy()
        environment["PYTHONPATH"] = str(ROOT / "src")
        completed = subprocess.run(
            [sys.executable, "-m", "open_gov_ai_tools", "openai-responses", "--compact"],
            cwd=ROOT,
            env=environment,
            capture_output=True,
            text=True,
            timeout=20,
            check=False,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(len(json.loads(completed.stdout)), 12)


if __name__ == "__main__":
    unittest.main()
