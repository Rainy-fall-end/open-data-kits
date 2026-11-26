from __future__ import annotations

import base64
import csv
import hashlib
import io
import json
import os
import subprocess
import sys
import tarfile
import tempfile
import unittest
import zipfile
from pathlib import Path

from helpers import ROOT

import build_backend


class PackagingTests(unittest.TestCase):
    def _build(self, directory: Path) -> tuple[Path, Path]:
        wheel_name = build_backend.build_wheel(str(directory))
        sdist_name = build_backend.build_sdist(str(directory))
        return directory / wheel_name, directory / sdist_name

    def test_builds_reproducible_wheel_and_sdist_without_dependencies(self) -> None:
        with tempfile.TemporaryDirectory() as first_dir, tempfile.TemporaryDirectory() as second_dir:
            first_wheel, first_sdist = self._build(Path(first_dir))
            second_wheel, second_sdist = self._build(Path(second_dir))
            self.assertEqual(first_wheel.read_bytes(), second_wheel.read_bytes())
            self.assertEqual(first_sdist.read_bytes(), second_sdist.read_bytes())

    def test_wheel_contents_metadata_and_record_hashes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            wheel, _ = self._build(Path(directory))
            with zipfile.ZipFile(wheel) as archive:
                names = set(archive.namelist())
                self.assertIn("open_gov_ai_tools/__init__.py", names)
                self.assertIn("open_gov_ai_tools/dispatcher.py", names)
                self.assertIn(
                    "open_gov_ai_tools-0.1.0.dist-info/licenses/LICENSE",
                    names,
                )
                metadata = archive.read(
                    "open_gov_ai_tools-0.1.0.dist-info/METADATA"
                ).decode("utf-8")
                self.assertIn("Name: open-gov-ai-tools", metadata)
                self.assertIn("Requires-Python: >=3.11", metadata)
                self.assertNotIn("Requires-Dist:", metadata)
                record = archive.read(
                    "open_gov_ai_tools-0.1.0.dist-info/RECORD"
                ).decode("utf-8")
                for name, digest, size in csv.reader(io.StringIO(record)):
                    if not digest:
                        continue
                    payload = archive.read(name)
                    expected = base64.urlsafe_b64encode(
                        hashlib.sha256(payload).digest()
                    ).rstrip(b"=").decode("ascii")
                    self.assertEqual(digest, f"sha256={expected}")
                    self.assertEqual(int(size), len(payload))
                self.assertFalse(any("evidence.json" in name for name in names))

    def test_sdist_contains_build_inputs_tests_and_no_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            _, sdist = self._build(Path(directory))
            with tarfile.open(sdist, "r:gz") as archive:
                names = set(archive.getnames())
            prefix = "open_gov_ai_tools-0.1.0/"
            self.assertIn(prefix + "pyproject.toml", names)
            self.assertIn(prefix + "build_backend.py", names)
            self.assertIn(prefix + "verify.py", names)
            self.assertIn(prefix + "tests/test_dispatcher_loopback.py", names)
            self.assertIn(prefix + "src/open_gov_ai_tools/catalog.py", names)
            self.assertFalse(any(name.endswith("evidence.json") for name in names))

    def test_wheel_runs_in_isolated_import_directory(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            wheel, _ = self._build(root)
            target = root / "unpacked"
            target.mkdir()
            with zipfile.ZipFile(wheel) as archive:
                archive.extractall(target)
            environment = os.environ.copy()
            environment["PYTHONPATH"] = str(target)
            completed = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "open_gov_ai_tools",
                    "anthropic",
                    "--compact",
                ],
                cwd=target,
                env=environment,
                capture_output=True,
                text=True,
                timeout=20,
                check=False,
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            exported = json.loads(completed.stdout)
            self.assertEqual(len(exported), 8)
            self.assertTrue(all("input_schema" in item for item in exported))


if __name__ == "__main__":
    unittest.main()
