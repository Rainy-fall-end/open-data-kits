"""Loopback-only HTTP fixtures and local source imports."""

from __future__ import annotations

import json
import sys
import threading
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Iterator
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

APIFY_TOKEN = "apify_" + "api_" + "TESTONLY_000000000000"
RAPIDAPI_KEY = "RAPID" + "API_TESTONLY_000000000000"


class LoopbackState:
    def __init__(self) -> None:
        self.mode = "success"
        self.payload: object = {"items": [{"id": "fixture-1"}]}
        self.requests: list[dict[str, Any]] = []


class _Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    state: LoopbackState

    def log_message(self, format: str, *args: object) -> None:
        return

    def do_GET(self) -> None:
        self._handle()

    def do_POST(self) -> None:
        self._handle()

    def _handle(self) -> None:
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length) if length else b""
        parsed = urlsplit(self.path)
        self.state.requests.append(
            {
                "method": self.command,
                "path": parsed.path,
                "query": parsed.query,
                "headers": {key.casefold(): value for key, value in self.headers.items()},
                "body": body,
            }
        )
        if self.state.mode == "redirect":
            self.send_response(302)
            self.send_header("Location", f"http://127.0.0.1:{self.server.server_port}/redirected")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if self.state.mode == "invalid_json":
            self._send(200, b"{invalid-json")
            return
        if self.state.mode == "http_error":
            self._send(503, b'{"message":"sensitive upstream body"}')
            return
        if self.state.mode == "oversized_header":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", "999999")
            self.end_headers()
            return
        if self.state.mode == "oversized_body":
            self._send(200, json.dumps({"data": "x" * 1_000}).encode())
            return
        if self.state.mode == "empty":
            self.send_response(204)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        self._send(200, json.dumps(self.state.payload, ensure_ascii=False).encode("utf-8"))

    def _send(self, status: int, body: bytes) -> None:
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass


@contextmanager
def loopback_server() -> Iterator[tuple[str, LoopbackState]]:
    state = LoopbackState()
    handler = type("BoundHandler", (_Handler,), {"state": state})
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}", state
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)

