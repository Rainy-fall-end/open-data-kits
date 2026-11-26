"""127.0.0.1-only HTTP helpers."""

from __future__ import annotations

import json
import threading
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any


HandlerCallback = Callable[[BaseHTTPRequestHandler], None]


class _Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def read_body(request: BaseHTTPRequestHandler) -> bytes:
    length = int(request.headers.get("content-length", "0"))
    return request.rfile.read(length)


def send_json(request: BaseHTTPRequestHandler, status: int, value: object) -> None:
    payload = json.dumps(value, separators=(",", ":")).encode("utf-8")
    request.send_response(status)
    request.send_header("content-type", "application/json")
    request.send_header("content-length", str(len(payload)))
    request.end_headers()
    request.wfile.write(payload)


@contextmanager
def loopback_server(callback: HandlerCallback) -> Iterator[str]:
    errors: list[BaseException] = []

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            self._dispatch()

        def do_POST(self) -> None:  # noqa: N802
            self._dispatch()

        def _dispatch(self) -> None:
            if self.client_address[0] != "127.0.0.1":
                errors.append(AssertionError("non-loopback test client"))
                return
            try:
                callback(self)
            except BaseException as error:
                errors.append(error)
                try:
                    send_json(self, 500, {"error": "loopback handler failed"})
                except OSError:
                    pass

        def log_message(self, format: str, *args: Any) -> None:
            return

    server = _Server(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        host, port = server.server_address
        assert host == "127.0.0.1"
        yield f"http://{host}:{port}"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
        if errors:
            raise errors[0]
