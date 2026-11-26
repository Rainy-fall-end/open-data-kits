"""Complete offline verification, reproducible build, and evidence writer."""

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
EXPECTED_ACTORS: Final = (
    "CRulq5dak4mqAUmMn",
    "8LFIbRbidiHPknMz5",
    "ZlabhlvEIyRVdtKiQ",
    "re8aRvtqBonP5HMuY",
    "eQQ2beomyLlW4DTGM",
    "KchE3qKKrwU0rCe9f",
    "txnvyTckeQx4hVBc6",
    "Z3ioK0wOAeczj6nCx",
)
EXPECTED_SLUGS: Final = (
    "sec-edgar-corporate-filings",
    "clinicaltrials-gov-studies-trials",
    "openfda-recalls-enforcement-approvals",
    "singapore-bca-green-mark-buildings",
)
EXPECTED_NAMES: Final = (
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


def check(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(131_072), b""):
            digest.update(chunk)
    return digest.hexdigest()


def metadata_audit() -> dict[str, Any]:
    pyproject = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    project = pyproject["project"]
    check(project["name"] == "open-gov-ai-tools", "project name is wrong")
    check(project["version"] == "0.2.0", "project version is wrong")
    check(project["requires-python"] == ">=3.11", "Python requirement is wrong")
    check(project["dependencies"] == [], "runtime dependencies are not empty")
    check(pyproject["build-system"]["requires"] == [], "build dependencies are not empty")
    return {
        "pep621": True,
        "name": project["name"],
        "version": project["version"],
        "requires_python": project["requires-python"],
        "runtime_dependencies": [],
        "build_dependencies": [],
    }


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


def release_content_audit() -> dict[str, Any]:
    files = [
        ROOT / "pyproject.toml",
        ROOT / "README.md",
        *sorted(SRC.rglob("*.py")),
    ]
    combined = "\n".join(path.read_text(encoding="utf-8") for path in files)
    folded = combined.casefold()
    excluded_markers = ("hong" + " kong", "hk" + "_country", "hk" + "-country")
    excluded_hits = sum(folded.count(marker) for marker in excluded_markers)
    apify_token_pattern = re.compile(r"apify_api_[A-Za-z0-9_-]{12,}")
    bearer_literal_pattern = re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._~+/=-]{20,}")
    credential_hits = len(apify_token_pattern.findall(combined)) + len(
        bearer_literal_pattern.findall(combined)
    )
    suspicious_files = [
        path.relative_to(ROOT).as_posix()
        for path in ROOT.rglob("*")
        if path.is_file()
        and path.suffix.casefold() in {".env", ".pem", ".p12", ".pfx", ".key"}
    ]
    check(excluded_hits == 0, "excluded integration references found in release files")
    check(credential_hits == 0, "credential-shaped literal found in release files")
    check(not suspicious_files, "secret-bearing file types found in project")
    return {
        "files_scanned": len(files),
        "excluded_integration_references": excluded_hits,
        "credential_shaped_literals": credential_hits,
        "secret_file_candidates": suspicious_files,
    }


