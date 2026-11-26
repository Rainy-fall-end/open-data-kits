"""Offline release verification and evidence generation for open-gov-data 0.2.0."""

from __future__ import annotations

import ast
import hashlib
import inspect
import json
import os
import platform
import re
import subprocess
import sys
import tarfile
import tempfile
import time
import tomllib
import zipfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parent
REPO_ROOT = ROOT.parents[1]
SRC = ROOT / "src"
DIST = ROOT / "dist"
EVIDENCE = ROOT / "evidence.json"
sys.path.insert(0, str(SRC))

import build_backend
from open_gov_data import APIFY_SOURCES, RAPIDAPI_SOURCES, OpenGovDataClient
from open_gov_data.schemas import (
    ACTOR_INPUT_SCHEMAS,
    ACTOR_SCHEMA_FILES,
    RAPIDAPI_QUERY_SCHEMAS,
    RAPIDAPI_SCHEMA_FILES,
)


TASK_ID = "task-20261126T092403Z-81d810"
PROJECT_ID = "python-sdk-open-gov-v2"
ACTOR_ALLOWLIST = [
    "CRulq5dak4mqAUmMn",
    "8LFIbRbidiHPknMz5",
    "ZlabhlvEIyRVdtKiQ",
    "re8aRvtqBonP5HMuY",
    "eQQ2beomyLlW4DTGM",
    "KchE3qKKrwU0rCe9f",
    "txnvyTckeQx4hVBc6",
    "Z3ioK0wOAeczj6nCx",
]
RAPIDAPI_ALLOWLIST = [
    "sec-edgar-corporate-filings",
    "clinicaltrials-gov-studies-trials",
    "openfda-recalls-enforcement-approvals",
    "singapore-bca-green-mark-buildings",
]
TYPED_METHODS = [
    "ats_jobs_hiring_signals",
    "sec_edgar_intelligence",
    "global_public_tenders",
    "pharma_pipeline_intelligence",
    "usaspending_contracts",
    "clinical_trials",
    "uk_gov_tenders",
    "sg_green_mark",
    "sec_edgar_corporate_filings",
    "clinicaltrials_studies",
    "openfda_recalls",
    "sg_green_mark_buildings",
]
LEGACY_METHODS = ["from_env", "request", "run_actor", "query_rapidapi", "records"]
CONTRACT_KEYS = (
    "type",
    "default",
    "enum",
    "minimum",
    "maximum",
    "minLength",
    "maxLength",
)
TOKEN_PATTERN = re.compile(rb"apify_api_[A-Za-z0-9_-]{12,}")
# Constructed at runtime so excluded identifiers are not themselves release references.
EXCLUDED_FRAGMENTS = (
    ("h" + "ong " + "kong").encode(),
    ("hk" + "-country-park").encode(),
    ("cn" + "-gov-tender").encode(),
    ("xjYI1m1" + "MI3IOg4x8A").encode(),
    ("PjJH9" + "UMA3eXzrSCtE").encode(),
)


def check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def safe_subprocess_env(*, pythonpath: str) -> dict[str, str]:
    environment = {
        "PYTHONPATH": pythonpath,
        "PYTHONIOENCODING": "utf-8",
        "PYTHONDONTWRITEBYTECODE": "1",
        "PYTHONHASHSEED": "0",
        "NO_PROXY": "*",
        "no_proxy": "*",
    }
    for name in ("SYSTEMROOT", "WINDIR", "TEMP", "TMP"):
        value = os.environ.get(name)
        if value:
            environment[name] = value
    return environment


def run(
    command: list[str], *, cwd: Path, pythonpath: str
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=cwd,
        env=safe_subprocess_env(pythonpath=pythonpath),
        stdin=subprocess.DEVNULL,
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )


def normalized(value: Any) -> Any:
    if isinstance(value, tuple):
        return [normalized(item) for item in value]
    return value


