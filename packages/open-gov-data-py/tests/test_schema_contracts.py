from __future__ import annotations

import json
import unittest
from pathlib import Path
from typing import Any

from open_gov_data import APIFY_SOURCES, RAPIDAPI_SOURCES
from open_gov_data.schemas import (
    ACTOR_INPUT_SCHEMAS,
    ACTOR_SCHEMA_FILES,
    RAPIDAPI_QUERY_SCHEMAS,
    RAPIDAPI_SCHEMA_FILES,
)


PACKAGE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = PACKAGE_ROOT.parents[1]
CONTRACT_KEYS = ("type", "default", "enum", "minimum", "maximum", "minLength", "maxLength")


def normalized(value: Any) -> Any:
    if isinstance(value, tuple):
        return [normalized(item) for item in value]
    return value


class RepositorySchemaContractTests(unittest.TestCase):
    def test_exact_closed_catalog(self) -> None:
        self.assertEqual(
            [item.actor_id for item in APIFY_SOURCES.values()],
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
        self.assertEqual(
            [item.api_slug for item in RAPIDAPI_SOURCES.values()],
            [
                "sec-edgar-corporate-filings",
                "clinicaltrials-gov-studies-trials",
                "openfda-recalls-enforcement-approvals",
                "singapore-bca-green-mark-buildings",
            ],
        )

    def test_embedded_actor_snapshots_match_all_eight_repository_schemas(self) -> None:
        self.assertEqual(set(ACTOR_INPUT_SCHEMAS), set(ACTOR_SCHEMA_FILES))
        for source, relative in ACTOR_SCHEMA_FILES.items():
            with self.subTest(source=source):
                document = json.loads((REPO_ROOT / relative).read_text(encoding="utf-8"))
                actual = document["properties"]
                embedded = ACTOR_INPUT_SCHEMAS[source]
                self.assertEqual(set(embedded), set(actual))
                for field, spec in embedded.items():
                    for key in CONTRACT_KEYS:
                        if key in spec:
                            self.assertIn(key, actual[field])
                            self.assertEqual(
                                normalized(spec[key]), normalized(actual[field][key])
                            )

    def test_embedded_rapidapi_snapshots_match_all_four_openapi_routes(self) -> None:
        self.assertEqual(set(RAPIDAPI_QUERY_SCHEMAS), set(RAPIDAPI_SCHEMA_FILES))
        for source, relative in RAPIDAPI_SCHEMA_FILES.items():
            with self.subTest(source=source):
                document = json.loads((REPO_ROOT / relative).read_text(encoding="utf-8"))
                path = RAPIDAPI_SOURCES[source].path
                parameters = document["paths"][path]["get"]["parameters"]
                actual = {parameter["name"]: parameter["schema"] for parameter in parameters}
                embedded = RAPIDAPI_QUERY_SCHEMAS[source]
                self.assertEqual(set(embedded), set(actual))
                for field, spec in embedded.items():
                    for key in CONTRACT_KEYS:
                        if key in spec:
                            self.assertIn(key, actual[field])
                            self.assertEqual(
                                normalized(spec[key]), normalized(actual[field][key])
                            )


if __name__ == "__main__":
    unittest.main()
