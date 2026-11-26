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
    def test_catalog_command_emits_machine_readable_json(self) -> None:
        output = io.StringIO()
        with redirect_stdout(output):
            result = main(["catalog", "--compact"])
        self.assertEqual(result, 0)
        catalog = json.loads(output.getvalue())
        self.assertEqual(len(catalog["apify"]), 4)
        self.assertEqual(len(catalog["rapidapi"]), 4)

    def test_missing_credential_is_safe_json_on_stderr(self) -> None:
        output = io.StringIO()
        with patch.dict(os.environ, {}, clear=True), redirect_stderr(output):
            result = main(["apify", "sec_edgar", "--compact"])
        self.assertEqual(result, 2)
        error = json.loads(output.getvalue())
        self.assertEqual(error["code"], "AUTH_MISSING")
        self.assertNotIn("token", error["message"].casefold())


class PackagingTests(unittest.TestCase):
    def test_pep621_metadata_and_zero_declared_dependencies(self) -> None:
        with (ROOT / "pyproject.toml").open("rb") as handle:
            config = tomllib.load(handle)
        project = config["project"]
        self.assertEqual(project["name"], "open-gov-data")
        self.assertEqual(project["requires-python"], ">=3.11")
        self.assertEqual(project["dependencies"], [])
        self.assertEqual(
            project["scripts"]["open-gov-data"], "open_gov_data.cli:main"
        )
        self.assertEqual(config["build-system"]["requires"], [])

    def test_dependency_free_backend_builds_wheel_and_sdist(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            wheel_name = build_backend.build_wheel(directory)
            sdist_name = build_backend.build_sdist(directory)
            wheel = Path(directory, wheel_name)
            sdist = Path(directory, sdist_name)
            self.assertTrue(wheel.is_file())
            self.assertTrue(sdist.is_file())

            with zipfile.ZipFile(wheel) as archive:
                names = set(archive.namelist())
                self.assertIn("open_gov_data/client.py", names)
                self.assertIn(
                    "open_gov_data-0.1.0.dist-info/entry_points.txt", names
                )
                self.assertIn("open_gov_data-0.1.0.dist-info/RECORD", names)
                self.assertFalse(any(name.startswith("tests/") for name in names))
                metadata = archive.read(
                    "open_gov_data-0.1.0.dist-info/METADATA"
                ).decode()
                self.assertIn("Name: open-gov-data", metadata)
                self.assertNotIn("Requires-Dist:", metadata)

            with tarfile.open(sdist, "r:gz") as archive:
                names = set(archive.getnames())
                self.assertIn("open_gov_data-0.1.0/pyproject.toml", names)
                self.assertIn("open_gov_data-0.1.0/build_backend.py", names)
                self.assertIn(
                    "open_gov_data-0.1.0/src/open_gov_data/client.py", names
                )
                self.assertIn("open_gov_data-0.1.0/PKG-INFO", names)

    def test_wheel_can_be_imported_and_run_directly(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            wheel_name = build_backend.build_wheel(directory)
            wheel = str(Path(directory, wheel_name))
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
            self.assertEqual(len(json.loads(result.stdout)["apify"]), 4)


if __name__ == "__main__":
    unittest.main()

