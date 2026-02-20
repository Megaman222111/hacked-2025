import json
import os
import random
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote

try:
    from .data import PATIENTS
except ImportError:
    from data import PATIENTS


FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")
HOST = os.getenv("API_HOST", "127.0.0.1")
PORT = int(os.getenv("API_PORT", "8000"))


def _find_patient_by_id(patient_id: str):
    return next((patient for patient in PATIENTS if patient["id"] == patient_id), None)


def _find_patient_by_nfc(nfc_id: str):
    return next((patient for patient in PATIENTS if patient["nfcId"] == nfc_id), None)


class ApiHandler(BaseHTTPRequestHandler):
    def _set_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", FRONTEND_ORIGIN)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def _send_json(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self._set_cors_headers()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self):
        content_length = int(self.headers.get("Content-Length", "0"))
        if content_length == 0:
            return {}
        raw = self.rfile.read(content_length).decode("utf-8")
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return None

    def do_OPTIONS(self):
        self.send_response(200)
        self._set_cors_headers()
        self.end_headers()

    def do_GET(self):
        path = self.path

        if path == "/":
            return self._send_json(
                {
                    "service": "medlink-api",
                    "status": "running",
                    "routes": [
                        "/api/health/",
                        "/api/patients/",
                        "/api/patients/<id>/",
                        "/api/patients/by-nfc/<nfc_id>/",
                        "/api/nfc/scan/",
                    ],
                }
            )

        if path == "/api/health/":
            return self._send_json({"status": "ok", "service": "medlink-api"})

        if path == "/api/patients/":
            return self._send_json(PATIENTS)

        if path.startswith("/api/patients/by-nfc/") and path.endswith("/"):
            nfc_id = unquote(path.removeprefix("/api/patients/by-nfc/").removesuffix("/"))
            patient = _find_patient_by_nfc(nfc_id)
            if patient is None:
                return self._send_json(
                    {"detail": f"No patient mapped to NFC tag '{nfc_id}'."},
                    status=404,
                )
            return self._send_json(patient)

        if path.startswith("/api/patients/") and path.endswith("/"):
            patient_id = unquote(path.removeprefix("/api/patients/").removesuffix("/"))
            if patient_id == "":
                return self._send_json(PATIENTS)
            patient = _find_patient_by_id(patient_id)
            if patient is None:
                return self._send_json(
                    {"detail": f"Patient '{patient_id}' not found."},
                    status=404,
                )
            return self._send_json(patient)

        return self._send_json({"detail": "Not found."}, status=404)

    def do_POST(self):
        if self.path != "/api/nfc/scan/":
            return self._send_json({"detail": "Not found."}, status=404)

        payload = self._read_json_body()
        if payload is None:
            return self._send_json({"detail": "Body must be valid JSON."}, status=400)

        tag_id = payload.get("tag_id")

        if not tag_id:
            patient = random.choice(PATIENTS)
            return self._send_json({"mode": "prototype-random", "patient": patient})

        patient = _find_patient_by_nfc(tag_id)
        if patient is None:
            return self._send_json(
                {"detail": f"No patient mapped to NFC tag '{tag_id}'."},
                status=404,
            )

        return self._send_json({"mode": "nfc-tag", "patient": patient})

    def log_message(self, format, *args):
        print(f"{self.command} {self.path} -> {format % args}")


def run():
    server = ThreadingHTTPServer((HOST, PORT), ApiHandler)
    print(f"API server running at http://{HOST}:{PORT}")
    print(f"Loaded {len(PATIENTS)} patients")
    server.serve_forever()


if __name__ == "__main__":
    run()