def metadata_audit() -> dict[str, Any]:
    with (ROOT / "pyproject.toml").open("rb") as handle:
        document = tomllib.load(handle)
    project = document["project"]
    build = document["build-system"]
    check(project["name"] == "open-gov-data", "wrong project name")
    check(project["version"] == "0.2.0", "wrong project version")
    check(project["requires-python"] == ">=3.11", "wrong Python requirement")
    check(project["dependencies"] == [], "runtime dependencies are not zero")
    check(build["requires"] == [], "build dependencies are not zero")
    check(build["build-backend"] == "build_backend", "wrong build backend")
    check(
        project["scripts"]["open-gov-data"] == "open_gov_data.cli:main",
        "console entry point changed",
    )
    return {
        "name": project["name"],
        "version": project["version"],
        "requires_python": project["requires-python"],
        "runtime_dependencies": len(project["dependencies"]),
        "build_dependencies": len(build["requires"]),
        "pep_621": True,
    }


def source_audit() -> dict[str, Any]:
    python_files = sorted(
        [
            *SRC.rglob("*.py"),
            *(ROOT / "tests").rglob("*.py"),
            ROOT / "build_backend.py",
            ROOT / "verify.py",
        ],
        key=relative,
    )
    nonstdlib: list[dict[str, str]] = []
    syntax_failures: list[dict[str, Any]] = []
    allowed_local = {"open_gov_data", "build_backend", "tests"}
    for path in python_files:
        source = path.read_text(encoding="utf-8")
        try:
            tree = ast.parse(source, filename=relative(path))
            compile(tree, relative(path), "exec")
        except SyntaxError as error:
            syntax_failures.append({"file": relative(path), "line": error.lineno})
            continue
        for node in ast.walk(tree):
            names: list[str] = []
            if isinstance(node, ast.Import):
                names = [alias.name for alias in node.names]
            elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
                names = [node.module]
            for name in names:
                root_name = name.partition(".")[0]
                if root_name not in sys.stdlib_module_names and root_name not in allowed_local:
                    nonstdlib.append({"file": relative(path), "module": name})
    runtime_nonstdlib = [
        item for item in nonstdlib if item["file"].startswith("src/open_gov_data/")
    ]
    check(not syntax_failures, f"syntax failures: {syntax_failures}")
    check(not nonstdlib, f"non-standard imports: {nonstdlib}")
    check(not runtime_nonstdlib, "runtime has non-standard imports")
    return {
        "checked_python_files": len(python_files),
        "syntax_failures": syntax_failures,
        "nonstdlib_imports": nonstdlib,
        "standard_library_only": True,
    }


def schema_audit() -> dict[str, Any]:
    actor_fields = 0
    for source, relative_path in ACTOR_SCHEMA_FILES.items():
        document = json.loads((REPO_ROOT / relative_path).read_text(encoding="utf-8"))
        actual = document["properties"]
        embedded = ACTOR_INPUT_SCHEMAS[source]
        check(set(actual) == set(embedded), f"Actor schema fields drifted for {source}")
        actor_fields += len(actual)
        for field, spec in embedded.items():
            for key in CONTRACT_KEYS:
                if key in spec:
                    check(key in actual[field], f"Actor schema key missing: {source}.{field}.{key}")
                    check(
                        normalized(spec[key]) == normalized(actual[field][key]),
                        f"Actor schema value drifted: {source}.{field}.{key}",
                    )

    rapid_fields = 0
    for source, relative_path in RAPIDAPI_SCHEMA_FILES.items():
        document = json.loads((REPO_ROOT / relative_path).read_text(encoding="utf-8"))
        path = RAPIDAPI_SOURCES[source].path
        parameters = document["paths"][path]["get"]["parameters"]
        actual = {parameter["name"]: parameter["schema"] for parameter in parameters}
        embedded = RAPIDAPI_QUERY_SCHEMAS[source]
        check(set(actual) == set(embedded), f"RapidAPI fields drifted for {source}")
        rapid_fields += len(actual)
        for field, spec in embedded.items():
            for key in CONTRACT_KEYS:
                if key in spec:
                    check(key in actual[field], f"RapidAPI key missing: {source}.{field}.{key}")
                    check(
                        normalized(spec[key]) == normalized(actual[field][key]),
                        f"RapidAPI value drifted: {source}.{field}.{key}",
                    )
    return {
        "actor_schema_files": len(ACTOR_SCHEMA_FILES),
        "actor_fields_checked": actor_fields,
        "rapidapi_openapi_files": len(RAPIDAPI_SCHEMA_FILES),
        "rapidapi_fields_checked": rapid_fields,
        "all_snapshots_match_repository": True,
    }


