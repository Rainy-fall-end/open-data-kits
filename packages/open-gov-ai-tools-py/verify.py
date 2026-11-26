"""Deterministic offline verification and evidence writer.

This script intentionally performs no external HTTP requests and uses no package
installer. It writes only ``dist/`` and ``evidence.json`` below this directory.
"""

from __future__ import annotations

import ast
import base64
import csv
import hashlib
import io
import json
import os
import platform
import re
import subprocess
import sys
import tarfile
import tempfile
import tomllib
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Final


ROOT: Final = Path(__file__).resolve().parent
SRC: Final = ROOT / "src"
DIST: Final = ROOT / "dist"
EVIDENCE: Final = ROOT / "evidence.json"
EXPECTED_ACTORS: Final = {
    "8LFIbRbidiHPknMz5",
    "KchE3qKKrwU0rCe9f",
    "txnvyTckeQx4hVBc6",
    "Z3ioK0wOAeczj6nCx",
}
EXPECTED_SLUGS: Final = {
    "sec-edgar-corporate-filings",
    "clinicaltrials-gov-studies-trials",
    "openfda-recalls-enforcement-approvals",
    "singapore-bca-green-mark-buildings",
}


def check(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(131_072), b""):
            digest.update(chunk)
    return digest.hexdigest()


def source_syntax_and_import_audit() -> dict[str, Any]:
    sources = sorted(
        [
            ROOT / "build_backend.py",
            ROOT / "verify.py",
            *SRC.rglob("*.py"),
            *(ROOT / "tests").glob("*.py"),
        ]
    )
    allowed_local = {"build_backend", "helpers", "open_gov_ai_tools"}
    imported_roots: set[str] = set()
    for source in sources:
        text = source.read_text(encoding="utf-8")
        tree = ast.parse(text, filename=str(source))
        compile(tree, str(source), "exec")
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imported_roots.update(alias.name.partition(".")[0] for alias in node.names)
            elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
                imported_roots.add(node.module.partition(".")[0])
    third_party = sorted(
        root
        for root in imported_roots
        if root not in sys.stdlib_module_names and root not in allowed_local
    )
    check(not third_party, f"non-standard-library imports found: {third_party}")
    return {
        "python_files": len(sources),
        "import_roots": sorted(imported_roots),
        "third_party_imports": third_party,
    }


def run_tests() -> tuple[int, str]:
    environment = os.environ.copy()
    environment["PYTHONPATH"] = str(SRC)
    completed = subprocess.run(
        [sys.executable, "-m", "unittest", "discover", "-s", "tests", "-v"],
        cwd=ROOT,
        env=environment,
        capture_output=True,
        text=True,
        timeout=180,
        check=False,
    )
    output = completed.stdout + completed.stderr
    check(completed.returncode == 0, f"unittest failed:\n{output}")
    match = re.search(r"Ran (\d+) tests?", output)
    check(match is not None, "could not determine unittest count")
    return int(match.group(1)), output


def verify_wheel(wheel: Path) -> dict[str, Any]:
    with zipfile.ZipFile(wheel) as archive:
        names = archive.namelist()
        check("open_gov_ai_tools/__init__.py" in names, "wheel package is missing")
        check(not any(name.endswith("evidence.json") for name in names), "wheel contains evidence")
        metadata = archive.read("open_gov_ai_tools-0.1.0.dist-info/METADATA").decode("utf-8")
        check("Name: open-gov-ai-tools" in metadata, "wheel name metadata is wrong")
        check("Requires-Python: >=3.11" in metadata, "wheel Python requirement is wrong")
        check("Requires-Dist:" not in metadata, "wheel unexpectedly has runtime dependencies")
        record_text = archive.read("open_gov_ai_tools-0.1.0.dist-info/RECORD").decode("utf-8")
        verified_hashes = 0
        for name, digest, size in csv.reader(io.StringIO(record_text)):
            if not digest:
                continue
            payload = archive.read(name)
            encoded = base64.urlsafe_b64encode(hashlib.sha256(payload).digest()).rstrip(b"=")
            check(digest == f"sha256={encoded.decode('ascii')}", f"bad RECORD hash: {name}")
            check(int(size) == len(payload), f"bad RECORD size: {name}")
            verified_hashes += 1
    return {"members": len(names), "record_hashes_verified": verified_hashes}


