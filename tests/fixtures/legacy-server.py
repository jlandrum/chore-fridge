#!/usr/bin/env python3
import json
import os
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent / "dist"
LOCK = threading.Lock()
MAX_BYTES = 1_000_000


def data_path():
    env = os.environ.get("DATA_FILE")
    if env:
        return Path(env)
    docker = Path("/data")
    if docker.is_dir() and os.access(docker, os.W_OK):
        return docker / "state.json"
    local = Path(__file__).resolve().parent / "data"
    local.mkdir(parents=True, exist_ok=True)
    return local / "state.json"


DATA = data_path()


def merge_completions(a, b):
    out = dict(a or {})
    for key, raw in (b or {}).items():
        try:
            incoming = int(raw)
        except (TypeError, ValueError):
            continue
        current = out.get(key)
        try:
            current = int(current) if current is not None else 0
        except (TypeError, ValueError):
            current = 0
        if key not in out or abs(incoming) >= abs(current):
            out[key] = incoming
    return out


def _count_rec(raw):
    if isinstance(raw, dict):
        try:
            n = int(raw.get("n") or 0)
        except (TypeError, ValueError):
            n = 0
        try:
            t = int(raw.get("t") or 0)
        except (TypeError, ValueError):
            t = 0
        return {"n": max(0, n), "t": t}
    try:
        return {"n": max(0, int(raw)), "t": 0}
    except (TypeError, ValueError):
        return {"n": 0, "t": 0}


def merge_counts(a, b):
    out = dict(a or {})
    for key, raw in (b or {}).items():
        incoming = _count_rec(raw)
        current = _count_rec(out[key]) if key in out else None
        if current is None or incoming["t"] >= current["t"]:
            out[key] = incoming
    return out


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (self.address_string(), fmt % args))

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        if self.path.split("?", 1)[0] == "/api/state":
            return self._get_state()
        return super().do_GET()

    def do_PUT(self):
        if self.path.split("?", 1)[0] == "/api/state":
            return self._put_state()
        self.send_error(404)

    def _get_state(self):
        with LOCK:
            body = DATA.read_bytes() if DATA.exists() else b"null"
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _put_state(self):
        length = int(self.headers.get("Content-Length") or "0")
        if length <= 0 or length > MAX_BYTES:
            self.send_error(400, "bad size")
            return
        raw = self.rfile.read(length)
        try:
            incoming = json.loads(raw.decode("utf-8"))
        except Exception:
            self.send_error(400, "bad json")
            return
        if not isinstance(incoming, dict):
            self.send_error(400, "bad json")
            return
        with LOCK:
            DATA.parent.mkdir(parents=True, exist_ok=True)
            current = {}
            if DATA.exists():
                try:
                    current = json.loads(DATA.read_text())
                except Exception:
                    current = {}
            if isinstance(current, dict):
                incoming["completions"] = merge_completions(
                    current.get("completions"), incoming.get("completions")
                )
                incoming["counts"] = merge_counts(
                    current.get("counts"), incoming.get("counts")
                )
            tmp = DATA.with_suffix(".tmp")
            tmp.write_bytes(json.dumps(incoming).encode("utf-8"))
            tmp.replace(DATA)
        self.send_response(204)
        self.end_headers()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    DATA.parent.mkdir(parents=True, exist_ok=True)
    httpd = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print("Chore Fridge http://0.0.0.0:%s (data %s)" % (port, DATA), flush=True)
    httpd.serve_forever()