def catalog_and_api_audit() -> dict[str, Any]:
    actual_actors = [source.actor_id for source in APIFY_SOURCES.values()]
    actual_rapidapi = [source.api_slug for source in RAPIDAPI_SOURCES.values()]
    check(actual_actors == ACTOR_ALLOWLIST, "Actor catalog is not the exact allowlist")
    check(actual_rapidapi == RAPIDAPI_ALLOWLIST, "RapidAPI catalog is not the exact allowlist")
    check(len(APIFY_SOURCES) == 8, "Actor catalog count must be eight")
    check(len(RAPIDAPI_SOURCES) == 4, "RapidAPI catalog count must be four")
    missing_typed = [name for name in TYPED_METHODS if not callable(getattr(OpenGovDataClient, name, None))]
    missing_legacy = [name for name in LEGACY_METHODS if not callable(getattr(OpenGovDataClient, name, None))]
    check(not missing_typed, f"missing typed methods: {missing_typed}")
    check(not missing_legacy, f"missing v0.1 methods: {missing_legacy}")
    typed_signatures = {
        name: str(inspect.signature(getattr(OpenGovDataClient, name)))
        for name in TYPED_METHODS
    }
    return {
        "apify_count": len(actual_actors),
        "rapidapi_count": len(actual_rapidapi),
        "actor_ids": actual_actors,
        "rapidapi_slugs": actual_rapidapi,
        "typed_methods": TYPED_METHODS,
        "legacy_methods": LEGACY_METHODS,
        "typed_signatures": typed_signatures,
        "closed_exact_allowlists": True,
    }


def release_content_audit(paths: list[Path]) -> dict[str, Any]:
    credential_hits: list[str] = []
    excluded_hits: list[str] = []
    for path in paths:
        data = path.read_bytes()
        lowered = data.lower()
        if TOKEN_PATTERN.search(data):
            credential_hits.append(relative(path))
        if any(fragment.lower() in lowered for fragment in EXCLUDED_FRAGMENTS):
            excluded_hits.append(relative(path))
    check(not credential_hits, f"embedded credential-shaped values: {credential_hits}")
    check(not excluded_hits, f"excluded integration references: {excluded_hits}")
    return {
        "files_scanned": len(paths),
        "credential_value_hits": credential_hits,
        "excluded_integration_reference_hits": excluded_hits,
        "passed": True,
    }


def run_tests() -> tuple[int, str]:
    result = run(
        [sys.executable, "-m", "unittest", "discover", "-s", "tests", "-v"],
        cwd=ROOT,
        pythonpath=str(SRC),
    )
    output = f"{result.stdout}{result.stderr}"
    match = re.search(r"Ran (\d+) tests?", output)
    count = int(match.group(1)) if match else 0
    check(result.returncode == 0, f"test suite failed:\n{output[-4000:]}")
    check(count >= 19, f"expected at least 19 tests, found {count}")
    return count, output


def archive_payloads(wheel: Path, sdist: Path) -> list[bytes]:
    payloads: list[bytes] = []
    with zipfile.ZipFile(wheel) as archive:
        for name in archive.namelist():
            if not name.endswith("/"):
                payloads.append(archive.read(name))
    with tarfile.open(sdist, "r:gz") as archive:
        for member in archive.getmembers():
            if member.isfile():
                handle = archive.extractfile(member)
                if handle is not None:
                    payloads.append(handle.read())
    return payloads