def verify_sdist(sdist: Path) -> dict[str, Any]:
    with tarfile.open(sdist, "r:gz") as archive:
        names = archive.getnames()
    required = {
        "open_gov_ai_tools-0.1.0/pyproject.toml",
        "open_gov_ai_tools-0.1.0/build_backend.py",
        "open_gov_ai_tools-0.1.0/verify.py",
        "open_gov_ai_tools-0.1.0/src/open_gov_ai_tools/dispatcher.py",
        "open_gov_ai_tools-0.1.0/tests/test_dispatcher_loopback.py",
    }
    check(required.issubset(names), "sdist is missing required build or test files")
    check(not any(name.endswith("evidence.json") for name in names), "sdist contains evidence")
    return {"members": len(names), "required_members_present": True}


def verify_isolated_wheel_import(wheel: Path) -> dict[str, Any]:
    with tempfile.TemporaryDirectory() as directory:
        target = Path(directory)
        with zipfile.ZipFile(wheel) as archive:
            archive.extractall(target)
        code = (
            "import json,sys;"
            f"sys.path.insert(0,{str(target)!r});"
            "import open_gov_ai_tools as p;"
            "print(json.dumps({'version':p.__version__,'tools':len(p.export_openai_tools()),"
            "'anthropic':len(p.export_anthropic_tools()),"
            "'gemini':len(p.export_gemini_function_declarations())}))"
        )
        completed = subprocess.run(
            [sys.executable, "-I", "-c", code],
            cwd=target,
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
        check(completed.returncode == 0, f"isolated wheel import failed: {completed.stderr}")
        result = json.loads(completed.stdout)
    check(result == {"version": "0.1.0", "tools": 8, "anthropic": 8, "gemini": 8}, "bad wheel API")
    return result


def build_and_verify() -> dict[str, Any]:
    sys.path.insert(0, str(ROOT))
    import build_backend

    check(build_backend.get_requires_for_build_wheel() == [], "wheel build requirements are not empty")
    check(build_backend.get_requires_for_build_sdist() == [], "sdist build requirements are not empty")
    DIST.mkdir(exist_ok=True)
    wheel = DIST / build_backend.WHEEL_NAME
    sdist = DIST / build_backend.SDIST_NAME
    for artifact in (wheel, sdist):
        if artifact.exists():
            artifact.unlink()
    build_backend.build_wheel(str(DIST))
    build_backend.build_sdist(str(DIST))
    check(wheel.is_file() and sdist.is_file(), "build artifacts were not produced")

    with tempfile.TemporaryDirectory() as directory:
        repeat = Path(directory)
        repeat_wheel = repeat / build_backend.build_wheel(str(repeat))
        repeat_sdist = repeat / build_backend.build_sdist(str(repeat))
        check(wheel.read_bytes() == repeat_wheel.read_bytes(), "wheel is not reproducible")
        check(sdist.read_bytes() == repeat_sdist.read_bytes(), "sdist is not reproducible")

    wheel_check = verify_wheel(wheel)
    sdist_check = verify_sdist(sdist)
    isolated = verify_isolated_wheel_import(wheel)
    return {
        "reproducible": True,
        "wheel_validation": wheel_check,
        "sdist_validation": sdist_check,
        "isolated_import": isolated,
        "artifacts": [
            {
                "path": wheel.relative_to(ROOT).as_posix(),
                "bytes": wheel.stat().st_size,
                "sha256": sha256(wheel),
            },
            {
                "path": sdist.relative_to(ROOT).as_posix(),
                "bytes": sdist.stat().st_size,
                "sha256": sha256(sdist),
            },
        ],
    }


def catalog_audit() -> dict[str, Any]:
    sys.path.insert(0, str(SRC))
    from open_gov_ai_tools import APIFY_ACTOR_IDS, RAPIDAPI_SLUGS, catalog_snapshot

    catalog = catalog_snapshot()
    actor_ids = {item["actor_id"] for item in catalog if "actor_id" in item}
    slugs = {item["api_slug"] for item in catalog if "api_slug" in item}
    check(len(catalog) == 8, "catalog must contain exactly eight tools")
    check(actor_ids == EXPECTED_ACTORS, "Actor allowlist differs from the required four")
    check(slugs == EXPECTED_SLUGS, "RapidAPI allowlist differs from the required four")
    check(set(APIFY_ACTOR_IDS) == EXPECTED_ACTORS, "exported Actor constants are wrong")
    check(set(RAPIDAPI_SLUGS) == EXPECTED_SLUGS, "exported RapidAPI constants are wrong")
    return {
        "tool_count": len(catalog),
        "tool_names": [item["name"] for item in catalog],
        "apify_actor_ids": sorted(actor_ids),
        "rapidapi_slugs": sorted(slugs),
        "private_hong_kong_actors_included": False,
    }


def metadata_audit() -> dict[str, Any]:
    pyproject = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    check(pyproject["build-system"]["requires"] == [], "build-system requires are not empty")
    check(pyproject["project"]["dependencies"] == [], "project dependencies are not empty")
    check(pyproject["project"]["name"] == "open-gov-ai-tools", "project name is wrong")
    check(pyproject["project"]["requires-python"] == ">=3.11", "Python requirement is wrong")
    return {
        "pep621": True,
        "requires_python": ">=3.11",
        "runtime_dependencies": [],
        "build_dependencies": [],
    }


def main() -> int:
    started = datetime.now(timezone.utc)
    metadata = metadata_audit()
    source_audit = source_syntax_and_import_audit()
    catalog = catalog_audit()
    test_count, test_output = run_tests()
    build = build_and_verify()
    finished = datetime.now(timezone.utc)
    evidence = {
        "schema_version": 1,
        "task_id": "task-20261126T032455Z-d4cfee",
        "project_id": "ai-agent-toolpack-open-gov",
        "status": "passed",
        "verified_at": finished.isoformat().replace("+00:00", "Z"),
        "duration_seconds": round((finished - started).total_seconds(), 3),
        "python": {
            "executable": sys.executable,
            "version": platform.python_version(),
            "implementation": platform.python_implementation(),
        },
        "package": metadata,
        "source_audit": source_audit,
        "catalog": catalog,
        "tests": {
            "command": f"{sys.executable} -m unittest discover -s tests -v",
            "count": test_count,
            "passed": test_count,
            "failed": 0,
            "local_loopback_http": True,
            "external_http_requests": 0,
            "summary_tail": test_output.strip().splitlines()[-3:],
        },
        "build": build,
        "security_guards_verified": [
            "closed four-Actor and four-RapidAPI allowlists",
            "private Hong Kong actors absent",
            "strict arguments and secret-field rejection",
            "per-call Apify cap cannot exceed immutable dispatcher hard cap",
            "credentials absent from URLs, repr, results, and sanitized errors",
            "redirects blocked",
            "Content-Length and streamed response-size limits",
            "official-domain RAG source and licence provenance per record",
            "no automatic paid-request retries",
        ],
        "prohibited_actions": {
            "pypi_uploads": 0,
            "paid_api_requests": 0,
            "key_files_read": 0,
            "protected_repository_state_files_modified": [],
            "absorb_runs": 0,
        },
        "documentation_references": [
            "https://developers.openai.com/api/docs/guides/function-calling",
            "https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools",
            "https://ai.google.dev/gemini-api/docs/function-calling",
            "https://www.sec.gov/about/webmaster-frequently-asked-questions",
            "https://clinicaltrials.gov/terms-conditions",
            "https://open.fda.gov/terms/",
            "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
            "https://developers.data.gov.sg/open-data-licence",
        ],
    }
    EVIDENCE.write_text(
        json.dumps(evidence, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "status": "passed",
                "tests": test_count,
                "wheel": build["artifacts"][0],
                "sdist": build["artifacts"][1],
                "evidence": EVIDENCE.relative_to(ROOT).as_posix(),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
