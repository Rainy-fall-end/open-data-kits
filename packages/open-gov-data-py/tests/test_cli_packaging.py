from __future__ import annotations

import io
import json
import os
import subprocess
import sys
import tarfile
import tempfile
import tomllib
import unittest
import zipfile
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest.mock import patch

import build_backend
from open_gov_data.cli import main


ROOT = Path(__file__).resolve().parents[1]


class CliTests(unittest.TestCase):
    def test_catalog_command_reports_eight_plus_four(self) -> None:
        output = io.StringIO()
        with redirect_stdout(output):
            result = main(["catalog", "--compact"])
        self.assertEqual(result, 0)
        catalog = json.loads(output.getvalue())
        self.assertEqual(len(catalog["apify"]), 8)
        self.assertEqual(len(catalog["rapidapi"]), 4)

    def test_v010_cli_commands_and_safe_missing_credential_error_remain(self) -> None:
        output = io.StringIO()
        with patch.dict(os.environ, {}, clear=True), redirect_stderr(output):
            result = main(["apify", "sec_edgar", "--compact"])
        self.assertEqual(result, 2)
        error = json.loads(output.getvalue())
        self.assertEqual(error["code"], "AUTH_MISSING")


class PackagingTests(unittest.TestCase):
    def test_pep621_metadata_and_zero_dependencies(self) -> None:
        with (ROOT / "pyproject.toml").open("rb") as handle:
            config = tomllib.load(handle)
        self.assertEqual(config["project"]["name"], "open-gov-data")
        self.assertEqual(config["project"]["version"], "0.2.0")
        self.assertEqual(config["project"]["requires-python"], ">=3.11")
        self.assertEqual(config["project"]["dependencies"], [])
        self.assertEqual(config["build-system"]["requires"], [])
        self.assertEqual(
            config["project"]["scripts"]["open-gov-data"],
            "open_gov_data.cli:main",
        )

    def test_dependency_free_backend_builds_reproducible_wheel_and_sdist(self) -> None:
        with tempfile.TemporaryDirectory() as first, tempfile.TemporaryDirectory() as second:
            first_wheel = Path(first, build_backend.build_wheel(first))
            first_sdist = Path(first, build_backend.build_sdist(first))
            second_wheel = Path(second, build_backend.build_wheel(second))
            second_sdist = Path(second, build_backend.build_sdist(second))
            self.assertEqual(first_wheel.read_bytes(), second_wheel.read_bytes())
            self.assertEqual(first_sdist.read_bytes(), second_sdist.read_bytes())
            with zipfile.ZipFile(first_wheel) as archive:
                names = set(archive.namelist())
                self.assertIn("open_gov_data/client.py", names)
                self.assertIn(
                    "open_gov_data-0.2.0.dist-info/entry_points.txt", names
                )
                metadata = archive.read(
                    "open_gov_data-0.2.0.dist-info/METADATA"
                ).decode()
                self.assertNotIn("Requires-Dist:", metadata)
            with tarfile.open(first_sdist, "r:gz") as archive:
                names = set(archive.getnames())
                self.assertIn("open_gov_data-0.2.0/pyproject.toml", names)
                self.assertIn(
                    "open_gov_data-0.2.0/src/open_gov_data/client.py", names
                )

    def test_wheel_can_be_imported_and_run_directly(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            wheel = str(Path(directory, build_backend.build_wheel(directory)))
            environment = {
                "PYTHONPATH": wheel,
                "PYTHONIOENCODING": "utf-8",
                "PYTHONDONTWRITEBYTECODE": "1",
            }
            result = subprocess.run(
                [sys.executable, "-m", "open_gov_data", "catalog", "--compact"],
                cwd=directory,
                env=environment,
                capture_output=True,
                text=True,
                timeout=30,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            catalog = json.loads(result.stdout)
            self.assertEqual((len(catalog["apify"]), len(catalog["rapidapi"])), (8, 4))


if __name__ == "__main__":
    unittest.main()
