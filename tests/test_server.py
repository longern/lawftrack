from __future__ import annotations

import importlib.util
import json
import os
import sys
import tempfile
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


@unittest.skipUnless(
    importlib.util.find_spec("fastapi") and importlib.util.find_spec("fastapi.testclient"),
    "FastAPI server dependencies are not installed",
)
class ServerTests(unittest.TestCase):
    def test_config_endpoint_hides_api_key(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            from fastapi.testclient import TestClient
            from lawftune.server import create_app
        finally:
            sys.path.pop(0)

        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "config.json"
            config_path.write_text(
                json.dumps(
                    {
                        "vllm_endpoint": "http://localhost:8000",
                        "api_key": "secret",
                    }
                ),
                encoding="utf-8",
            )

            client = TestClient(create_app(Path(temp_dir)))
            response = client.get("/config")

            self.assertEqual(response.status_code, 200)
            self.assertEqual(
                response.json(),
                {
                    "vllm_endpoint": "http://localhost:8000",
                    "has_api_key": True,
                },
            )

    def test_healthz_endpoint(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            from fastapi.testclient import TestClient
            from lawftune.server import create_app
        finally:
            sys.path.pop(0)

        with tempfile.TemporaryDirectory() as temp_dir:
            client = TestClient(create_app(Path(temp_dir)))
            response = client.get("/healthz")

            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json(), {"status": "ok"})


if __name__ == "__main__":
    unittest.main()
