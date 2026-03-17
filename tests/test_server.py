from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
from pathlib import Path
import unittest
from unittest import mock
from urllib.parse import parse_qs, urlparse


ROOT = Path(__file__).resolve().parents[1]


@unittest.skipUnless(
    importlib.util.find_spec("fastapi") and importlib.util.find_spec("fastapi.testclient"),
    "FastAPI server dependencies are not installed",
)
class ServerTests(unittest.TestCase):
    def _create_client(self, temp_dir: str):
        sys.path.insert(0, str(ROOT / "src"))
        try:
            from fastapi.testclient import TestClient
            from lawftune.server import create_app
        finally:
            sys.path.pop(0)

        return TestClient(create_app(Path(temp_dir)))

    def test_root_serves_html_ui(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            client = self._create_client(temp_dir)
            response = client.get("/")

            self.assertEqual(response.status_code, 200)
            self.assertIn("text/html", response.headers["content-type"])
            self.assertIn("lawftune gateway", response.text)
            self.assertTrue("/src/main.js" in response.text or "/assets/" in response.text)

    def test_frontend_javascript_asset_is_served(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            client = self._create_client(temp_dir)
            index_response = client.get("/")
            self.assertEqual(index_response.status_code, 200)

            html = index_response.text
            marker = 'src="'
            start = html.rfind(marker)
            self.assertNotEqual(start, -1)
            start += len(marker)
            end = html.find('"', start)
            self.assertNotEqual(end, -1)
            asset_path = html[start:end]

            response = client.get(asset_path)

            self.assertEqual(response.status_code, 200)
            self.assertIn("javascript", response.headers["content-type"])
            self.assertGreater(len(response.text), 100)

    def test_root_falls_back_when_no_frontend_is_available(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            from fastapi.testclient import TestClient
            import lawftune.server as server_module
        finally:
            sys.path.pop(0)

        with tempfile.TemporaryDirectory() as temp_dir:
            with mock.patch.object(server_module, "PACKAGE_FRONTEND_INDEX", Path("/nonexistent/index.html")):
                with mock.patch.object(server_module, "PACKAGE_FRONTEND_ASSETS_DIR", Path("/nonexistent/assets")):
                    with mock.patch.object(server_module, "SOURCE_FRONTEND_INDEX", Path("/nonexistent/source-index.html")):
                        with mock.patch.object(server_module, "FRONTEND_SRC_DIR", Path("/nonexistent/source-src")):
                            client = TestClient(server_module.create_app(Path(temp_dir)))
                            response = client.get("/")

            self.assertEqual(response.status_code, 200)
            self.assertIn("frontend UI is not bundled", response.text)

    def test_status_endpoint(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            client = self._create_client(temp_dir)
            response = client.get("/status")

            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json(), {"name": "lawftune", "status": "running"})

    def test_config_endpoint_hides_api_key(self) -> None:
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

            client = self._create_client(temp_dir)
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
        with tempfile.TemporaryDirectory() as temp_dir:
            client = self._create_client(temp_dir)
            response = client.get("/healthz")

            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json(), {"status": "ok"})

    def test_fine_tuning_subrouter_is_served_locally(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            client = self._create_client(temp_dir)
            response = client.get("/v1/fine_tuning/")

            self.assertEqual(response.status_code, 200)
            self.assertEqual(
                response.json(),
                {
                    "name": "lawftune fine_tuning",
                    "status": "ready",
                },
            )

    def test_v1_proxy_forwards_to_configured_vllm_endpoint(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            from fastapi.testclient import TestClient
            import lawftune.server as server_module
        finally:
            sys.path.pop(0)

        class DummyResponse:
            def __init__(self) -> None:
                self.content = b'{"ok":true}'
                self.status_code = 200
                self.headers = {"content-type": "application/json"}

        captured_request: dict[str, object] = {}

        class DummyAsyncClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

            async def request(self, **kwargs):
                captured_request.update(kwargs)
                return DummyResponse()

        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "config.json"
            config_path.write_text(
                json.dumps(
                    {
                        "vllm_endpoint": "http://localhost:8000/base/",
                        "api_key": "secret-key",
                    }
                ),
                encoding="utf-8",
            )

            with mock.patch.object(server_module.httpx, "AsyncClient", return_value=DummyAsyncClient()):
                client = TestClient(server_module.create_app(Path(temp_dir)))
                response = client.post(
                    "/v1/chat/completions?stream=false",
                    headers={"content-type": "application/json"},
                    json={"messages": [{"role": "user", "content": "hello"}]},
                )

            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json(), {"ok": True})
            self.assertEqual(captured_request["method"], "POST")
            parsed_url = urlparse(str(captured_request["url"]))
            self.assertEqual(parsed_url.scheme, "http")
            self.assertEqual(parsed_url.netloc, "localhost:8000")
            self.assertEqual(parsed_url.path, "/base/v1/chat/completions")
            self.assertEqual(parse_qs(parsed_url.query), {"stream": ["false"]})
            self.assertEqual(captured_request["headers"]["authorization"], "Bearer secret-key")


if __name__ == "__main__":
    unittest.main()
