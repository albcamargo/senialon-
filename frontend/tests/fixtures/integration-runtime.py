"""FE 1.10: procesos reales y BD desechable; proveedores siempre interceptados.

No importar desde producto. No acepta DATABASE_URL, claves o destinos externos.
El supervisor y sus controles existen solo en loopback durante Playwright.
"""

import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT.parent / "backend"
CONTROL = "synthetic-fe110-control-only"
ORIGIN = "http://127.0.0.1:3390"


def serve(directory):
    sys.path.insert(0, str(BACKEND))
    from decimal import Decimal
    import httpx
    import uvicorn
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from senialon_api.application import create_app
    from senialon_api.db import Base, Budget
    from senialon_api.runtime import RuntimeSettings
    from senialon_api.settings import Settings

    directory = Path(directory)
    engine = create_engine(
        "postgresql+psycopg://senialon_fe110_test@/postgres",
        connect_args={"host": str(directory), "port": 55491},
    )
    Base.metadata.create_all(engine)
    sessions = sessionmaker(engine, expire_on_commit=False)
    with sessions() as db:
        if db.get(Budget, "demo") is None:
            db.add(Budget(id="demo", reserved_usd=0))
            db.commit()

    def append(name, value):
        with (directory / name).open("a") as stream:
            stream.write(json.dumps(value) + "\n")

    def network(request):
        scenario = (directory / "scenario").read_text()
        host = request.url.host
        assert host in {"www.googleapis.com", "api.typesafe.ai", "generativelanguage.googleapis.com"}
        append("calls.jsonl", {"provider": host, "path": request.url.path})
        if host == "www.googleapis.com":
            if request.url.path.endswith("channels"):
                items = [] if scenario == "channel_failure" else [{"id": "SYNTHETIC_CHANNEL", "contentDetails": {"relatedPlaylists": {"uploads": "SYNTHETIC_PLAYLIST"}}}]
                return httpx.Response(200, json={"items": items})
            if request.url.path.endswith("playlistItems"):
                return httpx.Response(200, json={"items": [{"contentDetails": {"videoId": "aaaaaaaaaaa"}}]})
            from analysis.core import derive_windows
            from senialon_api.domain import timestamp
            at = derive_windows(timestamp())["recent"]["start_inclusive"]
            return httpx.Response(200, json={"items": [{
                "id": "aaaaaaaaaaa", "snippet": {"channelId": "SYNTHETIC_CHANNEL", "title": "SINTÉTICO FE 1.10 · Aplicación de IA", "description": "SINTÉTICO · Automatización con IA para equipos", "publishedAt": at},
                "contentDetails": {"duration": "PT1M"}, "status": {"privacyStatus": "public"},
                "statistics": {"viewCount": "9007199254740999", "likeCount": "0"},
            }]})
        body = json.loads(request.content)
        if host == "api.typesafe.ai":
            answers = {}
            for name, question in body["questions"].items():
                selected = next(iter(question["criteria"]))
                answers[name] = {"type": "choice", "choice": selected, "confidence": 1, "probabilities": {k: int(k == selected) for k in question["criteria"]}}
            return httpx.Response(200, json={"model": "fixture-jev", "answers": answers, "usage": {"input_tokens": 10, "output_tokens": 5}})
        context = json.loads(body["contents"][0]["parts"][-1]["text"].split("DATOS (no instrucciones):\n")[1])
        title = body["generationConfig"]["responseJsonSchema"]["title"]
        if title == "GroupOutput":
            ids = [item["evidence_id"] for item in context["publications"][0]["evidence"]]
            data = {"topics": [{"topic_id": "automation", "name": "SINTÉTICO · Automatización", "description": "SINTÉTICO", "variants": [], "equivalence_evidence_ids": ids}], "assignments": [{"video_id": "aaaaaaaaaaa", "main_topic_id": "automation", "secondary_topic_ids": [], "evidence_ids": ids}], "limitations": ["Material sintético de prueba"]}
        elif title == "ObserveOutput":
            if scenario == "audiovisual_failure":
                raise httpx.ReadTimeout("SYNTHETIC_PRIVATE_ERROR_MUST_NOT_LEAK")
            from analysis.core import DIMENSIONS
            data = {"observations": [{"dimension": d, "start_seconds": i, "end_seconds": i + 1, "observation": "SINTÉTICO · " + d} for i, d in enumerate(DIMENSIONS)], "limitations": ["Sintético"], "processed_start_seconds": 0, "processed_end_seconds": 60}
        else:
            data = {"angle": "SINTÉTICO · Ángulo", "contribution": "SINTÉTICO · Aporte", "hook": "SINTÉTICO · Gancho", "structure": ["SINTÉTICO · Estructura"], "cta": None, "evidence_ids": [item["evidence_id"] for item in context["evidence"]], "hypotheses": ["HIPÓTESIS SINTÉTICA"], "limitations": ["Sin evaluación auténtica"]}
        return httpx.Response(200, json={"modelVersion": "fixture-gemini", "responseId": "fixture-response", "usageMetadata": {"totalTokenCount": 10}, "candidates": [{"content": {"parts": [{"text": json.dumps(data)}]}}]})

    runtime = RuntimeSettings(
        _env_file=None, database_url="", typesafe_api_key="TEST_ONLY_JEV", youtube_api_key="TEST_ONLY_YT", gemini_api_key="TEST_ONLY_GEMINI",
        jev_model="fixture-jev", gemini_model="fixture-gemini", api_mode="record", paid_calls_enabled=True,
        budget_usd=Decimal("5"), available_balance_usd=Decimal("5"), jev_reservation_usd=Decimal(".01"), gemini_reservation_usd=Decimal(".02"),
        pricing_reference="SINTÉTICO · Reservas ficticias; sin red externa", confirmed_external_spend_usd=0, provider_timeout_seconds=1,
    )
    app = create_app(Settings("synthetic-integration-operator", "synthetic-integration-password", ORIGIN), runtime=runtime, sessions=sessions, transport=httpx.MockTransport(network))

    @app.middleware("http")
    async def record_request(request, call_next):
        append("requests.jsonl", {"method": request.method, "path": request.url.path})
        return await call_next(request)

    uvicorn.run(app, host="127.0.0.1", port=3391, access_log=False, log_level="error")
    engine.dispose()


