"""Small deterministic, dependency-free PEP 517 backend."""

from __future__ import annotations

import base64
import csv
import gzip
import hashlib
import io
import tarfile
import zipfile
from pathlib import Path
from typing import Final


ROOT: Final = Path(__file__).resolve().parent
NAME: Final = "open-gov-data"
NORMALIZED_NAME: Final = "open_gov_data"
VERSION: Final = "0.2.0"
DIST_INFO: Final = f"{NORMALIZED_NAME}-{VERSION}.dist-info"
WHEEL_NAME: Final = f"{NORMALIZED_NAME}-{VERSION}-py3-none-any.whl"
SDIST_ROOT: Final = f"{NORMALIZED_NAME}-{VERSION}"
SDIST_NAME: Final = f"{SDIST_ROOT}.tar.gz"
_ZIP_TIME: Final = (2020, 1, 1, 0, 0, 0)


def _metadata() -> bytes:
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    headers = "\n".join(
        [
            "Metadata-Version: 2.4",
            f"Name: {NAME}",
            f"Version: {VERSION}",
            "Summary: Zero-dependency Python SDK for a closed catalog of public government-data APIs",
            "Author: apify-works maintainers",
            "License-Expression: MIT",
            "License-File: LICENSE",
            "Requires-Python: >=3.11",
            "Description-Content-Type: text/markdown",
            "Keywords: apify,rapidapi,government-data,sec-edgar,clinicaltrials,openfda,public-tenders",
            "Classifier: Development Status :: 4 - Beta",
            "Classifier: Environment :: Console",
            "Classifier: Intended Audience :: Developers",
            "Classifier: License :: OSI Approved :: MIT License",
            "Classifier: Operating System :: OS Independent",
            "Classifier: Programming Language :: Python :: 3",
            "Classifier: Programming Language :: Python :: 3.11",
            "Classifier: Topic :: Software Development :: Libraries :: Python Modules",
            "Project-URL: Repository, https://github.com/fallRainy/apify-works",
            "Project-URL: Issues, https://github.com/fallRainy/apify-works/issues",
        ]
    )
    return f"{headers}\n\n{readme}\n".encode("utf-8")


def _wheel_metadata_files() -> dict[str, bytes]:
    return {
        f"{DIST_INFO}/METADATA": _metadata(),
        f"{DIST_INFO}/WHEEL": (
            "Wheel-Version: 1.0\n"
            "Generator: open-gov-data dependency-free backend\n"
            "Root-Is-Purelib: true\n"
            "Tag: py3-none-any\n"
        ).encode("utf-8"),
        f"{DIST_INFO}/entry_points.txt": (
            "[console_scripts]\nopen-gov-data = open_gov_data.cli:main\n"
        ).encode("utf-8"),
        f"{DIST_INFO}/licenses/LICENSE": (ROOT / "LICENSE").read_bytes(),
    }


def _wheel_files() -> dict[str, bytes]:
    files = _wheel_metadata_files()
    for source in sorted((ROOT / "src" / "open_gov_data").glob("*.py")):
        files[f"open_gov_data/{source.name}"] = source.read_bytes()
    return files


def _record(files: dict[str, bytes]) -> bytes:
    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\n")
    for name in sorted(files):
        payload = files[name]
        digest = base64.urlsafe_b64encode(hashlib.sha256(payload).digest()).rstrip(b"=")
        writer.writerow((name, f"sha256={digest.decode('ascii')}", len(payload)))
    writer.writerow((f"{DIST_INFO}/RECORD", "", ""))
    return output.getvalue().encode("utf-8")


def _write_zip_member(archive: zipfile.ZipFile, name: str, payload: bytes) -> None:
    info = zipfile.ZipInfo(name, date_time=_ZIP_TIME)
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = 0o644 << 16
    archive.writestr(info, payload)


def get_requires_for_build_wheel(config_settings=None) -> list[str]:
    return []


def get_requires_for_build_sdist(config_settings=None) -> list[str]:
    return []


def prepare_metadata_for_build_wheel(
    metadata_directory: str, config_settings=None
) -> str:
    target = Path(metadata_directory) / DIST_INFO
    target.mkdir(parents=True, exist_ok=True)
    for name, payload in _wheel_metadata_files().items():
        relative = Path(name).relative_to(DIST_INFO)
        output = target / relative
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_bytes(payload)
    return DIST_INFO


def build_wheel(
    wheel_directory: str, config_settings=None, metadata_directory=None
) -> str:
    destination = Path(wheel_directory)
    destination.mkdir(parents=True, exist_ok=True)
    output = destination / WHEEL_NAME
    files = _wheel_files()
    files[f"{DIST_INFO}/RECORD"] = _record(files)
    with zipfile.ZipFile(output, "w") as archive:
        for name in sorted(files):
            _write_zip_member(archive, name, files[name])
    return WHEEL_NAME


def _sdist_files() -> list[Path]:
    fixed = [
        ROOT / "pyproject.toml",
        ROOT / "README.md",
        ROOT / "LICENSE",
        ROOT / "build_backend.py",
        ROOT / "verify.py",
    ]
    source = list((ROOT / "src" / "open_gov_data").glob("*.py"))
    tests = list((ROOT / "tests").glob("*.py"))
    return sorted(
        [path for path in [*fixed, *source, *tests] if path.is_file()],
        key=lambda path: path.relative_to(ROOT).as_posix(),
    )


def _tar_add(archive: tarfile.TarFile, name: str, payload: bytes) -> None:
    info = tarfile.TarInfo(name)
    info.size = len(payload)
    info.mtime = 0
    info.mode = 0o644
    info.uid = 0
    info.gid = 0
    info.uname = ""
    info.gname = ""
    archive.addfile(info, io.BytesIO(payload))


def build_sdist(sdist_directory: str, config_settings=None) -> str:
    destination = Path(sdist_directory)
    destination.mkdir(parents=True, exist_ok=True)
    output = destination / SDIST_NAME
    with output.open("wb") as raw:
        with gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0) as compressed:
            with tarfile.open(fileobj=compressed, mode="w") as archive:
                for source in _sdist_files():
                    relative = source.relative_to(ROOT).as_posix()
                    _tar_add(archive, f"{SDIST_ROOT}/{relative}", source.read_bytes())
                _tar_add(archive, f"{SDIST_ROOT}/PKG-INFO", _metadata())
    return SDIST_NAME
