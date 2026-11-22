"""Local stand-in for Google's JWKS endpoint.

Used ONLY to prove the Google sign-in path end to end where there is no outbound
internet to Google (sandbox / CI). Point the API at it with
GOOGLE_JWKS_URL=http://127.0.0.1:8100/jwks.json and run this with
CARGEOX_TEST_N set to the test modulus printed by tools/verify_entry_paths.py.

The API is pointed at it with GOOGLE_JWKS_URL; the tokens are signed by the
private key it publishes, and the API still runs every real check —
RS256 signature, kid lookup, issuer, audience and expiry.
"""
import json
import os
import sys

if not os.environ.get("CARGEOX_TEST_N"):
    import subprocess
    here = os.path.dirname(os.path.abspath(__file__))
    os.environ["CARGEOX_TEST_N"] = subprocess.run(
        [sys.executable, os.path.join(here, "verify_entry_paths.py")],
        capture_output=True, text=True, env={**os.environ, "PRINT_TEST_N": "1"},
    ).stdout.strip()
    if not os.environ["CARGEOX_TEST_N"]:
        raise SystemExit("could not obtain the test modulus")

N = int(os.environ["CARGEOX_TEST_N"])
E = 65537
PORT = int(os.environ.get("JWKS_PORT", "8100"))

jwks = {"keys": [{"kid": "cargox-e2e-kid", "kty": "RSA", "alg": "RS256", "use": "sig",
                  "n": "", "e": ""}]}


def b64u(raw: int) -> str:
    import base64
    data = raw.to_bytes((raw.bit_length() + 7) // 8, "big")
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


jwks["keys"][0]["n"] = b64u(N)
jwks["keys"][0]["e"] = b64u(E)
body = json.dumps(jwks).encode()

from http.server import BaseHTTPRequestHandler, HTTPServer  # noqa: E402


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


print(f"jwks stand-in on :{PORT}")
HTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
