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
            self.assertIn("lawftune console", response.text)
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
                    "title": "多轮样本",
                    "messages": [
                        {"role": "user", "content": "问题一"},
                        {"role": "assistant", "content": "回答一"},
                        {"role": "user", "content": "问题二"},
                        {"role": "assistant", "content": "回答二"},
                    ],
                    "anchors": [
                        {
                            "message_index": 1,
                            "token_index": 0,
                            "replacement_token": "改写一",
                        },
                        {
                            "message_index": 3,
                            "token_index": 1,
                            "replacement_token": "改写二",
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
            self.assertEqual(lawf_records[0]["completion"][0]["content"], "回答一")
            self.assertEqual(lawf_records[0]["anchors"][0]["token_index"], 0)
            self.assertEqual(lawf_records[1]["completion"][0]["content"], "回答二")
            self.assertEqual(lawf_records[1]["anchors"][0]["token_index"], 1)

    def test_exported_dataset_file_can_be_used_for_fine_tuning_job(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            import lawftune.api.fine_tuning_jobs as jobs_module
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
                            {"role": "user", "content": "你好"},
                            {"role": "assistant", "content": "您好"},
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
                        "organization_id": "org-lawftune",
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

    def test_datasets_api_lists_and_updates_dataset_samples(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            client = self._create_client(temp_dir)
            created_dataset = client.post(
                "/api/datasets/import",
                files={
                    "file": (
                        "train.jsonl",
                        (
                            b'{"messages":[{"role":"user","content":"\xe4\xbd\xa0\xe5\xa5\xbd"},{"role":"assistant","content":"\xe4\xbd\xa0\xe5\xa5\xbd\xef\xbc\x8c\xe6\x88\x91\xe6\x98\xaf\xe6\xb3\x95\xe5\xbe\x8b\xe5\x8a\xa9\xe6\x89\x8b"}]}\n'
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
            self.assertEqual(sample["messages"][1]["content"], "你好，我是法律助手")

            update_response = client.put(
                f"/api/datasets/{created_dataset['id']}/samples/{sample['id']}",
                json={
                    "title": "你好样本",
                    "messages": [
                        {"role": "user", "content": "你好"},
                        {"role": "assistant", "content": "您好，我是法律助手，可以继续帮您分析。"},
                    ],
                    "source_messages": sample["source_messages"],
                    "edits": [
                        {
                            "message_index": 1,
                            "token_index": 0,
                            "original_token": "你好",
                            "replacement_token": "您好",
                            "regenerated_from_token_index": 1,
                        }
                    ],
                },
            )
            self.assertEqual(update_response.status_code, 200)
            updated_sample = update_response.json()
            self.assertEqual(updated_sample["title"], "你好样本")
            self.assertEqual(updated_sample["messages"][1]["content"], "您好，我是法律助手，可以继续帮您分析。")
            self.assertEqual(updated_sample["edits"][0]["replacement_token"], "您好")

            samples_path = (
                Path(temp_dir)
                / "datasets"
                / created_dataset["id"]
                / "samples.json"
            )
            self.assertTrue(samples_path.is_file())
            saved_samples = json.loads(samples_path.read_text(encoding="utf-8"))
            self.assertEqual(saved_samples[0]["title"], "你好样本")

    def test_datasets_api_can_create_blank_sample(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            client = self._create_client(temp_dir)
            created_dataset = client.post(
                "/api/datasets",
                json={"name": "manual-samples", "base_model": "Qwen/Qwen2.5-7B-Instruct"},
            ).json()

            create_sample_response = client.post(
                f"/api/datasets/{created_dataset['id']}/samples",
                json={"title": "新样本"},
            )
            self.assertEqual(create_sample_response.status_code, 200)
            sample = create_sample_response.json()
            self.assertEqual(sample["title"], "新样本")
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
                json={"title": "待删除样本"},
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
        with tempfile.TemporaryDirectory() as temp_dir:
            client = self._create_client(temp_dir)
            created_dataset = client.post(
                "/api/datasets",
                json={"name": "manual-samples", "base_model": "Qwen/Qwen2.5-7B-Instruct"},
            ).json()

            created_sample = client.post(
                f"/api/datasets/{created_dataset['id']}/samples",
                json={
                    "title": "新样本",
                    "messages": [
                        {"role": "user", "content": "问题"},
                        {"role": "assistant", "content": "回答"},
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
            self.assertEqual(samples[0]["messages"][1]["content"], "回答")

    def test_dataset_metadata_update_does_not_reset_existing_samples(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            client = self._create_client(temp_dir)
            created_dataset = client.post(
                "/api/datasets/import",
                files={
                    "file": (
                        "train.jsonl",
                        (
                            b'{"messages":[{"role":"user","content":"\xe4\xbd\xa0\xe5\xa5\xbd"},{"role":"assistant","content":"\xe5\x8e\x9f\xe5\xa7\x8b\xe5\x9b\x9e\xe7\xad\x94"}]}\n'
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
                        {"role": "user", "content": "你好"},
                        {"role": "assistant", "content": "编辑后的回答"},
                    ],
                    "source_messages": sample["source_messages"],
                    "edits": [],
                },
            )

            update_response = client.patch(
                f"/api/datasets/{created_dataset['id']}",
                json={
                    "base_model": "/models/local-qwen",
                },
            )
            self.assertEqual(update_response.status_code, 200)

            list_samples_response = client.get(f"/api/datasets/{created_dataset['id']}/samples")
            self.assertEqual(list_samples_response.status_code, 200)
            samples = list_samples_response.json()["data"]
            self.assertEqual(len(samples), 1)
            self.assertEqual(samples[0]["messages"][1]["content"], "编辑后的回答")

    def test_dataset_sample_tokenize_and_continue_use_model_tokenizer(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            import lawftune.api.datasets_api as datasets_api_module
            import lawftune.server as server_module
            from fastapi.testclient import TestClient
        finally:
            sys.path.pop(0)

        class DummyTokenizer:
            is_fast = True

            def __call__(self, text, add_special_tokens=False, return_offsets_mapping=False):
                mapping = {
                    "你好，助手": {
                        "input_ids": [11, 12, 13],
                        "offset_mapping": [(0, 2), (2, 3), (3, 5)],
                    },
                    "您好": {
                        "input_ids": [21],
                        "offset_mapping": [(0, 2)],
                    },
                }
                payload = mapping[text]
                if return_offsets_mapping:
                    return payload
                return {"input_ids": payload["input_ids"]}

            def convert_ids_to_tokens(self, token_id):
                return {11: "你好", 12: "，", 13: "助手", 21: "您好"}[token_id]

            def decode(self, token_ids, clean_up_tokenization_spaces=False):
                return "".join({11: "你好", 12: "，", 13: "助手", 21: "您好"}[token_id] for token_id in token_ids)

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
                self.url = url
                self.headers = headers
                self.json_payload = json
                return DummyResponse(
                    {
                        "choices": [
                            {
                                "message": {
                                    "content": "，我是新的助手回答",
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
                "/api/datasets/import",
                files={
                    "file": (
                        "train.jsonl",
                        b'{"messages":[{"role":"user","content":"hi"},{"role":"assistant","content":"\xe4\xbd\xa0\xe5\xa5\xbd\xef\xbc\x8c\xe5\x8a\xa9\xe6\x89\x8b"}]}\n',
                        "application/jsonl",
                    )
                },
            ).json()
            client.patch(
                f"/api/datasets/{created_dataset['id']}",
                json={"base_model": "Qwen/Qwen2.5-7B-Instruct"},
            )
            sample = client.get(f"/api/datasets/{created_dataset['id']}/samples").json()["data"][0]

            with mock.patch.object(datasets_api_module, "tokenize_text", side_effect=lambda model, text: [
                {"token_index": 0, "token_id": 11, "token": "你好", "text": "你好", "start": 0, "end": 2},
                {"token_index": 1, "token_id": 12, "token": "，", "text": "，", "start": 2, "end": 3},
                {"token_index": 2, "token_id": 13, "token": "助手", "text": "助手", "start": 3, "end": 5},
            ]):
                tokenize_response = client.post(
                    f"/api/datasets/{created_dataset['id']}/samples/{sample['id']}/tokenize",
                    json={"model": "Qwen/Qwen2.5-7B-Instruct"},
                )
            self.assertEqual(tokenize_response.status_code, 200)
            self.assertEqual(tokenize_response.json()["messages"][1]["tokens"][0]["token"], "你好")

            with mock.patch.object(datasets_api_module, "build_continuation_prefix", return_value=("您好", "你好", "您好")):
                with mock.patch.object(server_module.httpx, "AsyncClient", return_value=DummyAsyncClient()):
                    with mock.patch.object(datasets_api_module.httpx, "AsyncClient", return_value=DummyAsyncClient()):
                        with mock.patch.object(
                            datasets_api_module,
                            "tokenize_text",
                            return_value=[
                                {"token_index": 0, "token_id": 21, "token": "您好", "text": "您好", "start": 0, "end": 2},
                                {"token_index": 1, "token_id": 12, "token": "，", "text": "，", "start": 2, "end": 3},
                                {"token_index": 2, "token_id": 13, "token": "助手", "text": "助手", "start": 7, "end": 9},
                            ],
                        ):
                            continue_response = client.post(
                                f"/api/datasets/{created_dataset['id']}/samples/{sample['id']}/continue",
                                json={
                                    "model": "Qwen/Qwen2.5-7B-Instruct",
                                    "message_index": 1,
                                    "token_index": 0,
                                    "replacement_token": "您好",
                                },
                            )

            self.assertEqual(continue_response.status_code, 200)
            continued_payload = continue_response.json()
            continued_sample = continued_payload["sample"]
            self.assertEqual(continued_sample["messages"][1]["content"], "您好，我是新的助手回答")
            self.assertEqual(continued_sample["edits"][0]["original_token"], "你好")
            self.assertEqual(continued_sample["edits"][0]["replacement_token"], "您好")
            self.assertEqual(continued_payload["tokenization"]["messages"][1]["tokens"][0]["text"], "您好")

            save_response = client.put(
                f"/api/datasets/{created_dataset['id']}/samples/{sample['id']}",
                json={
                    "title": continued_sample["title"],
                    "messages": continued_sample["messages"],
                    "source_messages": continued_sample["source_messages"],
                    "edits": [
                        {
                            **continued_sample["edits"][0],
                            "regenerated_from_token_index": None,
                        }
                    ],
                },
            )
            self.assertEqual(save_response.status_code, 200)

    def test_continue_preserves_edits_before_current_token(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            import lawftune.api.datasets_api as datasets_api_module
            import lawftune.server as server_module
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
                return DummyResponse(
                    {
                        "choices": [
                            {
                                "message": {
                                    "content": " B X",
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
                json={"name": "preserve-edits", "base_model": "Qwen/Qwen2.5-7B-Instruct"},
            ).json()
            created_sample = client.post(
                f"/api/datasets/{created_dataset['id']}/samples",
                json={
                    "title": "样本",
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
                    "source_messages": created_sample["source_messages"],
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
                with mock.patch.object(server_module.httpx, "AsyncClient", return_value=DummyAsyncClient()):
                    with mock.patch.object(datasets_api_module.httpx, "AsyncClient", return_value=DummyAsyncClient()):
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

    def test_dataset_sample_can_generate_full_assistant_message(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            import lawftune.api.datasets_api as datasets_api_module
            import lawftune.server as server_module
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
                self.url = url
                self.headers = headers
                self.json_payload = json
                return DummyResponse(
                    {
                        "choices": [
                            {
                                "message": {
                                    "content": "这是完整生成的助手消息",
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
                json={
                    "name": "full-generate",
                    "base_model": "Qwen/Qwen2.5-7B-Instruct",
                },
            ).json()
            created_sample = client.post(
                f"/api/datasets/{created_dataset['id']}/samples",
                json={
                    "title": "新样本",
                    "messages": [
                        {"role": "user", "content": "请介绍一下合同审查"},
                    ],
                },
            ).json()

            with mock.patch.object(server_module.httpx, "AsyncClient", return_value=DummyAsyncClient()):
                with mock.patch.object(datasets_api_module.httpx, "AsyncClient", return_value=DummyAsyncClient()):
                    generate_response = client.post(
                        f"/api/datasets/{created_dataset['id']}/samples/{created_sample['id']}/generate",
                        json={
                            "model": "Qwen/Qwen2.5-7B-Instruct",
                        },
                    )

            self.assertEqual(generate_response.status_code, 200)
            generated_sample = generate_response.json()["sample"]
            self.assertEqual(len(generated_sample["messages"]), 2)
            self.assertEqual(generated_sample["messages"][1]["role"], "assistant")
            self.assertEqual(generated_sample["messages"][1]["content"], "这是完整生成的助手消息")

    def test_v1_proxy_forwards_to_configured_vllm_endpoint(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            from fastapi.testclient import TestClient
            import lawftune.server as server_module
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
            import lawftune.server as server_module
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
            import lawftune.server as server_module
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
            self.assertIn('data: {"choices":[{"delta":{"content":"你好"}}]}', response.text)


if __name__ == "__main__":
    unittest.main()
