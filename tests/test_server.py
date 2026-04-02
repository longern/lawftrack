from __future__ import annotations

import importlib.util
import json
import os
import sys
import tempfile
from pathlib import Path
import unittest
from unittest import mock
from urllib.parse import urlparse


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
            from lawftrack.server import create_app
        finally:
            sys.path.pop(0)

        return TestClient(create_app(Path(temp_dir)))

    def test_root_serves_html_ui(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            client = self._create_client(temp_dir)
            response = client.get("/")

            self.assertEqual(response.status_code, 200)
            self.assertIn("text/html", response.headers["content-type"])
            self.assertIn("lawftrack console", response.text)
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
            import lawftrack.server as server_module
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
            payload = response.json()
            self.assertEqual(payload["name"], "lawftrack")
            self.assertEqual(payload["status"], "running")
            self.assertIn("hostname", payload)
            self.assertIn("operating_system", payload)
            self.assertIn("architecture", payload)
            self.assertIn("cpu_threads", payload)
            self.assertIn("python_version", payload)
            self.assertIn("gpus", payload)
            self.assertIsInstance(payload["gpus"], list)

    def test_query_gpu_metrics_parses_nvidia_smi_output(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            import lawftrack.server as server_module
        finally:
            sys.path.pop(0)

        mocked_result = mock.Mock(
            stdout="NVIDIA GeForce RTX 4090, 24564, 10240, 14324, 72, 61\n"
        )

        with mock.patch.object(server_module.subprocess, "run", return_value=mocked_result):
            self.assertEqual(
                server_module.query_gpu_metrics(),
                [
                    {
                        "index": 0,
                        "name": "NVIDIA GeForce RTX 4090",
                        "memory_total_mb": 24564,
                        "memory_used_mb": 10240,
                        "memory_free_mb": 14324,
                        "utilization_gpu_percent": 72,
                        "temperature_celsius": 61,
                    }
                ],
            )

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

    def test_dataset_can_be_deleted(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            client = self._create_client(temp_dir)

            create_response = client.post(
                "/api/datasets",
                json={
                    "name": "delete-me",
                    "base_model": "Qwen/Qwen2.5-7B-Instruct",
                },
            )
            self.assertEqual(create_response.status_code, 200)
            dataset = create_response.json()

            delete_response = client.delete(f"/api/datasets/{dataset['id']}")
            self.assertEqual(delete_response.status_code, 200)
            self.assertEqual(
                delete_response.json(),
                {
                    "id": dataset["id"],
                    "object": "dataset.deleted",
                    "deleted": True,
                },
            )

            retrieve_response = client.get(f"/api/datasets/{dataset['id']}")
            self.assertEqual(retrieve_response.status_code, 404)

            list_response = client.get("/api/datasets")
            self.assertEqual(list_response.status_code, 200)
            self.assertEqual(list_response.json()["data"], [])

    def test_default_cors_regex_allows_localhost_with_any_port(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            import lawftrack.server as server_module
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
            import lawftrack.server as server_module
        finally:
            sys.path.pop(0)

        with mock.patch.dict(
            os.environ,
            {
                "LAWFTRACK_CORS_ALLOW_ORIGINS": "http://10.0.0.8:4173,https://lab.example.com"
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
                    "name": "lawftrack fine_tuning",
                    "status": "ready",
                },
            )

    def test_create_list_retrieve_and_cancel_fine_tuning_job(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            from fastapi.testclient import TestClient
            import lawftrack.api.fine_tuning_jobs as jobs_module
            import lawftrack.server as server_module
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
            import lawftrack.api.fine_tuning_jobs as jobs_module
            import lawftrack.server as server_module
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

    def test_datasets_api_persists_base_model_in_yaml_and_supports_update(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            client = self._create_client(temp_dir)
            create_response = client.post(
                "/api/datasets",
                json={
                    "name": "civil-cases",
                    "base_model": "Qwen/Qwen2.5-7B-Instruct",
                },
            )

            self.assertEqual(create_response.status_code, 200)
            created_dataset = create_response.json()
            self.assertEqual(created_dataset["name"], "civil-cases")
            self.assertEqual(created_dataset["base_model"], "Qwen/Qwen2.5-7B-Instruct")
            self.assertNotIn("training_file_id", created_dataset)
            self.assertNotIn("training_filename", created_dataset)

            dataset_yaml_path = (
                Path(temp_dir)
                / "datasets"
                / created_dataset["id"]
                / "dataset.yaml"
            )
            self.assertTrue(dataset_yaml_path.is_file())
            yaml_text = dataset_yaml_path.read_text(encoding="utf-8")
            self.assertIn("base_model: Qwen/Qwen2.5-7B-Instruct", yaml_text)

            update_response = client.patch(
                f"/api/datasets/{created_dataset['id']}",
                json={"base_model": "/models/qwen-7b-local"},
            )
            self.assertEqual(update_response.status_code, 200)
            self.assertEqual(update_response.json()["base_model"], "/models/qwen-7b-local")

            list_response = client.get("/api/datasets")
            self.assertEqual(list_response.status_code, 200)
            list_payload = list_response.json()
            self.assertEqual(list_payload["object"], "list")
            self.assertEqual(len(list_payload["data"]), 1)
            self.assertEqual(list_payload["data"][0]["id"], created_dataset["id"])

    def test_dataset_names_must_be_unique_when_creating_or_renaming(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            client = self._create_client(temp_dir)

            first_dataset = client.post(
                "/api/datasets",
                json={"name": "dataset-1", "base_model": "Qwen/Qwen2.5-7B-Instruct"},
            ).json()
            second_dataset = client.post(
                "/api/datasets",
                json={"name": "dataset-2", "base_model": "Qwen/Qwen2.5-7B-Instruct"},
            ).json()

            duplicate_create = client.post(
                "/api/datasets",
                json={"name": "Dataset-1", "base_model": "Qwen/Qwen2.5-7B-Instruct"},
            )
            self.assertEqual(duplicate_create.status_code, 409)
            self.assertEqual(
                duplicate_create.json()["detail"],
                "Dataset name already exists: Dataset-1",
            )

            duplicate_rename = client.patch(
                f"/api/datasets/{second_dataset['id']}",
                json={"name": " dataset-1 "},
            )
            self.assertEqual(duplicate_rename.status_code, 409)
            self.assertEqual(
                duplicate_rename.json()["detail"],
                "Dataset name already exists: dataset-1",
            )

            unchanged_name = client.patch(
                f"/api/datasets/{first_dataset['id']}",
                json={"name": "dataset-1"},
            )
            self.assertEqual(unchanged_name.status_code, 200)
            self.assertEqual(unchanged_name.json()["name"], "dataset-1")

    def test_datasets_api_imports_yaml_and_jsonl_files(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            client = self._create_client(temp_dir)

            yaml_response = client.post(
                "/api/datasets/import",
                files={
                    "file": (
                        "dataset.yaml",
                        b"name: imported-yaml\nbase_model: Qwen/Qwen2.5-7B-Instruct\n",
                        "application/x-yaml",
                    )
                },
            )
            self.assertEqual(yaml_response.status_code, 200)
            yaml_dataset = yaml_response.json()
            self.assertEqual(yaml_dataset["name"], "imported-yaml")
            self.assertEqual(yaml_dataset["base_model"], "Qwen/Qwen2.5-7B-Instruct")
            self.assertNotIn("training_file_id", yaml_dataset)

            jsonl_response = client.post(
                "/api/datasets/import",
                files={
                    "file": (
                        "train.jsonl",
                        b'{"messages":[{"role":"user","content":"hi"},{"role":"assistant","content":"hello"}],"anchors":[{"message_index":1,"token_index":0,"replacement_token":"hello"}]}\n',
                        "application/jsonl",
                    )
                },
            )
            self.assertEqual(jsonl_response.status_code, 200)
            jsonl_dataset = jsonl_response.json()
            self.assertEqual(jsonl_dataset["name"], "train")
            self.assertIsNone(jsonl_dataset["base_model"])
            self.assertNotIn("training_file_id", jsonl_dataset)
            self.assertNotIn("training_filename", jsonl_dataset)
            self.assertEqual(jsonl_dataset["sample_count"], 1)
            samples_response = client.get(f"/api/datasets/{jsonl_dataset['id']}/samples")
            self.assertEqual(samples_response.status_code, 200)
            imported_sample = samples_response.json()["data"][0]
            self.assertEqual(imported_sample["anchors"][0]["message_index"], 1)
            self.assertEqual(imported_sample["anchors"][0]["token_index"], 0)
            self.assertEqual(imported_sample["anchors"][0]["replacement_token"], "hello")

    def test_datasets_api_imports_prompt_completion_anchor_schema(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            client = self._create_client(temp_dir)

            response = client.post(
                "/api/datasets/import",
                files={
                    "file": (
                        "train.jsonl",
                        (
                            b'{"prompt":[{"role":"user","content":"\xe4\xbd\xa0\xe5\xa5\xbd"}],"completion":[{"role":"assistant","content":"\xe6\x82\xa8\xe5\xa5\xbd"}],"anchors":[{"token_index":0,"replacement_token":"\xe6\x82\xa8\xe5\xa5\xbd"}]}\n'
                        ),
                        "application/jsonl",
                    )
                },
            )
            self.assertEqual(response.status_code, 200)
            dataset = response.json()

            samples_response = client.get(f"/api/datasets/{dataset['id']}/samples")
            self.assertEqual(samples_response.status_code, 200)
            sample = samples_response.json()["data"][0]
            self.assertEqual(sample["messages"][0]["role"], "user")
            self.assertEqual(sample["messages"][1]["role"], "assistant")
            self.assertEqual(sample["messages"][1]["content"], "您好")
            self.assertEqual(sample["anchors"][0]["token_index"], 0)
            self.assertEqual(sample["anchors"][0]["replacement_token"], "您好")

    def test_dataset_export_training_file_builds_method_specific_jsonl(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            client = self._create_client(temp_dir)
            created_dataset = client.post(
                "/api/datasets",
                json={"name": "exportable", "base_model": "Qwen/Qwen2.5-7B-Instruct"},
            ).json()

            client.post(
                f"/api/datasets/{created_dataset['id']}/samples",
                json={
                    "title": "multi-turn sample",
                    "messages": [
                        {"role": "user", "content": "question-1"},
                        {"role": "assistant", "content": "answer-1"},
                        {"role": "user", "content": "question-2"},
                        {"role": "assistant", "content": "answer-2"},
                    ],
                    "anchors": [
                        {
                            "message_index": 1,
                            "token_index": 0,
                            "replacement_token": "rewrite-1",
                        },
                        {
                            "message_index": 3,
                            "token_index": 1,
                            "replacement_token": "rewrite-2",
                        },
                    ],
                },
            )

            sft_response = client.post(
                f"/api/datasets/{created_dataset['id']}/training_file",
                json={"method": {"type": "sft"}},
            )
            self.assertEqual(sft_response.status_code, 200)
            sft_export = sft_response.json()
            self.assertEqual(sft_export["method"], "sft")
            self.assertEqual(sft_export["record_count"], 1)
            sft_content = client.get(
                f"/v1/files/{sft_export['file']['id']}/content"
            ).content.decode("utf-8")
            self.assertEqual(len([line for line in sft_content.splitlines() if line.strip()]), 1)
            sft_record = json.loads(sft_content.splitlines()[0])
            self.assertIn("messages", sft_record)
            self.assertNotIn("anchors", sft_record)

            lawf_response = client.post(
                f"/api/datasets/{created_dataset['id']}/training_file",
                json={"method": {"type": "lawf"}},
            )
            self.assertEqual(lawf_response.status_code, 200)
            lawf_export = lawf_response.json()
            self.assertEqual(lawf_export["method"], "lawf")
            self.assertEqual(lawf_export["record_count"], 2)
            lawf_content = client.get(
                f"/v1/files/{lawf_export['file']['id']}/content"
            ).content.decode("utf-8")
            lawf_records = [
                json.loads(line)
                for line in lawf_content.splitlines()
                if line.strip()
            ]
            self.assertEqual(len(lawf_records), 2)
            self.assertIn("prompt", lawf_records[0])
            self.assertNotIn("messages", lawf_records[0])
            self.assertNotIn("completion_message_index", lawf_records[0])
            self.assertEqual(lawf_records[0]["completion"][0]["content"], "answer-1")
            self.assertEqual(lawf_records[0]["anchors"][0]["token_index"], 0)
            self.assertEqual(lawf_records[1]["completion"][0]["content"], "answer-2")
            self.assertEqual(lawf_records[1]["anchors"][0]["token_index"], 1)

    def test_dataset_export_training_file_preserves_tools_and_tool_calls(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            client = self._create_client(temp_dir)
            created_dataset = client.post(
                "/api/datasets",
                json={"name": "tool-export", "base_model": "Qwen/Qwen2.5-7B-Instruct"},
            ).json()

            create_response = client.post(
                f"/api/datasets/{created_dataset['id']}/samples",
                json={
                    "title": "tool sample",
                    "tools": [
                        {
                            "type": "function",
                            "function": {
                                "name": "search_docs",
                                "description": "Search docs",
                                "parameters": {
                                    "type": "object",
                                    "properties": {"query": {"type": "string"}},
                                },
                            },
                        }
                    ],
                    "messages": [
                        {"role": "user", "content": "Find the contract clause."},
                        {
                            "role": "assistant",
                            "content": "I will search the docs.",
                            "tool_calls": [
                                {
                                    "id": "call-search-1",
                                    "type": "function",
                                    "function": {
                                        "name": "search_docs",
                                        "arguments": "{\"query\":\"contract clause\"}",
                                    },
                                }
                            ],
                        },
                        {
                            "role": "tool",
                            "content": "Found clause 9.",
                            "tool_call_id": "call-search-1",
                            "name": "search_docs",
                        },
                        {"role": "assistant", "content": "Clause 9 is the relevant section."},
                    ],
                },
            )
            self.assertEqual(create_response.status_code, 200)

            sft_response = client.post(
                f"/api/datasets/{created_dataset['id']}/training_file",
                json={"method": {"type": "sft"}},
            )
            self.assertEqual(sft_response.status_code, 200)
            sft_export = sft_response.json()
            sft_content = client.get(
                f"/v1/files/{sft_export['file']['id']}/content"
            ).content.decode("utf-8")
            sft_record = json.loads(sft_content.splitlines()[0])
            self.assertEqual(sft_record["tools"][0]["function"]["name"], "search_docs")
            self.assertEqual(
                sft_record["messages"][1]["tool_calls"][0]["function"]["name"],
                "search_docs",
            )
            self.assertEqual(sft_record["messages"][2]["tool_call_id"], "call-search-1")

            lawf_response = client.post(
                f"/api/datasets/{created_dataset['id']}/training_file",
                json={"method": {"type": "lawf"}},
            )
            self.assertEqual(lawf_response.status_code, 200)
            lawf_export = lawf_response.json()
            lawf_content = client.get(
                f"/v1/files/{lawf_export['file']['id']}/content"
            ).content.decode("utf-8")
            lawf_records = [
                json.loads(line)
                for line in lawf_content.splitlines()
                if line.strip()
            ]
            self.assertEqual(lawf_records[0]["tools"][0]["function"]["name"], "search_docs")
            self.assertEqual(
                lawf_records[0]["completion"][0]["tool_calls"][0]["id"],
                "call-search-1",
            )

    def test_dataset_import_and_export_round_trip_uses_same_json_format(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            client = self._create_client(temp_dir)

            imported = client.post(
                "/api/datasets/import",
                files={
                    "file": (
                        "session.json",
                        json.dumps(
                            {
                                "entries": [
                                    {
                                        "request": {
                                            "tools": [
                                                {
                                                    "name": "Read",
                                                    "description": "Read a file",
                                                    "input_schema": {
                                                        "type": "object",
                                                        "properties": {
                                                            "path": {"type": "string"}
                                                        },
                                                    },
                                                }
                                            ],
                                            "messages": [
                                                {
                                                    "role": "user",
                                                    "content": [
                                                        {"type": "text", "text": "Inspect README"}
                                                    ],
                                                },
                                                {
                                                    "role": "assistant",
                                                    "content": [
                                                        {
                                                            "type": "thinking",
                                                            "thinking": "Need to inspect the file.",
                                                        },
                                                        {
                                                            "type": "text",
                                                            "text": "Let me check the README.",
                                                        },
                                                        {
                                                            "type": "tool_use",
                                                            "id": "toolu-read-1",
                                                            "name": "Read",
                                                            "input": {"path": "README.md"},
                                                        },
                                                    ],
                                                },
                                                {
                                                    "role": "user",
                                                    "content": [
                                                        {
                                                            "type": "tool_result",
                                                            "tool_use_id": "toolu-read-1",
                                                            "content": "README content",
                                                        }
                                                    ],
                                                },
                                            ],
                                        },
                                        "response": {
                                            "choices": [
                                                {
                                                    "message": {
                                                        "role": "assistant",
                                                        "content": "README inspected.",
                                                        "reasoning_content": "The file was loaded successfully.",
                                                        "tool_calls": [
                                                            {
                                                                "id": "call-finish-1",
                                                                "type": "function",
                                                                "function": {
                                                                    "name": "Write",
                                                                    "arguments": "{\"path\":\"notes.txt\"}",
                                                                },
                                                            }
                                                        ],
                                                    }
                                                }
                                            ]
                                        },
                                    }
                                ]
                            },
                            ensure_ascii=False,
                        ).encode("utf-8"),
                        "application/json",
                    )
                },
            )
            self.assertEqual(imported.status_code, 200)
            dataset = imported.json()

            samples_response = client.get(f"/api/datasets/{dataset['id']}/samples")
            self.assertEqual(samples_response.status_code, 200)
            sample = samples_response.json()["data"][0]
            self.assertEqual(sample["tools"][0]["function"]["name"], "Read")
            self.assertEqual(sample["messages"][0]["role"], "user")
            self.assertEqual(sample["messages"][1]["tool_calls"][0]["id"], "toolu-read-1")
            self.assertEqual(sample["messages"][2]["role"], "tool")
            self.assertEqual(sample["messages"][2]["tool_call_id"], "toolu-read-1")
            self.assertEqual(sample["messages"][3]["tool_calls"][0]["id"], "call-finish-1")

            export_response = client.post(f"/api/datasets/{dataset['id']}/export")
            self.assertEqual(export_response.status_code, 200)
            exported = export_response.json()
            self.assertEqual(exported["object"], "dataset.export")
            self.assertEqual(exported["sample_count"], 1)
            self.assertTrue(exported["file"]["filename"].endswith(".json"))

            export_content = client.get(
                f"/v1/files/{exported['file']['id']}/content"
            ).content.decode("utf-8")
            exported_payload = json.loads(export_content)
            self.assertEqual(exported_payload["name"], dataset["name"])
            self.assertIn("samples", exported_payload)
            self.assertEqual(exported_payload["samples"][0]["tools"][0]["function"]["name"], "Read")
            self.assertEqual(
                exported_payload["samples"][0]["messages"][1]["tool_calls"][0]["id"],
                "toolu-read-1",
            )

            reimported = client.post(
                "/api/datasets/import",
                files={
                    "file": (
                        "roundtrip.json",
                        export_content.encode("utf-8"),
                        "application/json",
                    )
                },
            )
            self.assertEqual(reimported.status_code, 200)
            reimported_dataset = reimported.json()
            reimported_samples = client.get(
                f"/api/datasets/{reimported_dataset['id']}/samples"
            ).json()["data"]
            self.assertEqual(reimported_samples[0]["tools"][0]["function"]["name"], "Read")
            self.assertEqual(
                reimported_samples[0]["messages"][1]["tool_calls"][0]["id"],
                "toolu-read-1",
            )

    def test_exported_dataset_file_can_be_used_for_fine_tuning_job(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            import lawftrack.api.fine_tuning_jobs as jobs_module
        finally:
            sys.path.pop(0)

        class DummyPopen:
            def __init__(self, *args, **kwargs) -> None:
                self.pid = 5252

        with tempfile.TemporaryDirectory() as temp_dir:
            with mock.patch.object(jobs_module.subprocess, "Popen", DummyPopen):
                client = self._create_client(temp_dir)
                created_dataset = client.post(
                    "/api/datasets",
                    json={"name": "job-source", "base_model": "Qwen/Qwen2.5-7B-Instruct"},
                ).json()
                client.post(
                    f"/api/datasets/{created_dataset['id']}/samples",
                    json={
                        "messages": [
                            {"role": "user", "content": "job-question"},
                            {"role": "assistant", "content": "job-answer"},
                        ],
                    },
                )

                export_response = client.post(
                    f"/api/datasets/{created_dataset['id']}/training_file",
                    json={"method": {"type": "lawf"}},
                )
                self.assertEqual(export_response.status_code, 200)
                exported_file = export_response.json()["file"]

                job_response = client.post(
                    "/v1/fine_tuning/jobs",
                    json={
                        "model": "Qwen/Qwen2.5-7B-Instruct",
                        "training_file": exported_file["id"],
                        "method": {"type": "lawf"},
                    },
                )

            self.assertEqual(job_response.status_code, 200)
            self.assertEqual(job_response.json()["training_file"], exported_file["id"])
            self.assertEqual(job_response.json()["method"]["type"], "lawf")

    def test_fine_tuning_job_events_checkpoints_and_logs_are_available(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            client = self._create_client(temp_dir)
            job_dir = Path(temp_dir) / "fine_tuning" / "jobs" / "ftjob-demo"
            job_dir.mkdir(parents=True, exist_ok=True)
            (job_dir / "job.json").write_text(
                json.dumps(
                    {
                        "id": "ftjob-demo",
                        "object": "fine_tuning.job",
                        "created_at": 1000,
                        "error": None,
                        "estimated_finish": None,
                        "fine_tuned_model": "demo-adapter",
                        "finished_at": None,
                        "hyperparameters": {},
                        "integrations": [],
                        "metadata": {},
                        "method": {"type": "lawf"},
                        "model": "Qwen/Qwen2.5-7B-Instruct",
                        "organization_id": "org-lawftrack",
                        "result_files": [],
                        "seed": None,
                        "status": "running",
                        "trained_tokens": None,
                        "training_file": "file-training",
                        "validation_file": None,
                        "suffix": None,
                        "lora_adapter": None,
                        "process": {"pid": None, "started_at": 1000, "exit_code": None},
                    }
                ),
                encoding="utf-8",
            )
            (job_dir / "stdout.log").write_text(
                "{'loss': 1.25, 'learning_rate': 5e-05, 'epoch': 1.0}\nstep: 2 loss: 0.92\ntraining finished\n",
                encoding="utf-8",
            )
            (job_dir / "stderr.log").write_text(
                "warning: fallback tokenizer path\n",
                encoding="utf-8",
            )

            events_response = client.get("/api/fine_tuning/jobs/ftjob-demo/events")
            self.assertEqual(events_response.status_code, 200)
            events = events_response.json()["data"]
            self.assertEqual(events[0]["object"], "fine_tuning.job.event")
            metrics_event = next(
                event for event in events if event["data"]["type"] == "metrics"
            )
            self.assertEqual(metrics_event["data"]["metrics"]["train_loss"], 1.25)

            checkpoints_response = client.get("/api/fine_tuning/jobs/ftjob-demo/checkpoints")
            self.assertEqual(checkpoints_response.status_code, 200)
            checkpoints = checkpoints_response.json()["data"]
            self.assertEqual(len(checkpoints), 2)
            self.assertEqual(checkpoints[0]["metrics"]["train_loss"], 1.25)

            logs_response = client.get("/api/fine_tuning/jobs/ftjob-demo/logs")
            self.assertEqual(logs_response.status_code, 200)
            self.assertIn("training finished", logs_response.json()["stdout"])
            self.assertIn("fallback tokenizer", logs_response.json()["stderr"])
            self.assertEqual(logs_response.json()["displayed_line_limit"], 2000)

            download_response = client.get(
                "/api/fine_tuning/jobs/ftjob-demo/logs/download"
            )
            self.assertEqual(download_response.status_code, 200)
            self.assertIn("attachment;", download_response.headers["content-disposition"])
            self.assertIn("===== stdout =====", download_response.text)
            self.assertIn("===== stderr =====", download_response.text)

    def test_fine_tuning_job_logs_endpoint_returns_tail_only(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            client = self._create_client(temp_dir)
            job_dir = Path(temp_dir) / "fine_tuning" / "jobs" / "ftjob-demo"
            job_dir.mkdir(parents=True, exist_ok=True)
            (job_dir / "job.json").write_text(
                json.dumps(
                    {
                        "id": "ftjob-demo",
                        "object": "fine_tuning.job",
                        "created_at": 1000,
                        "error": None,
                        "estimated_finish": None,
                        "fine_tuned_model": None,
                        "finished_at": None,
                        "hyperparameters": {},
                        "integrations": [],
                        "metadata": {},
                        "method": {"type": "sft"},
                        "model": "demo-model",
                        "organization_id": "org-lawftrack",
                        "result_files": [],
                        "seed": None,
                        "status": "running",
                        "trained_tokens": None,
                        "training_file": "file-training",
                        "validation_file": None,
                        "suffix": None,
                        "lora_adapter": None,
                        "process": {"pid": None, "started_at": 1000, "exit_code": None},
                    }
                ),
                encoding="utf-8",
            )
            (job_dir / "stdout.log").write_text(
                "line-1\nline-2\nline-3\n",
                encoding="utf-8",
            )
            (job_dir / "stderr.log").write_text(
                "warn-1\nwarn-2\nwarn-3\n",
                encoding="utf-8",
            )

            response = client.get("/api/fine_tuning/jobs/ftjob-demo/logs?tail_lines=2")

            self.assertEqual(response.status_code, 200)
            payload = response.json()
            self.assertEqual(payload["stdout"], "line-2\nline-3\n")
            self.assertEqual(payload["stderr"], "warn-2\nwarn-3\n")
            self.assertTrue(payload["stdout_truncated"])
            self.assertTrue(payload["stderr_truncated"])
            self.assertEqual(payload["stdout_total_lines"], 3)
            self.assertEqual(payload["stderr_total_lines"], 3)
            self.assertEqual(payload["displayed_line_limit"], 2)

    def test_datasets_api_lists_and_updates_dataset_samples(self) -> None:
        initial_assistant = "Hello, I am your legal assistant"
        updated_title = "Contract review follow-up"
        updated_user = "Please review the dispute timeline."
        updated_assistant = "Thanks. Please share the contract and notice."
        replacement_token = "Updated"

        with tempfile.TemporaryDirectory() as temp_dir:
            client = self._create_client(temp_dir)
            created_dataset = client.post(
                "/api/datasets/import",
                files={
                    "file": (
                        "train.jsonl",
                        (
                            b'{"messages":[{"role":"user","content":"hello"},{"role":"assistant","content":"Hello, I am your legal assistant"}]}\n'
                        ),
                        "application/jsonl",
                    )
                },
            ).json()
            client.patch(
                f"/api/datasets/{created_dataset['id']}",
                json={"base_model": "Qwen/Qwen2.5-7B-Instruct"},
            )

            samples_response = client.get(f"/api/datasets/{created_dataset['id']}/samples")
            self.assertEqual(samples_response.status_code, 200)
            samples_payload = samples_response.json()
            self.assertEqual(samples_payload["object"], "list")
            self.assertEqual(len(samples_payload["data"]), 1)
            sample = samples_payload["data"][0]
            self.assertEqual(sample["messages"][1]["content"], initial_assistant)

            update_response = client.put(
                f"/api/datasets/{created_dataset['id']}/samples/{sample['id']}",
                json={
                    "title": updated_title,
                    "messages": [
                        {"role": "user", "content": updated_user},
                        {"role": "assistant", "content": updated_assistant},
                    ],
                    "edits": [
                        {
                            "message_index": 1,
                            "token_index": 0,
                            "original_token": "Hello",
                            "replacement_token": replacement_token,
                            "regenerated_from_token_index": 1,
                        }
                    ],
                },
            )
            self.assertEqual(update_response.status_code, 200)
            updated_sample = update_response.json()
            self.assertEqual(updated_sample["title"], updated_title)
            self.assertEqual(updated_sample["messages"][1]["content"], updated_assistant)
            self.assertEqual(updated_sample["edits"][0]["replacement_token"], replacement_token)

            samples_path = (
                Path(temp_dir)
                / "datasets"
                / created_dataset["id"]
                / "samples.json"
            )
            self.assertTrue(samples_path.is_file())
            saved_samples = json.loads(samples_path.read_text(encoding="utf-8"))
            self.assertEqual(saved_samples[0]["title"], updated_title)

    def test_datasets_api_can_create_blank_sample(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            client = self._create_client(temp_dir)
            created_dataset = client.post(
                "/api/datasets",
                json={"name": "manual-samples", "base_model": "Qwen/Qwen2.5-7B-Instruct"},
            ).json()

            create_sample_response = client.post(
                f"/api/datasets/{created_dataset['id']}/samples",
                json={"title": "Blank sample"},
            )
            self.assertEqual(create_sample_response.status_code, 200)
            sample = create_sample_response.json()
            self.assertEqual(sample["title"], "Blank sample")
            self.assertEqual(sample["messages"][0]["role"], "user")
            self.assertEqual(sample["messages"][1]["role"], "assistant")

            list_samples_response = client.get(f"/api/datasets/{created_dataset['id']}/samples")
            self.assertEqual(list_samples_response.status_code, 200)
            self.assertEqual(len(list_samples_response.json()["data"]), 1)

    def test_datasets_api_can_delete_sample(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            client = self._create_client(temp_dir)
            created_dataset = client.post(
                "/api/datasets",
                json={"name": "manual-samples", "base_model": "Qwen/Qwen2.5-7B-Instruct"},
            ).json()

            created_sample = client.post(
                f"/api/datasets/{created_dataset['id']}/samples",
                json={"title": "Delete me"},
            ).json()

            delete_response = client.delete(
                f"/api/datasets/{created_dataset['id']}/samples/{created_sample['id']}",
            )
            self.assertEqual(delete_response.status_code, 200)
            self.assertTrue(delete_response.json()["deleted"])

            list_samples_response = client.get(f"/api/datasets/{created_dataset['id']}/samples")
            self.assertEqual(list_samples_response.status_code, 200)
            self.assertEqual(list_samples_response.json()["data"], [])

    def test_dataset_metadata_update_does_not_clear_manual_samples(self) -> None:
        manual_title = "Manual sample"
        manual_user = "Need a summary."
        manual_assistant = "Here is the first draft."

        with tempfile.TemporaryDirectory() as temp_dir:
            client = self._create_client(temp_dir)
            created_dataset = client.post(
                "/api/datasets",
                json={"name": "manual-samples", "base_model": "Qwen/Qwen2.5-7B-Instruct"},
            ).json()

            created_sample = client.post(
                f"/api/datasets/{created_dataset['id']}/samples",
                json={
                    "title": manual_title,
                    "messages": [
                        {"role": "user", "content": manual_user},
                        {"role": "assistant", "content": manual_assistant},
                    ],
                },
            ).json()

            update_response = client.patch(
                f"/api/datasets/{created_dataset['id']}",
                json={
                    "name": "manual-samples-v2",
                    "base_model": "/models/local-qwen",
                },
            )
            self.assertEqual(update_response.status_code, 200)

            list_samples_response = client.get(f"/api/datasets/{created_dataset['id']}/samples")
            self.assertEqual(list_samples_response.status_code, 200)
            samples = list_samples_response.json()["data"]
            self.assertEqual(len(samples), 1)
            self.assertEqual(samples[0]["id"], created_sample["id"])
            self.assertEqual(samples[0]["messages"][1]["content"], manual_assistant)

    def test_dataset_metadata_update_does_not_reset_existing_samples(self) -> None:
        updated_user = "Need a revision."
        updated_assistant = "Updated manual answer."

        with tempfile.TemporaryDirectory() as temp_dir:
            client = self._create_client(temp_dir)
            created_dataset = client.post(
                "/api/datasets/import",
                files={
                    "file": (
                        "train.jsonl",
                        (
                            b'{"messages":[{"role":"user","content":"hello"},{"role":"assistant","content":"Original answer"}]}\n'
                        ),
                        "application/jsonl",
                    )
                },
            ).json()
            client.patch(
                f"/api/datasets/{created_dataset['id']}",
                json={"base_model": "Qwen/Qwen2.5-7B-Instruct"},
            )

            sample = client.get(f"/api/datasets/{created_dataset['id']}/samples").json()["data"][0]
            client.put(
                f"/api/datasets/{created_dataset['id']}/samples/{sample['id']}",
                json={
                    "title": sample["title"],
                    "messages": [
                        {"role": "user", "content": updated_user},
                        {"role": "assistant", "content": updated_assistant},
                    ],
                    "edits": [],
                },
            )

            update_response = client.patch(
                f"/api/datasets/{created_dataset['id']}",
                json={"base_model": "/models/local-qwen"},
            )
            self.assertEqual(update_response.status_code, 200)

            list_samples_response = client.get(f"/api/datasets/{created_dataset['id']}/samples")
            self.assertEqual(list_samples_response.status_code, 200)
            samples = list_samples_response.json()["data"]
            self.assertEqual(len(samples), 1)
            self.assertEqual(samples[0]["messages"][1]["content"], updated_assistant)

    def test_dataset_sample_tokenize_and_continue_use_model_tokenizer(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            import lawftrack.api.datasets_api as datasets_api_module
            import lawftrack.server as server_module
        finally:
            sys.path.pop(0)

        initial_reasoning = "Initial reasoning"
        initial_content = "Hello"
        continued_content = "Updated completion tail"

        class DummyResponse:
            def __init__(self, payload):
                self._payload = payload
                self.status_code = 200
                self.is_success = True
                self.text = json.dumps(payload)

            def json(self):
                return self._payload

        captured_request: dict[str, object] = {}

        class DummyAsyncClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

            async def post(self, url, headers=None, json=None):
                captured_request["url"] = url
                captured_request["headers"] = headers
                captured_request["json"] = json
                return DummyResponse({"choices": [{"text": " completion tail"}]})

        initial_tokens = [
            {"token_index": 0, "token_id": 11, "token": "He", "text": "He", "start": 0, "end": 2},
            {"token_index": 1, "token_id": 12, "token": "ll", "text": "ll", "start": 2, "end": 4},
            {"token_index": 2, "token_id": 13, "token": "o", "text": "o", "start": 4, "end": 5},
        ]
        continued_tokens = [
            {"token_index": 0, "token_id": 21, "token": "Updated", "text": "Updated", "start": 0, "end": 7},
            {"token_index": 1, "token_id": 22, "token": " completion", "text": " completion", "start": 7, "end": 18},
            {"token_index": 2, "token_id": 23, "token": " tail", "text": " tail", "start": 18, "end": 23},
        ]
        reasoning_tokens = [
            {"token_index": 0, "token_id": 31, "token": "Initial", "text": "Initial", "start": 0, "end": 7},
            {"token_index": 1, "token_id": 32, "token": " reasoning", "text": " reasoning", "start": 7, "end": 17},
        ]

        def fake_tokenize(model, text, config_dir=None):
            if text == initial_content:
                return initial_tokens
            if text == continued_content:
                return continued_tokens
            if text == initial_reasoning:
                return reasoning_tokens
            raise AssertionError(text)

        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "config.json"
            config_path.write_text(
                json.dumps({"vllm_endpoint": "http://localhost:8000/v1", "api_key": ""}),
                encoding="utf-8",
            )

            client = self._create_client(temp_dir)
            created_dataset = client.post(
                "/api/datasets/import",
                files={
                    "file": (
                        "train.jsonl",
                        b'{"messages":[{"role":"user","content":"hi"},{"role":"assistant","content":"Hello","reasoning":"Initial reasoning"}]}\n',
                        "application/jsonl",
                    )
                },
            ).json()
            client.patch(
                f"/api/datasets/{created_dataset['id']}",
                json={"base_model": "Qwen/Qwen2.5-7B-Instruct"},
            )
            sample = client.get(f"/api/datasets/{created_dataset['id']}/samples").json()["data"][0]

            with mock.patch.object(datasets_api_module, "tokenize_text", side_effect=fake_tokenize):
                tokenize_response = client.post(
                    f"/api/datasets/{created_dataset['id']}/samples/{sample['id']}/tokenize",
                    json={"model": "Qwen/Qwen2.5-7B-Instruct"},
                )
            self.assertEqual(tokenize_response.status_code, 200)
            self.assertEqual(tokenize_response.json()["messages"][1]["tokens"][0]["token"], "He")

            with mock.patch.object(
                datasets_api_module,
                "build_continuation_prefix",
                return_value=("Updated", "Hello", "Updated"),
            ):
                with mock.patch.object(datasets_api_module, "count_text_tokens", return_value=1):
                    with mock.patch.object(server_module.httpx, "AsyncClient", return_value=DummyAsyncClient()):
                        with mock.patch.object(datasets_api_module.httpx, "AsyncClient", return_value=DummyAsyncClient()):
                            with mock.patch.object(
                                datasets_api_module,
                                "build_completion_prompt",
                                return_value="PROMPT:Updated",
                            ):
                                with mock.patch.object(
                                    datasets_api_module,
                                    "suggest_completion_max_tokens",
                                    return_value=4096,
                                ):
                                    with mock.patch.object(datasets_api_module, "tokenize_text", side_effect=fake_tokenize):
                                        continue_response = client.post(
                                            f"/api/datasets/{created_dataset['id']}/samples/{sample['id']}/continue",
                                            json={
                                                "model": "Qwen/Qwen2.5-7B-Instruct",
                                                "message_index": 1,
                                                "token_index": 0,
                                                "replacement_token": "Updated",
                                            },
                                        )

            self.assertEqual(continue_response.status_code, 200)
            continued_payload = continue_response.json()
            continued_sample = continued_payload["sample"]
            self.assertEqual(continued_sample["messages"][1]["content"], continued_content)
            self.assertEqual(continued_sample["messages"][1]["reasoning"], initial_reasoning)
            self.assertEqual(continued_sample["edits"][0]["original_token"], "Hello")
            self.assertEqual(continued_sample["edits"][0]["replacement_token"], "Updated")
            self.assertEqual(continued_payload["tokenization"]["messages"][1]["tokens"][0]["text"], "Updated")
            self.assertEqual(captured_request["json"]["prompt"], "PROMPT:Updated")
            self.assertEqual(captured_request["json"]["max_tokens"], 4096)
            self.assertTrue(str(captured_request["url"]).endswith("/v1/completions"))

            save_response = client.put(
                f"/api/datasets/{created_dataset['id']}/samples/{sample['id']}",
                json={
                    "title": continued_sample["title"],
                    "messages": continued_sample["messages"],
                    "edits": [
                        {
                            **continued_sample["edits"][0],
                            "regenerated_from_token_index": None,
                        }
                    ],
                },
            )
            self.assertEqual(save_response.status_code, 200)
            self.assertEqual(save_response.json()["messages"][1]["reasoning"], initial_reasoning)

    def test_continue_prepare_returns_prompt_metadata_for_frontend_streaming(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            import lawftrack.api.datasets_api as datasets_api_module
        finally:
            sys.path.pop(0)

        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "config.json"
            config_path.write_text(
                json.dumps({"vllm_endpoint": "http://localhost:8000/v1", "api_key": ""}),
                encoding="utf-8",
            )

            client = self._create_client(temp_dir)
            created_dataset = client.post(
                "/api/datasets/import",
                files={
                    "file": (
                        "train.jsonl",
                        b'{"messages":[{"role":"user","content":"hi"},{"role":"assistant","content":"Hello"}]}\n',
                        "application/jsonl",
                    )
                },
            ).json()
            sample = client.get(f"/api/datasets/{created_dataset['id']}/samples").json()["data"][0]

            with mock.patch.object(
                datasets_api_module,
                "build_continuation_prefix",
                return_value=("Updated", "Hello", "Updated"),
            ):
                with mock.patch.object(datasets_api_module, "count_text_tokens", return_value=1):
                    with mock.patch.object(
                        datasets_api_module,
                        "build_completion_prompt",
                        return_value="PROMPT:Updated",
                    ):
                        with mock.patch.object(
                            datasets_api_module,
                            "suggest_completion_max_tokens",
                            return_value=4096,
                        ):
                            prepare_response = client.post(
                                f"/api/datasets/{created_dataset['id']}/samples/{sample['id']}/continue_prepare",
                                json={
                                    "model": "Qwen/Qwen2.5-7B-Instruct",
                                    "message_index": 1,
                                    "token_index": 0,
                                    "replacement_token": "Updated",
                                },
                            )

            self.assertEqual(prepare_response.status_code, 200)
            self.assertEqual(
                prepare_response.json(),
                {
                    "object": "dataset.sample.continuation_preparation",
                    "prompt": "PROMPT:Updated",
                    "suggested_max_tokens": 4096,
                    "prefix": "Updated",
                    "target": "content",
                    "original_token": "Hello",
                    "replacement_token": "Updated",
                    "regenerated_from_token_index": 1,
                },
            )

    def test_tokenize_dataset_sample_accepts_frontend_preview_messages(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            import lawftrack.api.datasets_api as datasets_api_module
        finally:
            sys.path.pop(0)

        reasoning_tokens = [
            {"token_index": 0, "token_id": 31, "token": "Initial", "text": "Initial", "start": 0, "end": 7},
            {"token_index": 1, "token_id": 32, "token": " reasoning", "text": " reasoning", "start": 7, "end": 17},
        ]
        continued_tokens = [
            {"token_index": 0, "token_id": 21, "token": "Updated", "text": "Updated", "start": 0, "end": 7},
            {"token_index": 1, "token_id": 22, "token": " completion", "text": " completion", "start": 7, "end": 18},
            {"token_index": 2, "token_id": 23, "token": " tail", "text": " tail", "start": 18, "end": 23},
        ]

        def fake_tokenize(model, text, config_dir=None):
            if text == "Updated completion tail":
                return continued_tokens
            if text == "Initial reasoning":
                return reasoning_tokens
            raise AssertionError(text)

        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "config.json"
            config_path.write_text(
                json.dumps({"vllm_endpoint": "http://localhost:8000/v1", "api_key": ""}),
                encoding="utf-8",
            )

            client = self._create_client(temp_dir)
            created_dataset = client.post(
                "/api/datasets/import",
                files={
                    "file": (
                        "train.jsonl",
                        b'{"messages":[{"role":"user","content":"hi"},{"role":"assistant","content":"Hello","reasoning":"Initial reasoning"}]}\n',
                        "application/jsonl",
                    )
                },
            ).json()
            sample = client.get(f"/api/datasets/{created_dataset['id']}/samples").json()["data"][0]

            with mock.patch.object(datasets_api_module, "tokenize_text", side_effect=fake_tokenize):
                tokenize_response = client.post(
                    f"/api/datasets/{created_dataset['id']}/samples/{sample['id']}/tokenize",
                    json={
                        "model": "Qwen/Qwen2.5-7B-Instruct",
                        "messages": [
                            {"role": "user", "content": "hi"},
                            {
                                "role": "assistant",
                                "content": "Updated completion tail",
                                "reasoning": "Initial reasoning",
                            },
                        ],
                    },
                )

            self.assertEqual(tokenize_response.status_code, 200)
            tokenization_payload = tokenize_response.json()
            self.assertEqual(
                tokenization_payload["messages"][1]["tokens"][0]["text"],
                "Updated",
            )
            self.assertEqual(
                tokenization_payload["messages"][1]["reasoning_tokens"][0]["text"],
                "Initial",
            )

    def test_continue_uses_replacement_token_count_for_regeneration_start(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            import lawftrack.api.datasets_api as datasets_api_module
            import lawftrack.server as server_module
        finally:
            sys.path.pop(0)

        class DummyResponse:
            def __init__(self, payload):
                self._payload = payload
                self.status_code = 200
                self.is_success = True
                self.text = json.dumps(payload)

            def json(self):
                return self._payload

        class DummyAsyncClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

            async def post(self, url, headers=None, json=None):
                return DummyResponse({"choices": [{"text": " tail"}]})

        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "config.json"
            config_path.write_text(
                json.dumps({"vllm_endpoint": "http://localhost:8000/v1", "api_key": ""}),
                encoding="utf-8",
            )

            client = self._create_client(temp_dir)
            created_dataset = client.post(
                "/api/datasets",
                json={"name": "multi-token-rewrite", "base_model": "Qwen/Qwen2.5-7B-Instruct"},
            ).json()
            created_sample = client.post(
                f"/api/datasets/{created_dataset['id']}/samples",
                json={
                    "title": "Multi token rewrite sample",
                    "messages": [
                        {"role": "user", "content": "hi"},
                        {"role": "assistant", "content": "Hello"},
                    ],
                },
            ).json()

            with mock.patch.object(
                datasets_api_module,
                "build_continuation_prefix",
                return_value=("Alpha Beta", "Hello", "Alpha Beta"),
            ):
                with mock.patch.object(datasets_api_module, "count_text_tokens", return_value=2):
                    with mock.patch.object(server_module.httpx, "AsyncClient", return_value=DummyAsyncClient()):
                        with mock.patch.object(datasets_api_module.httpx, "AsyncClient", return_value=DummyAsyncClient()):
                            with mock.patch.object(
                                datasets_api_module,
                                "build_completion_prompt",
                                return_value="PROMPT:Alpha Beta",
                            ):
                                with mock.patch.object(
                                    datasets_api_module,
                                    "suggest_completion_max_tokens",
                                    return_value=4096,
                                ):
                                    with mock.patch.object(
                                        datasets_api_module,
                                        "tokenize_text",
                                        return_value=[
                                            {"token_index": 0, "token_id": 1, "token": "Alpha", "text": "Alpha", "start": 0, "end": 5},
                                            {"token_index": 1, "token_id": 2, "token": " Beta", "text": " Beta", "start": 5, "end": 10},
                                            {"token_index": 2, "token_id": 3, "token": " tail", "text": " tail", "start": 10, "end": 15},
                                        ],
                                    ):
                                        continue_response = client.post(
                                            f"/api/datasets/{created_dataset['id']}/samples/{created_sample['id']}/continue",
                                            json={
                                                "model": "Qwen/Qwen2.5-7B-Instruct",
                                                "message_index": 1,
                                                "token_index": 0,
                                                "replacement_token": "Alpha Beta",
                                            },
                                        )

            self.assertEqual(continue_response.status_code, 200)
            continued_sample = continue_response.json()["sample"]
            self.assertEqual(continued_sample["edits"][0]["replacement_token"], "Alpha Beta")
            self.assertEqual(continued_sample["edits"][0]["regenerated_from_token_index"], 2)

    def test_continue_preserves_edits_before_current_token(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            import lawftrack.api.datasets_api as datasets_api_module
            import lawftrack.server as server_module
        finally:
            sys.path.pop(0)

        class DummyResponse:
            def __init__(self, payload):
                self._payload = payload
                self.status_code = 200
                self.is_success = True
                self.text = json.dumps(payload)

            def json(self):
                return self._payload

        class DummyAsyncClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

            async def post(self, url, headers=None, json=None):
                return DummyResponse({"choices": [{"text": " X"}]})

        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "config.json"
            config_path.write_text(
                json.dumps({"vllm_endpoint": "http://localhost:8000/v1", "api_key": ""}),
                encoding="utf-8",
            )

            client = self._create_client(temp_dir)
            created_dataset = client.post(
                "/api/datasets",
                json={"name": "preserve-edits", "base_model": "Qwen/Qwen2.5-7B-Instruct"},
            ).json()
            created_sample = client.post(
                f"/api/datasets/{created_dataset['id']}/samples",
                json={
                    "title": "Preserve edits sample",
                    "messages": [
                        {"role": "user", "content": "hi"},
                        {"role": "assistant", "content": "a b c"},
                    ],
                },
            ).json()

            client.put(
                f"/api/datasets/{created_dataset['id']}/samples/{created_sample['id']}",
                json={
                    "title": created_sample["title"],
                    "messages": created_sample["messages"],
                    "edits": [
                        {
                            "message_index": 1,
                            "token_index": 0,
                            "original_token": "a",
                            "replacement_token": "A",
                            "regenerated_from_token_index": None,
                        }
                    ],
                },
            )

            with mock.patch.object(
                datasets_api_module,
                "build_continuation_prefix",
                return_value=("A b", "b", "B"),
            ):
                with mock.patch.object(datasets_api_module, "count_text_tokens", return_value=1):
                    with mock.patch.object(server_module.httpx, "AsyncClient", return_value=DummyAsyncClient()):
                        with mock.patch.object(datasets_api_module.httpx, "AsyncClient", return_value=DummyAsyncClient()):
                            with mock.patch.object(
                                datasets_api_module,
                                "build_completion_prompt",
                                return_value="PROMPT:A b",
                            ):
                                with mock.patch.object(
                                    datasets_api_module,
                                    "suggest_completion_max_tokens",
                                    return_value=4096,
                                ):
                                    with mock.patch.object(
                                        datasets_api_module,
                                        "tokenize_text",
                                        return_value=[
                                            {"token_index": 0, "token_id": 1, "token": "A", "text": "A", "start": 0, "end": 1},
                                            {"token_index": 1, "token_id": 2, "token": " B", "text": " B", "start": 1, "end": 3},
                                            {"token_index": 2, "token_id": 3, "token": " X", "text": " X", "start": 3, "end": 5},
                                        ],
                                    ):
                                        continue_response = client.post(
                                            f"/api/datasets/{created_dataset['id']}/samples/{created_sample['id']}/continue",
                                            json={
                                                "model": "Qwen/Qwen2.5-7B-Instruct",
                                                "message_index": 1,
                                                "token_index": 1,
                                                "replacement_token": "B",
                                            },
                                        )

            self.assertEqual(continue_response.status_code, 200)
            continued_sample = continue_response.json()["sample"]
            self.assertEqual(len(continued_sample["edits"]), 2)
            self.assertEqual(continued_sample["edits"][0]["token_index"], 0)
            self.assertEqual(continued_sample["edits"][0]["replacement_token"], "A")
            self.assertEqual(continued_sample["edits"][1]["token_index"], 1)
            self.assertEqual(continued_sample["edits"][1]["replacement_token"], "B")

    def test_dataset_sample_reasoning_can_be_tokenized_and_continued(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            import lawftrack.api.datasets_api as datasets_api_module
            import lawftrack.server as server_module
        finally:
            sys.path.pop(0)

        initial_reasoning = "Step one"
        initial_content = "Original answer"
        continued_reasoning = "Revised plan"

        class DummyResponse:
            def __init__(self, payload):
                self._payload = payload
                self.status_code = 200
                self.is_success = True
                self.text = json.dumps(payload)

            def json(self):
                return self._payload

        captured_request: dict[str, object] = {}

        class DummyAsyncClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

            async def post(self, url, headers=None, json=None):
                captured_request["url"] = url
                captured_request["json"] = json
                return DummyResponse({"choices": [{"text": " plan</think>Updated answer"}]})

        def fake_tokenize(model, text, config_dir=None):
            if text == initial_reasoning:
                return [
                    {"token_index": 0, "token_id": 1, "token": "Step", "text": "Step", "start": 0, "end": 4},
                    {"token_index": 1, "token_id": 2, "token": " one", "text": " one", "start": 4, "end": 8},
                ]
            if text == initial_content:
                return [
                    {"token_index": 0, "token_id": 3, "token": "Original", "text": "Original", "start": 0, "end": 8},
                    {"token_index": 1, "token_id": 4, "token": " answer", "text": " answer", "start": 8, "end": 15},
                ]
            if text == continued_reasoning:
                return [
                    {"token_index": 0, "token_id": 5, "token": "Revised", "text": "Revised", "start": 0, "end": 7},
                    {"token_index": 1, "token_id": 6, "token": " plan", "text": " plan", "start": 7, "end": 12},
                ]
            raise AssertionError(text)

        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "config.json"
            config_path.write_text(
                json.dumps({"vllm_endpoint": "http://localhost:8000/v1", "api_key": ""}),
                encoding="utf-8",
            )

            client = self._create_client(temp_dir)
            created_dataset = client.post(
                "/api/datasets/import",
                files={
                    "file": (
                        "train.jsonl",
                        b'{"messages":[{"role":"user","content":"hi"},{"role":"assistant","reasoning":"Step one","content":"Original answer"}]}\n',
                        "application/jsonl",
                    )
                },
            ).json()
            sample = client.get(f"/api/datasets/{created_dataset['id']}/samples").json()["data"][0]

            with mock.patch.object(datasets_api_module, "tokenize_text", side_effect=fake_tokenize):
                tokenize_response = client.post(
                    f"/api/datasets/{created_dataset['id']}/samples/{sample['id']}/tokenize",
                    json={"model": "demo-model"},
                )

            self.assertEqual(tokenize_response.status_code, 200)
            tokenization_payload = tokenize_response.json()
            self.assertEqual(tokenization_payload["messages"][1]["reasoning_tokens"][0]["text"], "Step")
            self.assertEqual(tokenization_payload["messages"][1]["tokens"][0]["text"], "Original")

            with mock.patch.object(
                datasets_api_module,
                "build_continuation_prefix",
                return_value=("Revised", "Step", "Revised"),
            ):
                with mock.patch.object(datasets_api_module, "count_text_tokens", return_value=1):
                    with mock.patch.object(server_module.httpx, "AsyncClient", return_value=DummyAsyncClient()):
                        with mock.patch.object(datasets_api_module.httpx, "AsyncClient", return_value=DummyAsyncClient()):
                            with mock.patch.object(
                                datasets_api_module,
                                "build_completion_prompt",
                                return_value="PROMPT:<think>Revised",
                            ):
                                with mock.patch.object(
                                    datasets_api_module,
                                    "suggest_completion_max_tokens",
                                    return_value=4096,
                                ):
                                    with mock.patch.object(datasets_api_module, "tokenize_text", side_effect=fake_tokenize):
                                        continue_response = client.post(
                                            f"/api/datasets/{created_dataset['id']}/samples/{sample['id']}/continue",
                                            json={
                                                "model": "demo-model",
                                                "message_index": 1,
                                                "token_index": 0,
                                                "target": "reasoning",
                                                "replacement_token": "Revised",
                                            },
                                        )

            self.assertEqual(continue_response.status_code, 200)
            continued_payload = continue_response.json()
            self.assertEqual(continued_payload["sample"]["messages"][1]["reasoning"], continued_reasoning)
            self.assertEqual(continued_payload["sample"]["messages"][1]["content"], initial_content)
            self.assertEqual(continued_payload["sample"]["edits"][0]["target"], "reasoning")
            self.assertEqual(
                continued_payload["tokenization"]["messages"][1]["reasoning_tokens"][0]["text"],
                "Revised",
            )
            self.assertEqual(
                continued_payload["tokenization"]["messages"][1]["tokens"][0]["text"],
                "Original",
            )
            self.assertEqual(captured_request["json"]["prompt"], "PROMPT:<think>Revised")
            self.assertTrue(str(captured_request["url"]).endswith("/v1/completions"))

    def test_dataset_sample_candidate_tokens_use_completions(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            import lawftrack.api.datasets_api as datasets_api_module
            import lawftrack.server as server_module
        finally:
            sys.path.pop(0)

        class DummyResponse:
            def __init__(self, payload):
                self._payload = payload
                self.status_code = 200
                self.is_success = True
                self.text = json.dumps(payload)

            def json(self):
                return self._payload

        captured_request: dict[str, object] = {}

        class DummyAsyncClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, exc_type, exc, tb):
                return False

            async def post(self, url, headers=None, json=None):
                captured_request["url"] = url
                captured_request["json"] = json
                return DummyResponse(
                    {
                        "choices": [
                            {
                                "logprobs": {
                                    "top_logprobs": [
                                        {"Alpha": -0.1, "Beta": -0.9}
                                    ]
                                }
                            }
                        ]
                    }
                )

        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "config.json"
            config_path.write_text(
                json.dumps({"vllm_endpoint": "http://localhost:8000/v1", "api_key": ""}),
                encoding="utf-8",
            )

            client = self._create_client(temp_dir)
            created_dataset = client.post(
                "/api/datasets",
                json={"name": "candidate-tokens", "base_model": "demo-model"},
            ).json()
            created_sample = client.post(
                f"/api/datasets/{created_dataset['id']}/samples",
                json={
                    "title": "Candidate tokens sample",
                    "messages": [
                        {"role": "user", "content": "hi"},
                        {"role": "assistant", "reasoning": "Draft reasoning", "content": "Answer body"},
                    ],
                },
            ).json()

            with mock.patch.object(server_module.httpx, "AsyncClient", return_value=DummyAsyncClient()):
                with mock.patch.object(datasets_api_module.httpx, "AsyncClient", return_value=DummyAsyncClient()):
                    with mock.patch.object(
                        datasets_api_module,
                        "build_prefix_before_token",
                        return_value="Draft",
                    ):
                        with mock.patch.object(
                            datasets_api_module,
                            "build_completion_prompt",
                            return_value="PROMPT:CANDIDATES",
                        ):
                            response = client.post(
                                f"/api/datasets/{created_dataset['id']}/samples/{created_sample['id']}/candidate_tokens",
                                json={
                                    "model": "demo-model",
                                    "message_index": 1,
                                    "token_index": 0,
                                    "target": "reasoning",
                                },
                            )

            self.assertEqual(response.status_code, 200)
            self.assertEqual(
                response.json()["data"],
                [
                    {"text": "Alpha", "logprob": -0.1},
                    {"text": "Beta", "logprob": -0.9},
                ],
            )
            self.assertEqual(captured_request["json"]["prompt"], "PROMPT:CANDIDATES")
            self.assertTrue(str(captured_request["url"]).endswith("/v1/completions"))

    def test_render_completion_prompt_uses_chat_template(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            import lawftrack.api.datasets_api as datasets_api_module
        finally:
            sys.path.pop(0)

        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "config.json"
            config_path.write_text(
                json.dumps({"vllm_endpoint": "http://localhost:8000/v1", "api_key": ""}),
                encoding="utf-8",
            )

            client = self._create_client(temp_dir)
            with mock.patch.object(
                datasets_api_module,
                "build_completion_prompt",
                return_value="PROMPT:CHAT_TEMPLATE",
            ) as mocked_build_prompt:
                with mock.patch.object(
                    datasets_api_module,
                    "suggest_completion_max_tokens",
                    return_value=1234,
                ):
                    response = client.post(
                        "/api/datasets/render_completion_prompt",
                        json={
                            "model": "demo-model",
                            "messages": [
                                {"role": "user", "content": "hi"},
                                {"role": "assistant", "content": "hello", "reasoning": "think"},
                            ],
                        },
                    )

            self.assertEqual(response.status_code, 200)
            self.assertEqual(
                response.json(),
                {
                    "object": "dataset.completion_prompt",
                    "prompt": "PROMPT:CHAT_TEMPLATE",
                    "suggested_max_tokens": 1234,
                },
            )
            self.assertEqual(
                mocked_build_prompt.call_args.kwargs["prompt_messages"],
                [
                    {"role": "user", "content": "hi"},
                    {"role": "assistant", "content": "hello", "reasoning": "think"},
                ],
            )

    def test_suggest_completion_max_tokens_caps_to_model_config_limit(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            import lawftrack.api.datasets_api as datasets_api_module
        finally:
            sys.path.pop(0)

        with mock.patch.object(
            datasets_api_module,
            "count_text_tokens",
            return_value=11,
        ):
            with mock.patch.object(
                datasets_api_module,
                "get_tokenizer_max_length",
                return_value=131072,
            ):
                with mock.patch.object(
                    datasets_api_module,
                    "get_model_max_position_embeddings",
                    return_value=40960,
                ):
                    self.assertEqual(
                        datasets_api_module.suggest_completion_max_tokens(
                            model="Qwen/Qwen3-32B",
                            prompt="PROMPT",
                        ),
                        40948,
                    )

    def test_suggest_completion_max_tokens_falls_back_to_tokenizer_limit(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            import lawftrack.api.datasets_api as datasets_api_module
        finally:
            sys.path.pop(0)

        with mock.patch.object(
            datasets_api_module,
            "count_text_tokens",
            return_value=11,
        ):
            with mock.patch.object(
                datasets_api_module,
                "get_tokenizer_max_length",
                return_value=32768,
            ):
                with mock.patch.object(
                    datasets_api_module,
                    "get_model_max_position_embeddings",
                    return_value=None,
                ):
                    self.assertEqual(
                        datasets_api_module.suggest_completion_max_tokens(
                            model="demo-model",
                            prompt="PROMPT",
                        ),
                        32756,
                    )

    def test_v1_proxy_forwards_to_configured_vllm_endpoint(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            from fastapi.testclient import TestClient
            import lawftrack.server as server_module
        finally:
            sys.path.pop(0)

        class DummyResponse:
            def __init__(self) -> None:
                self.status_code = 200
                self.headers = {"content-type": "application/json"}
                self._chunks = [b'{"ok":true}']

            async def aiter_raw(self):
                for chunk in self._chunks:
                    yield chunk

            async def aclose(self):
                return None

        captured_request: dict[str, object] = {}

        class DummyAsyncClient:
            def build_request(self, **kwargs):
                captured_request.update(kwargs)
                return kwargs

            async def send(self, request, stream=False):
                captured_request["stream"] = stream
                return DummyResponse()

            async def aclose(self):
                return None

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
                    "/v1/chat/completions",
                    headers={"content-type": "application/json"},
                    json={
                        "messages": [{"role": "user", "content": "hello"}],
                        "stream": False,
                    },
                )

            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json(), {"ok": True})
            self.assertEqual(captured_request["method"], "POST")
            parsed_url = urlparse(str(captured_request["url"]))
            self.assertEqual(parsed_url.scheme, "http")
            self.assertEqual(parsed_url.netloc, "localhost:8000")
            self.assertEqual(parsed_url.path, "/base/chat/completions")
            self.assertEqual(parsed_url.query, "")
            self.assertTrue(captured_request["stream"])
            self.assertIn(b'"stream":false', captured_request["content"])
            self.assertEqual(
                captured_request["headers"]["authorization"], "Bearer secret-key"
            )

    def test_v1_proxy_overrides_incoming_authorization_header(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            from fastapi.testclient import TestClient
            import lawftrack.server as server_module
        finally:
            sys.path.pop(0)

        class DummyResponse:
            def __init__(self) -> None:
                self.status_code = 200
                self.headers = {"content-type": "application/json"}
                self._chunks = [b'{"ok":true}']

            async def aiter_raw(self):
                for chunk in self._chunks:
                    yield chunk

            async def aclose(self):
                return None

        captured_request: dict[str, object] = {}

        class DummyAsyncClient:
            def build_request(self, **kwargs):
                captured_request.update(kwargs)
                return kwargs

            async def send(self, request, stream=False):
                captured_request["stream"] = stream
                return DummyResponse()

            async def aclose(self):
                return None

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
                    "/v1/chat/completions",
                    headers={
                        "content-type": "application/json",
                        "authorization": "Bearer client-token",
                    },
                    json={
                        "messages": [{"role": "user", "content": "hello"}],
                        "stream": False,
                    },
                )

            self.assertEqual(response.status_code, 200)
            self.assertEqual(
                captured_request["headers"]["authorization"], "Bearer secret-key"
            )

    def test_v1_proxy_streams_sse_responses(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            from fastapi.testclient import TestClient
            import lawftrack.server as server_module
        finally:
            sys.path.pop(0)

        class DummyResponse:
            def __init__(self) -> None:
                self.status_code = 200
                self.headers = {"content-type": "text/event-stream"}
                self._chunks = [
                    b'data: {"choices":[{"delta":{"content":"\xe4\xbd\xa0\xe5\xa5\xbd"}}]}\n\n',
                    b"data: [DONE]\n\n",
                ]

            async def aiter_raw(self):
                for chunk in self._chunks:
                    yield chunk

            async def aclose(self):
                return None

        class DummyAsyncClient:
            def build_request(self, **kwargs):
                return kwargs

            async def send(self, request, stream=False):
                return DummyResponse()

            async def aclose(self):
                return None

        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "config.json"
            config_path.write_text(
                json.dumps(
                    {
                        "vllm_endpoint": "http://localhost:8000/v1",
                        "api_key": "",
                    }
                ),
                encoding="utf-8",
            )

            with mock.patch.object(
                server_module.httpx, "AsyncClient", return_value=DummyAsyncClient()
            ):
                client = TestClient(server_module.create_app(Path(temp_dir)))
                response = client.post(
                    "/v1/chat/completions",
                    headers={"content-type": "application/json"},
                    json={"messages": [{"role": "user", "content": "hello"}], "stream": True},
                )

            self.assertEqual(response.status_code, 200)
            self.assertIn("text/event-stream", response.headers["content-type"])
            self.assertIn('data: {"choices":[{"delta":{"content":"\u4f60\u597d"}}]}', response.text)


if __name__ == "__main__":
    unittest.main()
