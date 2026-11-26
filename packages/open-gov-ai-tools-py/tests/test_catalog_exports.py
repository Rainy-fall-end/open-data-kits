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
    ToolDispatcher,
    catalog_snapshot,
    export_anthropic_tools,
    export_gemini_function_declarations,
    export_gemini_tools,
    export_openai_tools,
)


EXPECTED_ACTORS = {
    "8LFIbRbidiHPknMz5",
    "KchE3qKKrwU0rCe9f",
    "txnvyTckeQx4hVBc6",
    "Z3ioK0wOAeczj6nCx",
}
EXPECTED_SLUGS = {
    "sec-edgar-corporate-filings",
    "clinicaltrials-gov-studies-trials",
    "openfda-recalls-enforcement-approvals",
    "singapore-bca-green-mark-buildings",
}


def walk_keys(value: object) -> set[str]:
    keys: set[str] = set()
    if isinstance(value, dict):
        for key, item in value.items():
            keys.add(key)
            keys.update(walk_keys(item))
    elif isinstance(value, list):
        for item in value:
            keys.update(walk_keys(item))
    return keys


class CatalogTests(unittest.TestCase):
    def test_catalog_is_exact_closed_allowlist(self) -> None:
        catalog = catalog_snapshot()
        self.assertEqual(len(catalog), 8)
        self.assertEqual(set(APIFY_ACTOR_IDS), EXPECTED_ACTORS)
        self.assertEqual(set(RAPIDAPI_SLUGS), EXPECTED_SLUGS)
        self.assertEqual(
            {item["actor_id"] for item in catalog if "actor_id" in item},
            EXPECTED_ACTORS,
        )
        self.assertEqual(
            {item["api_slug"] for item in catalog if "api_slug" in item},
            EXPECTED_SLUGS,
        )
        self.assertEqual(len({item["name"] for item in catalog}), 8)
        serialized = json.dumps(catalog, sort_keys=True).casefold()
        self.assertNotIn("hong kong", serialized)
        self.assertNotIn("hk_", serialized)
        for item in catalog:
            self.assertFalse(item["parameters"]["additionalProperties"])
            self.assertTrue(item["provenance"]["source_url"].startswith("https://"))
            self.assertTrue(item["provenance"]["license_url"].startswith("https://"))

    def test_openai_chat_and_responses_shapes(self) -> None:
        chat = export_openai_tools()
        responses = export_openai_tools(style="responses")
        self.assertEqual(len(chat), 8)
        self.assertEqual(len(responses), 8)
        self.assertTrue(all(item["type"] == "function" for item in chat))
        self.assertTrue(all(set(item) == {"type", "function"} for item in chat))
        self.assertTrue(all(item["function"]["strict"] is False for item in chat))
        self.assertTrue(all(item["strict"] is False for item in responses))
        self.assertEqual(
            [item["function"]["name"] for item in chat],
            [item["name"] for item in responses],
        )

    def test_anthropic_and_gemini_shapes(self) -> None:
        anthropic = export_anthropic_tools()
        declarations = export_gemini_function_declarations()
        wrapper = export_gemini_tools()
        self.assertEqual(len(anthropic), 8)
        self.assertEqual(len(declarations), 8)
        self.assertEqual(wrapper, [{"function_declarations": declarations}])
        self.assertTrue(
            all(set(item) == {"name", "description", "input_schema"} for item in anthropic)
        )
        self.assertTrue(
            all(set(item) == {"name", "description", "parameters"} for item in declarations)
        )
        self.assertNotIn("allOf", walk_keys(declarations))
        self.assertNotIn("additionalProperties", walk_keys(declarations))
        sec = next(item for item in declarations if item["name"].endswith("sec_edgar_filings"))
        self.assertIn("provide at least one of cik or ticker", sec["description"])

    def test_exports_are_json_serializable_and_defensive_copies(self) -> None:
        first = export_openai_tools()
        json.dumps(first, allow_nan=False)
        first[0]["function"]["parameters"]["properties"]["mode"]["enum"].append("bad")
        second = export_openai_tools()
        self.assertNotIn(
            "bad",
            second[0]["function"]["parameters"]["properties"]["mode"]["enum"],
        )

    def test_dispatcher_embeds_custom_hard_cap_in_apify_schemas(self) -> None:
        dispatcher = ToolDispatcher(max_total_charge_usd="0.123456")
        schemas = dispatcher.openai_tools()
        apify = [item for item in schemas if item["function"]["name"].startswith("apify_")]
        for item in apify:
            cap = item["function"]["parameters"]["properties"]["maxTotalChargeUsd"]
            self.assertEqual(cap["maximum"], 0.123456)
            self.assertEqual(cap["default"], 0.123456)

    def test_cli_exports_offline_json(self) -> None:
        environment = os.environ.copy()
        environment["PYTHONPATH"] = str(ROOT / "src")
        completed = subprocess.run(
            [sys.executable, "-m", "open_gov_ai_tools", "gemini", "--compact"],
            cwd=ROOT,
            env=environment,
            capture_output=True,
            text=True,
            timeout=20,
            check=False,
        )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(len(json.loads(completed.stdout)), 8)

    def test_pep621_declares_zero_dependencies(self) -> None:
        metadata = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))
        self.assertEqual(metadata["build-system"]["requires"], [])
        self.assertEqual(metadata["project"]["dependencies"], [])
        self.assertEqual(metadata["project"]["name"], "open-gov-ai-tools")
        self.assertEqual(metadata["project"]["requires-python"], ">=3.11")


if __name__ == "__main__":
    unittest.main()