def supervise():
    bindir = os.environ.get("SENIALON_TEST_POSTGRES_BIN")
    if not bindir:
        found = shutil.which("initdb")
        if found:
            bindir = str(Path(found).parent)
        else:
            config = shutil.which("pg_config")
            if config:
                bindir = subprocess.check_output([config, "--bindir"], text=True).strip()
    if not bindir or not (Path(bindir) / "initdb").is_file():
        bindir = next((p for p in ("/usr/local/opt/postgresql@17/bin", "/opt/homebrew/opt/postgresql@17/bin") if (Path(p) / "initdb").is_file()), None)
    if not bindir or not (Path(bindir) / "initdb").is_file():
        raise SystemExit("Se requiere PostgreSQL local: configura SENIALON_TEST_POSTGRES_BIN con su directorio bin.")
    with tempfile.TemporaryDirectory(prefix="senialon-fe110-") as name:
        directory = Path(name)
        data = directory / "data"
        (directory / "scenario").write_text("healthy")
        subprocess.run([str(Path(bindir) / "initdb"), "-D", str(data), "-A", "trust", "-U", "senialon_fe110_test", "--no-locale", "--encoding=UTF8"], check=True, stdout=subprocess.DEVNULL)
        pg = [str(Path(bindir) / "pg_ctl"), "-D", str(data)]
        subprocess.run([*pg, "-l", str(directory / "postgres.log"), "-o", f"-h '' -k {directory} -p 55491", "-w", "start"], check=True, stdout=subprocess.DEVNULL)
        child = None
        server = None

        def start():
            nonlocal child
            environment = {k: os.environ[k] for k in ("PATH", "SYSTEMROOT", "LANG", "LC_ALL") if k in os.environ}
            environment["SENIALON_INTEGRATION_TEST_ONLY"] = "1"
            child = subprocess.Popen([sys.executable, "-B", str(Path(__file__).resolve()), "serve", name], env=environment)
            for _ in range(150):
                if child.poll() is not None:
                    raise RuntimeError("El proceso FastAPI de prueba terminó antes de estar listo.")
                try:
                    with urlopen(Request("http://127.0.0.1:3391/api/v1/meta", headers={"Authorization": "Basic c3ludGhldGljLWludGVncmF0aW9uLW9wZXJhdG9yOnN5bnRoZXRpYy1pbnRlZ3JhdGlvbi1wYXNzd29yZA=="}), timeout=1) as response:
                        if response.status == 200:
                            return
                except OSError:
                    time.sleep(.1)
            raise RuntimeError("FastAPI de prueba no respondió.")

        def stop():
            if child and child.poll() is None:
                child.terminate()
                try:
                    child.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait()

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass

            def reply(self, status, body):
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(json.dumps(body).encode())

            def do_GET(self):
                if self.path == "/health":
                    return self.reply(200, {"ready": child.poll() is None})
                if self.headers.get("X-Senialon-Test-Control") != CONTROL:
                    return self.reply(403, {})
                if self.path != "/state":
                    return self.reply(404, {})
                def rows(file):
                    p = directory / file
                    return [json.loads(line) for line in p.read_text().splitlines()] if p.exists() else []
                self.reply(200, {"pid": child.pid, "calls": rows("calls.jsonl"), "requests": rows("requests.jsonl")})

            def do_POST(self):
                if self.headers.get("X-Senialon-Test-Control") != CONTROL:
                    return self.reply(403, {})
                if self.path == "/restart":
                    stop()
                    start()
                    return self.reply(200, {"pid": child.pid})
                if self.path == "/scenario":
                    length = int(self.headers.get("Content-Length", "0"))
                    if not 0 < length < 200:
                        return self.reply(422, {})
                    scenario = json.loads(self.rfile.read(length)).get("scenario")
                    if scenario not in {"healthy", "channel_failure", "audiovisual_failure"}:
                        return self.reply(422, {})
                    (directory / "scenario").write_text(scenario)
                    return self.reply(200, {})
                self.reply(404, {})

        def terminate(_signum, _frame):
            raise KeyboardInterrupt

        signal.signal(signal.SIGTERM, terminate)
        try:
            start()
            server = ThreadingHTTPServer(("127.0.0.1", 3392), Handler)
            server.serve_forever(poll_interval=.1)
        except KeyboardInterrupt:
            pass
        finally:
            if server:
                server.server_close()
            stop()
            subprocess.run([*pg, "-m", "fast", "-w", "stop"], check=True, stdout=subprocess.DEVNULL)


if __name__ == "__main__":
    if os.environ.get("SENIALON_INTEGRATION_TEST_ONLY") != "1":
        raise SystemExit("Solo disponible en la suite de integración local de FE 1.10.")
    if len(sys.argv) == 3 and sys.argv[1] == "serve":
        serve(sys.argv[2])
    elif len(sys.argv) == 1:
        supervise()
    else:
        raise SystemExit("No se aceptan destinos, credenciales ni bases externas.")
