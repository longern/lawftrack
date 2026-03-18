from __future__ import annotations

import importlib.util
import json
import os
import sys
import tempfile
from pathlib import Path
import unittest
from unittest import mock
from urllib.parse import parse_qs, urlparse


ROOT = Path(__file__).resolve().parents[1]


@unittest.skipUnless(
    importlib.util.find_spec("fastapi")
    and importlib.util.find_spec("fastapi.testclient"),
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
            self.assertTrue(
                "/src/main.js" in response.text or "/assets/" in response.text
            )

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
            with mock.patch.object(
                server_module, "PACKAGE_FRONTEND_INDEX", Path("/nonexistent/index.html")
            ):
                with mock.patch.object(
                    server_module,
                    "PACKAGE_FRONTEND_ASSETS_DIR",
                    Path("/nonexistent/assets"),
                ):
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
                        "vllm_endpoint": "http://localhost:8000/v1",
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
                    "vllm_endpoint": "http://localhost:8000/v1",
                    "has_api_key": True,
                },
            )

    def test_healthz_endpoint(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            client = self._create_client(temp_dir)
            response = client.get("/healthz")

            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json(), {"status": "ok"})

    def test_default_cors_regex_allows_localhost_with_any_port(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            import lawftune.server as server_module
        finally:
            sys.path.pop(0)

        with mock.patch.dict(os.environ, {}, clear=False):
            options = server_module.build_cors_middleware_options()

        self.assertEqual(
            options["allow_origin_regex"],
            r"^https?://(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$",
        )
        self.assertNotIn("allow_origins", options)

    def test_cors_origins_can_be_overridden_by_environment(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            import lawftune.server as server_module
        finally:
            sys.path.pop(0)

        with mock.patch.dict(
            os.environ,
            {
                "LAWFTUNE_CORS_ALLOW_ORIGINS": "http://10.0.0.8:4173,https://lab.example.com"
            },
            clear=False,
        ):
            options = server_module.build_cors_middleware_options()

        self.assertEqual(
            options["allow_origins"],
            ["http://10.0.0.8:4173", "https://lab.example.com"],
        )
        self.assertNotIn("allow_origin_regex", options)

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

    def test_create_list_retrieve_and_cancel_fine_tuning_job(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            from fastapi.testclient import TestClient
            import lawftune.api.fine_tuning_jobs as jobs_module
            import lawftune.server as server_module
        finally:
            sys.path.pop(0)

        class DummyPopen:
            def __init__(self, *args, **kwargs) -> None:
                self.args = args
                self.kwargs = kwargs
                self.pid = 4242

        with tempfile.TemporaryDirectory() as temp_dir:
            with mock.patch.object(jobs_module.subprocess, "Popen", DummyPopen):
                with mock.patch.object(
                    jobs_module, "process_is_running", return_value=True
                ):
                    with mock.patch.object(jobs_module.os, "kill") as mocked_kill:
                        client = TestClient(server_module.create_app(Path(temp_dir)))
                        training_file = client.post(
                            "/v1/files",
                            data={"purpose": "fine-tune"},
                            files={
                                "file": (
                                    "train.jsonl",
                                    b'{"messages": []}\n',
                                    "application/jsonl",
                                )
                            },
                        ).json()
                        validation_file = client.post(
                            "/v1/files",
                            data={"purpose": "fine-tune"},
                            files={
                                "file": (
                                    "valid.jsonl",
                                    b'{"messages": []}\n',
                                    "application/jsonl",
                                )
                            },
                        ).json()

                        create_response = client.post(
                            "/v1/fine_tuning/jobs",
                            json={
                                "model": "Qwen/Qwen2.5-7B-Instruct",
                                "training_file": training_file["id"],
                                "validation_file": validation_file["id"],
                                "suffix": "legal-draft",
                                "metadata": {"dataset": "civil"},
                            },
                        )

                        self.assertEqual(create_response.status_code, 200)
                        created_job = create_response.json()
                        self.assertEqual(created_job["object"], "fine_tuning.job")
                        self.assertEqual(created_job["status"], "running")
                        self.assertEqual(created_job["training_file"], training_file["id"])
                        self.assertEqual(
                            created_job["validation_file"], validation_file["id"]
                        )
                        self.assertEqual(created_job["suffix"], "legal-draft")
                        self.assertEqual(created_job["metadata"], {"dataset": "civil"})
                        self.assertEqual(created_job["process"]["pid"], 4242)

                        job_path = (
                            Path(temp_dir)
                            / "fine_tuning"
                            / "jobs"
                            / created_job["id"]
                            / "job.json"
                        )
                        self.assertTrue(job_path.exists())

                        list_response = client.get("/v1/fine_tuning/jobs")
                        self.assertEqual(list_response.status_code, 200)
                        list_payload = list_response.json()
                        self.assertEqual(list_payload["object"], "list")
                        self.assertFalse(list_payload["has_more"])
                        self.assertEqual(len(list_payload["data"]), 1)
                        self.assertEqual(
                            list_payload["data"][0]["id"], created_job["id"]
                        )

                        retrieve_response = client.get(
                            f"/v1/fine_tuning/jobs/{created_job['id']}"
                        )
                        self.assertEqual(retrieve_response.status_code, 200)
                        self.assertEqual(
                            retrieve_response.json()["id"], created_job["id"]
                        )

                        cancel_response = client.post(
                            f"/v1/fine_tuning/jobs/{created_job['id']}/cancel"
                        )
                        self.assertEqual(cancel_response.status_code, 200)
                        cancelled_job = cancel_response.json()
                        self.assertEqual(cancelled_job["status"], "cancelled")
                        self.assertIsNotNone(cancelled_job["finished_at"])
                        mocked_kill.assert_called_once_with(
                            4242, jobs_module.signal.SIGTERM
                        )

    def test_create_job_normalizes_supported_method(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            from fastapi.testclient import TestClient
            import lawftune.api.fine_tuning_jobs as jobs_module
            import lawftune.server as server_module
        finally:
            sys.path.pop(0)

        class DummyPopen:
            def __init__(self, *args, **kwargs) -> None:
                self.pid = 4343

        with tempfile.TemporaryDirectory() as temp_dir:
            with mock.patch.object(jobs_module.subprocess, "Popen", DummyPopen):
                client = TestClient(server_module.create_app(Path(temp_dir)))
                training_file = client.post(
                    "/v1/files",
                    data={"purpose": "fine-tune"},
                    files={
                        "file": (
                            "train.jsonl",
                            b'{"messages": []}\n',
                            "application/jsonl",
                        )
                    },
                ).json()
                response = client.post(
                    "/v1/fine_tuning/jobs",
                    json={
                        "model": "Qwen/Qwen2.5-7B-Instruct",
                        "training_file": training_file["id"],
                        "method": {"type": "supervised"},
                    },
                )

            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["method"]["type"], "sft")

    def test_create_job_rejects_unknown_training_file(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            client = self._create_client(temp_dir)
            response = client.post(
                "/v1/fine_tuning/jobs",
                json={
                    "model": "Qwen/Qwen2.5-7B-Instruct",
                    "training_file": "file-missing",
                },
            )

            self.assertEqual(response.status_code, 400)
            self.assertIn("training_file must reference an uploaded file id", response.json()["detail"])

    def test_create_job_rejects_unknown_method(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            client = self._create_client(temp_dir)
            response = client.post(
                "/v1/fine_tuning/jobs",
                json={
                    "model": "Qwen/Qwen2.5-7B-Instruct",
                    "training_file": "dataset-name",
                    "method": {"type": "unknown"},
                },
            )

            self.assertEqual(response.status_code, 400)
            self.assertIn("Unsupported fine-tuning method", response.json()["detail"])

    def test_files_api_supports_upload_list_retrieve_content_and_delete(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            client = self._create_client(temp_dir)

            upload_response = client.post(
                "/v1/files",
                data={"purpose": "fine-tune"},
                files={
                    "file": ("train.jsonl", b'{"messages": []}\n', "application/jsonl")
                },
            )

            self.assertEqual(upload_response.status_code, 200)
            created_file = upload_response.json()
            self.assertEqual(created_file["object"], "file")
            self.assertEqual(created_file["filename"], "train.jsonl")
            self.assertEqual(created_file["purpose"], "fine-tune")
            self.assertEqual(created_file["bytes"], len(b'{"messages": []}\n'))

            list_response = client.get("/v1/files")
            self.assertEqual(list_response.status_code, 200)
            list_payload = list_response.json()
            self.assertEqual(list_payload["object"], "list")
            self.assertEqual(len(list_payload["data"]), 1)
            self.assertEqual(list_payload["data"][0]["id"], created_file["id"])

            retrieve_response = client.get(f"/v1/files/{created_file['id']}")
            self.assertEqual(retrieve_response.status_code, 200)
            self.assertEqual(retrieve_response.json()["id"], created_file["id"])

            content_response = client.get(f"/v1/files/{created_file['id']}/content")
            self.assertEqual(content_response.status_code, 200)
            self.assertEqual(content_response.content, b'{"messages": []}\n')

            delete_response = client.delete(f"/v1/files/{created_file['id']}")
            self.assertEqual(delete_response.status_code, 200)
            self.assertEqual(
                delete_response.json(),
                {
                    "id": created_file["id"],
                    "object": "file",
                    "deleted": True,
                },
            )

    def test_retrieve_unknown_file_returns_404(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            client = self._create_client(temp_dir)
            response = client.get("/v1/files/file-missing")

            self.assertEqual(response.status_code, 404)
            self.assertIn("File not found", response.json()["detail"])

    def test_retrieve_unknown_fine_tuning_job_returns_404(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            client = self._create_client(temp_dir)
            response = client.get("/v1/fine_tuning/jobs/ftjob-missing")

            self.assertEqual(response.status_code, 404)
            self.assertIn("Fine-tuning job not found", response.json()["detail"])

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

            with mock.patch.object(
                server_module.httpx, "AsyncClient", return_value=DummyAsyncClient()
            ):
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
            self.assertEqual(parsed_url.path, "/base/chat/completions")
            self.assertEqual(parse_qs(parsed_url.query), {"stream": ["false"]})
            self.assertEqual(
                captured_request["headers"]["authorization"], "Bearer secret-key"
            )


if __name__ == "__main__":
    unittest.main()