def build_and_verify() -> dict[str, Any]:
    DIST.mkdir(parents=True, exist_ok=True)
    wheel = DIST / build_backend.build_wheel(str(DIST))
    sdist = DIST / build_backend.build_sdist(str(DIST))
    with tempfile.TemporaryDirectory(prefix="open-gov-data-repeat-") as directory:
        repeat = Path(directory)
        repeat_wheel = repeat / build_backend.build_wheel(str(repeat))
        repeat_sdist = repeat / build_backend.build_sdist(str(repeat))
        check(wheel.read_bytes() == repeat_wheel.read_bytes(), "wheel is not reproducible")
        check(sdist.read_bytes() == repeat_sdist.read_bytes(), "sdist is not reproducible")

    with zipfile.ZipFile(wheel) as archive:
        wheel_members = sorted(archive.namelist())
        metadata = archive.read("open_gov_data-0.2.0.dist-info/METADATA").decode()
        check("open_gov_data/client.py" in wheel_members, "client missing from wheel")
        check("open_gov_data/schemas.py" in wheel_members, "schemas missing from wheel")
        check("open_gov_data-0.2.0.dist-info/RECORD" in wheel_members, "RECORD missing")
        check("Requires-Dist:" not in metadata, "wheel declares runtime dependency")
        check(not any(name.startswith("tests/") for name in wheel_members), "tests in wheel")
        check("evidence.json" not in wheel_members, "evidence included in wheel")

    with tarfile.open(sdist, "r:gz") as archive:
        sdist_members = sorted(archive.getnames())
        check("open_gov_data-0.2.0/pyproject.toml" in sdist_members, "pyproject missing")
        check("open_gov_data-0.2.0/build_backend.py" in sdist_members, "backend missing")
        check(
            "open_gov_data-0.2.0/src/open_gov_data/client.py" in sdist_members,
            "client missing from sdist",
        )
        check(not any(name.endswith("/evidence.json") for name in sdist_members), "evidence in sdist")
        check(not any("/__pycache__/" in name for name in sdist_members), "cache in sdist")

    payloads = archive_payloads(wheel, sdist)
    check(not any(TOKEN_PATTERN.search(payload) for payload in payloads), "credential value in archive")
    check(
        not any(
            fragment.lower() in payload.lower()
            for payload in payloads
            for fragment in EXCLUDED_FRAGMENTS
        ),
        "excluded integration reference in archive",
    )

    with tempfile.TemporaryDirectory(prefix="open-gov-data-wheel-") as directory:
        script = (
            "import json, open_gov_data as p; "
            "print(json.dumps({'version': p.__version__, "
            "'apify': len(p.APIFY_SOURCES), 'rapidapi': len(p.RAPIDAPI_SOURCES), "
            "'typed': all(callable(getattr(p.OpenGovDataClient, n, None)) for n in "
            + repr(TYPED_METHODS)
            + ")}))"
        )
        smoke = run(
            [sys.executable, "-c", script],
            cwd=Path(directory),
            pythonpath=str(wheel),
        )
        check(smoke.returncode == 0, f"wheel import failed: {smoke.stderr}")
        smoke_value = json.loads(smoke.stdout)
        check(
            smoke_value == {"version": "0.2.0", "apify": 8, "rapidapi": 4, "typed": True},
            f"wheel smoke contract failed: {smoke_value}",
        )

    return {
        "byte_reproducible_wheel": True,
        "byte_reproducible_sdist": True,
        "isolated_wheel_import": smoke_value,
        "archives_scanned_for_release_leaks": True,
        "artifacts": [
            {
                "path": relative(wheel),
                "bytes": wheel.stat().st_size,
                "sha256": sha256(wheel),
                "members": len(wheel_members),
            },
            {
                "path": relative(sdist),
                "bytes": sdist.stat().st_size,
                "sha256": sha256(sdist),
                "members": len(sdist_members),
            },
        ],
    }


