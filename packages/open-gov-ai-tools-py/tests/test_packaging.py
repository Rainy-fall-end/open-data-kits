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
        wheel = directory / build_backend.build_wheel(str(directory))
        sdist = directory / build_backend.build_sdist(str(directory))
        return wheel, sdist

    def test_wheel_and_sdist_are_byte_reproducible(self) -> None:
        with tempfile.TemporaryDirectory() as first, tempfile.TemporaryDirectory() as second:
            first_wheel, first_sdist = self._build(Path(first))
            second_wheel, second_sdist = self._build(Path(second))
            self.assertEqual(first_wheel.read_bytes(), second_wheel.read_bytes())
            self.assertEqual(first_sdist.read_bytes(), second_sdist.read_bytes())

    def test_wheel_metadata_contents_and_record_hashes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            wheel, _ = self._build(Path(directory))
            with zipfile.ZipFile(wheel) as archive:
                names = set(archive.namelist())
                prefix = "open_gov_ai_tools-0.2.0.dist-info/"
                self.assertIn("open_gov_ai_tools/__init__.py", names)
                self.assertIn("open_gov_ai_tools/redaction.py", names)
                metadata = archive.read(prefix + "METADATA").decode("utf-8")
                self.assertIn("Name: open-gov-ai-tools", metadata)
                self.assertIn("Version: 0.2.0", metadata)
                self.assertIn("Requires-Python: >=3.11", metadata)
                self.assertNotIn("Requires-Dist:", metadata)
                record = archive.read(prefix + "RECORD").decode("utf-8")
                for name, digest, size in csv.reader(io.StringIO(record)):
                    if not digest:
                        continue
                    payload = archive.read(name)
                    expected = base64.urlsafe_b64encode(
                        hashlib.sha256(payload).digest()
                    ).rstrip(b"=").decode("ascii")
                    self.assertEqual(digest, f"sha256={expected}")
                    self.assertEqual(int(size), len(payload))
                self.assertFalse(any(name.endswith("evidence.json") for name in names))

    def test_sdist_contains_sources_tests_and_no_generated_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            _, sdist = self._build(Path(directory))
            with tarfile.open(sdist, "r:gz") as archive:
                names = set(archive.getnames())
            prefix = "open_gov_ai_tools-0.2.0/"
            self.assertIn(prefix + "pyproject.toml", names)
            self.assertIn(prefix + "build_backend.py", names)
            self.assertIn(prefix + "verify.py", names)
            self.assertIn(prefix + "tests/test_dispatcher_loopback.py", names)
            self.assertIn(prefix + "src/open_gov_ai_tools/catalog.py", names)
            self.assertFalse(any(name.endswith("evidence.json") for name in names))

    def test_unpacked_wheel_imports_and_cli_exports_twelve_tools(self) -> None:
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
                [sys.executable, "-I", "-c", (
                    "import json,sys;"
                    f"sys.path.insert(0,{str(target)!r});"
                    "import open_gov_ai_tools as p;"
                    "print(json.dumps({'version':p.__version__,'tools':len(p.export_anthropic_tools())}))"
                )],
                cwd=target,
                env=environment,
                capture_output=True,
                text=True,
                timeout=20,
                check=False,
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertEqual(json.loads(completed.stdout), {"version": "0.2.0", "tools": 12})


if __name__ == "__main__":
    unittest.main()