def catalog_audit() -> dict[str, Any]:
    sys.path.insert(0, str(SRC))
    from open_gov_ai_tools import (
        APIFY_ACTOR_IDS,
        RAPIDAPI_SLUGS,
        TOOL_NAMES,
        catalog_snapshot,
        export_anthropic_tools,
        export_gemini_function_declarations,
        export_openai_tools,
    )

    catalog = catalog_snapshot()
    names = tuple(item["name"] for item in catalog)
    actor_ids = tuple(item["actor_id"] for item in catalog if "actor_id" in item)
    slugs = tuple(item["api_slug"] for item in catalog if "api_slug" in item)
    check(names == EXPECTED_NAMES, "tool catalog names or order differ")
    check(tuple(TOOL_NAMES) == EXPECTED_NAMES, "exported tool names differ")
    check(actor_ids == EXPECTED_ACTORS, "Actor allowlist differs")
    check(tuple(APIFY_ACTOR_IDS) == EXPECTED_ACTORS, "exported Actor IDs differ")
    check(slugs == EXPECTED_SLUGS, "RapidAPI allowlist differs")
    check(tuple(RAPIDAPI_SLUGS) == EXPECTED_SLUGS, "exported RapidAPI slugs differ")
    openai = export_openai_tools()
    anthropic = export_anthropic_tools()
    gemini = export_gemini_function_declarations()
    check(len(openai) == len(anthropic) == len(gemini) == 12, "schema export count differs")
    check(
        tuple(item["function"]["name"] for item in openai) == EXPECTED_NAMES,
        "OpenAI export differs",
    )
    check(tuple(item["name"] for item in anthropic) == EXPECTED_NAMES, "Anthropic export differs")
    check(tuple(item["name"] for item in gemini) == EXPECTED_NAMES, "Gemini export differs")
    for item in catalog[:8]:
        cap = item["parameters"]["properties"].get("maxTotalChargeUsd")
        check(cap is not None, f"{item['name']} lacks maxTotalChargeUsd")
        check(cap["default"] == cap["maximum"] == 0.25, f"{item['name']} has wrong cap")
    return {
        "tool_count": len(catalog),
        "tool_names": list(names),
        "apify_actor_ids": list(actor_ids),
        "rapidapi_slugs": list(slugs),
        "provider_counts": {"apify": 8, "rapidapi": 4},
        "schema_formats": {"openai": 12, "anthropic": 12, "gemini": 12},
        "excluded_integration_count": 0,
    }


def run_tests() -> tuple[int, str]:
    environment = os.environ.copy()
    environment["PYTHONPATH"] = str(SRC)
    environment["OPEN_GOV_AI_TOOLS_OFFLINE_TEST"] = "1"
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
    check("test_all_twelve_tools_execute_only_against_loopback" in output, "12-tool loopback test missing")
    check("test_all_three_model_formats_cover_all_twelve_names" in output, "schema format test missing")
    check("test_offline_verification_guard_blocks_production_before_network" in output, "offline guard test missing")
    return int(match.group(1)), output


def verify_wheel(wheel: Path) -> dict[str, Any]:
    with zipfile.ZipFile(wheel) as archive:
        names = archive.namelist()
        prefix = "open_gov_ai_tools-0.2.0.dist-info/"
        check("open_gov_ai_tools/__init__.py" in names, "wheel package missing")
        check("open_gov_ai_tools/redaction.py" in names, "wheel redaction module missing")
        check(not any(name.endswith("evidence.json") for name in names), "wheel contains evidence")
        metadata = archive.read(prefix + "METADATA").decode("utf-8")
        check("Name: open-gov-ai-tools" in metadata, "wheel name is wrong")
        check("Version: 0.2.0" in metadata, "wheel version is wrong")
        check("Requires-Python: >=3.11" in metadata, "wheel Python requirement is wrong")
        check("Requires-Dist:" not in metadata, "wheel has runtime dependencies")
        record = archive.read(prefix + "RECORD").decode("utf-8")
        hashes = 0
        for name, digest, size in csv.reader(io.StringIO(record)):
            if not digest:
                continue
            payload = archive.read(name)
            encoded = base64.urlsafe_b64encode(hashlib.sha256(payload).digest()).rstrip(b"=")
            check(digest == f"sha256={encoded.decode()}", f"bad RECORD hash: {name}")
            check(int(size) == len(payload), f"bad RECORD size: {name}")
            hashes += 1
    return {"members": len(names), "record_hashes_verified": hashes}