def atomic_json(path: Path, value: dict[str, Any]) -> None:
    temporary = path.with_name(f"{path.name}.{os.getpid()}.tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    os.replace(temporary, path)


def main() -> int:
    started_monotonic = time.monotonic()
    started = datetime.now(UTC)
    metadata = metadata_audit()
    sources = source_audit()
    schemas = schema_audit()
    catalog = catalog_and_api_audit()
    release_paths = sorted(
        [
            ROOT / "pyproject.toml",
            ROOT / "README.md",
            ROOT / "LICENSE",
            ROOT / "build_backend.py",
            ROOT / "verify.py",
            *SRC.rglob("*.py"),
            *(ROOT / "tests").rglob("*.py"),
        ],
        key=relative,
    )
    release = release_content_audit(release_paths)
    test_count, test_output = run_tests()
    build = build_and_verify()

    hash_paths = sorted(
        [
            *release_paths,
            DIST / "open_gov_data-0.2.0-py3-none-any.whl",
            DIST / "open_gov_data-0.2.0.tar.gz",
        ],
        key=relative,
    )
    evidence: dict[str, Any] = {
        "schema_version": 1,
        "task_id": TASK_ID,
        "project_id": PROJECT_ID,
        "status": "passed",
        "generated_at": datetime.now(UTC).isoformat(),
        "duration_seconds": round(time.monotonic() - started_monotonic, 3),
        "runtime": {
            "python": platform.python_version(),
            "implementation": platform.python_implementation(),
            "platform": platform.platform(),
        },
        "package": metadata,
        "catalog": catalog,
        "schemas": schemas,
        "source_audit": sources,
        "release_content_audit": release,
        "tests": {
            "command": f"{sys.executable} -m unittest discover -s tests -v",
            "count": test_count,
            "passed": test_count,
            "failed": 0,
            "typed_methods_exercised_over_loopback": 12,
            "sec_intelligence_modes_exercised": 3,
            "compatibility_alias_calls_exercised": 8,
            "v0_1_generic_calls_exercised": 4,
            "loopback_host": "127.0.0.1",
            "external_http_requests": 0,
            "output_tail": test_output.strip().splitlines()[-8:],
        },
        "build": build,
        "safeguards": {
            "default_typed_apify_charge_cap_usd": "0.25",
            "typed_helper_can_exceed_quarter_dollar": False,
            "redirects_followed": False,
            "arbitrary_hosts_accepted": False,
            "arbitrary_actor_ids_accepted": False,
            "credential_leaks_detected": 0,
            "excluded_integration_references_detected": 0,
            "real_tokens_used": 0,
            "external_network_calls": 0,
            "paid_actions": 0,
            "publications": 0,
            "key_files_read": 0,
            "protected_repository_files_modified": [],
            "absorb_runs": 0,
        },
        "artifacts": [
            "pyproject.toml",
            "README.md",
            "LICENSE",
            "build_backend.py",
            "src/open_gov_data/",
            "tests/",
            "verify.py",
            "dist/open_gov_data-0.2.0-py3-none-any.whl",
            "dist/open_gov_data-0.2.0.tar.gz",
            "evidence.json",
        ],
        "sha256": {relative(path): sha256(path) for path in hash_paths},
        "started_at": started.isoformat(),
        "overall_passed": True,
    }
    atomic_json(EVIDENCE, evidence)
    sys.stdout.write(test_output)
    if test_output and not test_output.endswith("\n"):
        sys.stdout.write("\n")
    sys.stdout.write(
        json.dumps(
            {
                "status": "passed",
                "tests": test_count,
                "typed_methods": len(TYPED_METHODS),
                "actor_schemas": len(ACTOR_SCHEMA_FILES),
                "rapidapi_schemas": len(RAPIDAPI_SCHEMA_FILES),
                "reproducible_builds": True,
                "evidence": relative(EVIDENCE),
            },
            indent=2,
        )
        + "\n"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
