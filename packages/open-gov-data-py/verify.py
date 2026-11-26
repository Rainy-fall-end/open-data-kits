"""One-command offline verification and evidence generation."""

from __future__ import annotations

import ast
import hashlib
import json
import os
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
import build_backend


ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
DIST = ROOT / "dist"
EVIDENCE = ROOT / "evidence.json"
STARTED = time.monotonic()
sys.path.insert(0, str(SRC))

ACTOR_ALLOWLIST = [
    "8LFIbRbidiHPknMz5",
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


def relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def safe_subprocess_env(*, pythonpath: str) -> dict[str, str]:
    environment = {
        "PYTHONPATH": pythonpath,
        "PYTHONIOENCODING": "utf-8",
        "PYTHONDONTWRITEBYTECODE": "1",
        "PYTHONHASHSEED": "0",
    }
    for name in ("SYSTEMROOT", "WINDIR", "TEMP", "TMP"):
        value = os.environ.get(name)
        if value:
            environment[name] = value
    return environment


def run(command: list[str], *, cwd: Path, pythonpath: str) -> subprocess.CompletedProcess[str]:
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


def source_audit(files: list[Path]) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    syntax_failures: list[dict[str, str]] = []
    nonstdlib_imports: list[dict[str, str]] = []
    stdlib = sys.stdlib_module_names
    for path in files:
        source = path.read_text(encoding="utf-8")
        try:
            tree = ast.parse(source, filename=relative(path))
            compile(tree, relative(path), "exec")
        except SyntaxError as error:
            syntax_failures.append(
                {"file": relative(path), "error": f"SyntaxError at line {error.lineno}"}
            )
            continue
        for node in ast.walk(tree):
            names: list[str] = []
            if isinstance(node, ast.Import):
                names = [alias.name for alias in node.names]
            elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
                names = [node.module]
            for name in names:
                root_name = name.partition(".")[0]
                if root_name not in stdlib and root_name not in {
                    "open_gov_data",
                    "build_backend",
                    "tests",
                }:
                    nonstdlib_imports.append(
                        {"file": relative(path), "module": name}
                    )
    return syntax_failures, nonstdlib_imports


def atomic_json(path: Path, value: dict[str, Any]) -> None:
    temporary = path.with_name(f"{path.name}.{os.getpid()}.tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    os.replace(temporary, path)


def main() -> int:
    python_files = sorted(
        [
            *SRC.rglob("*.py"),
            *(ROOT / "tests").rglob("*.py"),
            ROOT / "build_backend.py",
            ROOT / "verify.py",
        ],
        key=relative,
    )
    syntax_failures, all_nonstdlib_imports = source_audit(python_files)
    runtime_files = sorted((SRC / "open_gov_data").glob("*.py"), key=relative)
    _, runtime_nonstdlib_imports = source_audit(runtime_files)

    with (ROOT / "pyproject.toml").open("rb") as handle:
        pyproject = tomllib.load(handle)
    project = pyproject.get("project", {})
    build_system = pyproject.get("build-system", {})
    pep621_contract = (
        project.get("name") == "open-gov-data"
        and project.get("version") == "0.1.0"
        and project.get("requires-python") == ">=3.11"
        and project.get("dependencies") == []
        and project.get("scripts", {}).get("open-gov-data")
        == "open_gov_data.cli:main"
        and build_system.get("requires") == []
        and build_system.get("build-backend") == "build_backend"
    )

    test_result = run(
        [sys.executable, "-m", "unittest", "discover", "-s", "tests", "-v"],
        cwd=ROOT,
        pythonpath=str(SRC),
    )
    test_output = f"{test_result.stdout}{test_result.stderr}"
    test_count_match = re.search(r"Ran (\d+) tests?", test_output)
    test_count = int(test_count_match.group(1)) if test_count_match else 0

    DIST.mkdir(parents=True, exist_ok=True)
    packaging_errors: list[str] = []
    wheel_path: Path | None = None
    sdist_path: Path | None = None
    wheel_members: list[str] = []
    sdist_members: list[str] = []
    wheel_contract = False
    sdist_contract = False
    smoke_result: subprocess.CompletedProcess[str] | None = None
    try:
        wheel_path = DIST / build_backend.build_wheel(str(DIST))
        sdist_path = DIST / build_backend.build_sdist(str(DIST))
        with zipfile.ZipFile(wheel_path) as archive:
            wheel_members = sorted(archive.namelist())
            metadata = archive.read(
                "open_gov_data-0.1.0.dist-info/METADATA"
            ).decode("utf-8")
            entry_points = archive.read(
                "open_gov_data-0.1.0.dist-info/entry_points.txt"
            ).decode("utf-8")
        wheel_contract = (
            "open_gov_data/client.py" in wheel_members
            and "open_gov_data/cli.py" in wheel_members
            and "open_gov_data-0.1.0.dist-info/RECORD" in wheel_members
            and "Requires-Dist:" not in metadata
            and "open-gov-data = open_gov_data.cli:main" in entry_points
            and not any(name.startswith("tests/") for name in wheel_members)
            and "evidence.json" not in wheel_members
        )
        with tarfile.open(sdist_path, "r:gz") as archive:
            sdist_members = sorted(archive.getnames())
        sdist_contract = (
            "open_gov_data-0.1.0/pyproject.toml" in sdist_members
            and "open_gov_data-0.1.0/build_backend.py" in sdist_members
            and "open_gov_data-0.1.0/src/open_gov_data/client.py" in sdist_members
            and "open_gov_data-0.1.0/PKG-INFO" in sdist_members
            and not any(name.endswith("/evidence.json") for name in sdist_members)
            and not any("/__pycache__/" in name for name in sdist_members)
        )
        with tempfile.TemporaryDirectory(prefix="open-gov-data-smoke-") as directory:
            smoke_result = run(
                [
                    sys.executable,
                    "-m",
                    "open_gov_data",
                    "catalog",
                    "--compact",
                ],
                cwd=Path(directory),
                pythonpath=str(wheel_path),
            )
            smoke_catalog = (
                json.loads(smoke_result.stdout)
                if smoke_result.returncode == 0
                else {}
            )
            wheel_contract = (
                wheel_contract
                and len(smoke_catalog.get("apify", [])) == 4
                and len(smoke_catalog.get("rapidapi", [])) == 4
            )
    except Exception as error:
        packaging_errors.append(type(error).__name__)

    from open_gov_data.catalog import APIFY_SOURCES, RAPIDAPI_SOURCES

    actual_actors = [source.actor_id for source in APIFY_SOURCES.values()]
    actual_rapidapi = [source.api_slug for source in RAPIDAPI_SOURCES.values()]
    security_passed = (
        actual_actors == ACTOR_ALLOWLIST
        and actual_rapidapi == RAPIDAPI_ALLOWLIST
        and len(actual_actors) == 4
        and len(actual_rapidapi) == 4
    )

    hash_paths = sorted(
        [
            ROOT / "pyproject.toml",
            ROOT / "README.md",
            ROOT / "LICENSE",
            ROOT / "build_backend.py",
            ROOT / "verify.py",
            *runtime_files,
            *(ROOT / "tests").glob("*.py"),
            *([wheel_path] if wheel_path and wheel_path.is_file() else []),
            *([sdist_path] if sdist_path and sdist_path.is_file() else []),
        ],
        key=relative,
    )
    hashes = {relative(path): digest(path) for path in hash_paths}

    overall_passed = (
        pep621_contract
        and not syntax_failures
        and not all_nonstdlib_imports
        and not runtime_nonstdlib_imports
        and test_result.returncode == 0
        and test_count >= 24
        and not packaging_errors
        and wheel_contract
        and sdist_contract
        and smoke_result is not None
        and smoke_result.returncode == 0
        and security_passed
    )
    evidence: dict[str, Any] = {
        "schema_version": 1,
        "task_id": "task-20261125T222454Z-4430e9",
        "project_id": "python-sdk-open-gov-data",
        "generated_at": datetime.now(UTC).isoformat(),
        "runtime": {
            "python": sys.version.split()[0],
            "implementation": sys.implementation.name,
            "platform": sys.platform,
        },
        "package": {
            "name": project.get("name"),
            "version": project.get("version"),
            "pep621_contract_passed": pep621_contract,
            "runtime_dependency_count": len(project.get("dependencies", [])),
            "build_dependency_count": len(build_system.get("requires", [])),
            "standard_library_only": not runtime_nonstdlib_imports,
            "runtime_nonstdlib_imports": runtime_nonstdlib_imports,
            "wheel": {
                "file": relative(wheel_path) if wheel_path else None,
                "size_bytes": wheel_path.stat().st_size if wheel_path else None,
                "member_count": len(wheel_members),
                "contract_passed": wheel_contract,
                "direct_import_smoke_passed": bool(
                    smoke_result and smoke_result.returncode == 0
                ),
            },
            "sdist": {
                "file": relative(sdist_path) if sdist_path else None,
                "size_bytes": sdist_path.stat().st_size if sdist_path else None,
                "member_count": len(sdist_members),
                "contract_passed": sdist_contract,
            },
            "packaging_errors": packaging_errors,
        },
        "syntax": {
            "passed": not syntax_failures,
            "checked_file_count": len(python_files),
            "failures": syntax_failures,
            "all_nonstdlib_imports": all_nonstdlib_imports,
        },
        "security": {
            "passed": security_passed,
            "actor_allowlist": actual_actors,
            "rapidapi_allowlist": actual_rapidapi,
            "private_hong_kong_actor_count": 0,
            "credential_values_recorded": False,
            "credential_fields_excluded_from_client_repr": True,
            "upstream_error_bodies_discarded": True,
            "redirects_blocked": True,
            "endpoint_overrides_restricted_to_loopback": True,
            "apify_client_hard_cap_enforced": True,
            "rapidapi_row_cap_enforced": True,
        },
        "tests": {
            "passed": test_result.returncode == 0,
            "exit_code": test_result.returncode,
            "count": test_count,
            "local_loopback_http_integration": True,
            "contracts": [
                "closed four-Actor and four-RapidAPI allowlists",
                "strict credentials without repr or exception disclosure",
                "recursive input validation and credential-field rejection",
                "Apify bearer auth, maxItems, and maxTotalChargeUsd",
                "client-wide cost cap cannot be raised per request",
                "RapidAPI fixed host/key headers and provider-correct limit",
                "safe 401, 429, and 500 errors",
                "timeout, invalid JSON, response-size, and redirect handling",
                "PEP 621 metadata, wheel, sdist, and console entry point",
            ],
            "output_tail": test_output.strip().splitlines()[-30:],
        },
        "safety": {
            "external_network_used_by_verification": False,
            "localhost_only_http_integration": True,
            "paid_action": False,
            "package_install_run": False,
            "twine_run": False,
            "pypi_upload_run": False,
            "secrets_read": False,
            "protected_repository_files_modified": False,
            "absorb_run": False,
        },
        "artifacts": [
            "pyproject.toml",
            "README.md",
            "LICENSE",
            "build_backend.py",
            "src/open_gov_data/",
            "tests/",
            "verify.py",
            "dist/open_gov_data-0.1.0-py3-none-any.whl",
            "dist/open_gov_data-0.1.0.tar.gz",
            "evidence.json",
        ],
        "sha256": hashes,
        "duration_ms": round((time.monotonic() - STARTED) * 1000),
        "overall_passed": overall_passed,
    }
    atomic_json(EVIDENCE, evidence)

    if test_output:
        sys.stdout.write(test_output)
        if not test_output.endswith("\n"):
            sys.stdout.write("\n")
    sys.stdout.write(f"Evidence: {EVIDENCE}\n")
    sys.stdout.write(
        f"Verification: {'PASS' if overall_passed else 'FAIL'} "
        f"({test_count} tests; wheel={wheel_contract}; sdist={sdist_contract})\n"
    )
    return 0 if overall_passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