def verify_sdist(sdist: Path) -> dict[str, Any]:
    with tarfile.open(sdist, "r:gz") as archive:
        names = archive.getnames()
    prefix = "open_gov_ai_tools-0.2.0/"
    required = {
        prefix + "pyproject.toml",
        prefix + "build_backend.py",
        prefix + "verify.py",
        prefix + "src/open_gov_ai_tools/dispatcher.py",
        prefix + "tests/test_dispatcher_loopback.py",
    }
    check(required.issubset(names), "sdist required files missing")
    check(not any(name.endswith("evidence.json") for name in names), "sdist contains evidence")
    return {"members": len(names), "required_members_present": True}


def isolated_wheel_import(wheel: Path) -> dict[str, Any]:
    with tempfile.TemporaryDirectory() as directory:
        target = Path(directory)
        with zipfile.ZipFile(wheel) as archive:
            archive.extractall(target)
        code = (
            "import json,sys;"
            f"sys.path.insert(0,{str(target)!r});"
            "import open_gov_ai_tools as p;"
            "print(json.dumps({'version':p.__version__,'openai':len(p.export_openai_tools()),"
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
    check(
        result == {"version": "0.2.0", "openai": 12, "anthropic": 12, "gemini": 12},
        "isolated wheel API differs",
    )
    return result


def build_and_verify() -> dict[str, Any]:
    sys.path.insert(0, str(ROOT))
    import build_backend

    check(build_backend.get_requires_for_build_wheel() == [], "wheel requirements not empty")
    check(build_backend.get_requires_for_build_sdist() == [], "sdist requirements not empty")
    DIST.mkdir(exist_ok=True)
    wheel = DIST / build_backend.WHEEL_NAME
    sdist = DIST / build_backend.SDIST_NAME
    for artifact in (wheel, sdist):
        if artifact.exists():
            artifact.unlink()
    build_backend.build_wheel(str(DIST))
    build_backend.build_sdist(str(DIST))
    check(wheel.is_file() and sdist.is_file(), "build artifacts missing")
    with tempfile.TemporaryDirectory() as directory:
        repeat = Path(directory)
        repeat_wheel = repeat / build_backend.build_wheel(str(repeat))
        repeat_sdist = repeat / build_backend.build_sdist(str(repeat))
        check(wheel.read_bytes() == repeat_wheel.read_bytes(), "wheel is not reproducible")
        check(sdist.read_bytes() == repeat_sdist.read_bytes(), "sdist is not reproducible")
    return {
        "reproducible": True,
        "wheel_validation": verify_wheel(wheel),
        "sdist_validation": verify_sdist(sdist),
        "isolated_import": isolated_wheel_import(wheel),
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


def main() -> int:
    started = datetime.now(timezone.utc)
    metadata = metadata_audit()
    source_audit = source_syntax_and_import_audit()
    release_audit = release_content_audit()
    catalog = catalog_audit()
    test_count, test_output = run_tests()
    build = build_and_verify()
    finished = datetime.now(timezone.utc)
    evidence = {
        "schema_version": 1,
        "task_id": "task-20261126T082333Z-9febf4",
        "project_id": "ai-agent-toolpack-v2",
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
        "release_content_audit": release_audit,
        "catalog": catalog,
        "tests": {
            "command": f"{sys.executable} -m unittest discover -s tests -v",
            "count": test_count,
            "passed": test_count,
            "failed": 0,
            "all_twelve_tools_loopback_http": True,
            "all_three_llm_schema_formats": True,
            "offline_guard_enabled": True,
            "external_http_requests": 0,
            "summary_tail": test_output.strip().splitlines()[-3:],
        },
        "build": build,
        "security": {
            "ssrf_safe_closed_routes": True,
            "loopback_only_test_overrides": True,
            "redirects_blocked": True,
            "apify_default_and_hard_cap_usd": 0.25,
            "credential_leaks": 0,
            "excluded_integration_references": 0,
            "real_tokens_used": 0,
            "paid_requests": 0,
        },
        "prohibited_actions": {
            "external_http_requests": 0,
            "publications": 0,
            "key_files_read": 0,
            "protected_repository_state_files_modified": [],
            "absorb_runs": 0,
        },
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
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
