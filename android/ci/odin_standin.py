#!/usr/bin/env python3
"""A stand-in for Odin's server, for DI-ana's emulator check only: the part of Odin's API that DI-ana uses, with the
invented demo school. Odin itself is in another repository; its own tests check the real routes (page-src/tests/test_server.py).

    python3 android/ci/odin_standin.py 8090 out      # password: test-pass

POST /api/signin {password} -> a session cookie (HttpOnly), as Odin does
GET  /api/scanner           -> the sheets (401 without the cookie)
POST /api/sheet/result      -> scored here from the answer key; every result is also written to out/standin.json
"""
import json, secrets, subprocess, sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT, OUT = int(sys.argv[1]), Path(sys.argv[2])
ROOT = Path(__file__).resolve().parents[2]
DATA = json.loads(subprocess.run(["node", str(ROOT / "tools/demo_data.js")], capture_output=True, text=True, check=True).stdout)
DATA["demo"] = False
DATA["classes"] = DATA["classes"][:4]
SHEETS = {r["id"]: (c, r) for c in DATA["classes"] for r in c["sheets"]}
SESSIONS, LOG = set(), {"signins": 0, "refused": 0, "results": []}


def save():
    (OUT / "standin.json").write_text(json.dumps(LOG, indent=1))


class H(BaseHTTPRequestHandler):
    def log_message(self, fmt, *a):
        print(self.command, self.path, a[1] if len(a) > 1 else "", flush=True)

    def send(self, code, body, extra=None):
        raw = json.dumps(body).encode()
        self.send_response(code)
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def signed_in(self):
        ck = self.headers.get("Cookie", "")
        return any(p.strip() == f"odin_session={t}" for t in SESSIONS for p in ck.split(";"))

    def do_GET(self):
        if self.path == "/api/scanner":
            if not self.signed_in():
                LOG["refused"] += 1; save()
                return self.send(401, {"error": "Sign in again: the session ended."})
            return self.send(200, DATA)
        self.send(404, {"error": "not found"})

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
        if self.path == "/api/signin":
            if body.get("password") != "test-pass":
                return self.send(401, {"error": "That password isn't right."})
            t = secrets.token_urlsafe(16); SESSIONS.add(t); LOG["signins"] += 1; save()
            return self.send(200, {"ok": True}, {"Set-Cookie": f"odin_session={t}; Path=/; HttpOnly; SameSite=Strict"})
        if not self.signed_in():
            LOG["refused"] += 1; save()
            return self.send(401, {"error": "Sign in again: the session ended."})
        if self.path == "/api/sheet/result":
            c, r = SHEETS.get(body.get("id"), (None, None))
            if not r or c["id"] != body.get("classId") or len(body.get("answers", "")) != r["total"]:
                return self.send(400, {"error": "bad sheet or answers"})
            score = sum(a == k for a, k in zip(body["answers"], r["key"]))
            r.update(status="done", right=score, source=body.get("source"))
            LOG["results"].append({"id": r["id"], "answers": body["answers"], "source": body.get("source"), "score": score, "key": r["key"]}); save()
            return self.send(200, {"ok": True, "score": score, "total": r["total"]})
        self.send(404, {"error": "not found"})


OUT.mkdir(parents=True, exist_ok=True); save()
ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
