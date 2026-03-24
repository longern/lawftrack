from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path
import unittest
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from lawftrack.api.fine_tuning_jobs import FineTuningJobStore  # noqa: E402

sys.path.pop(0)


class FineTuningJobStoreTests(unittest.TestCase):
    def test_create_job_writes_job_file_before_worker_starts(self) -> None:
        class DummyPopen:
            pid = 5150

        with tempfile.TemporaryDirectory() as temp_dir:
            store = FineTuningJobStore(Path(temp_dir))

            def spawn_worker(job_id: str, stdout_path: Path, stderr_path: Path) -> DummyPopen:
                job_path = Path(temp_dir) / "fine_tuning" / "jobs" / job_id / "job.json"
                self.assertTrue(job_path.exists())
                job_payload = json.loads(job_path.read_text(encoding="utf-8"))
                self.assertIsNone(job_payload["process"]["pid"])
                self.assertEqual(job_payload["status"], "running")
                self.assertEqual(stdout_path.name, "stdout.log")
                self.assertEqual(stderr_path.name, "stderr.log")
                return DummyPopen()

            with mock.patch.object(store, "_spawn_job_worker", side_effect=spawn_worker):
                job = store.create_job(
                    {
                        "model": "Qwen/Qwen2.5-7B-Instruct",
                        "training_file": "dataset-name",
                        "method": {"type": "sft"},
                    }
                )

            self.assertEqual(job["process"]["pid"], 5150)
            self.assertIsNone(job["lora_adapter"])

    def test_get_job_logs_returns_tail_and_download_keeps_full_content(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            store = FineTuningJobStore(Path(temp_dir))
            job_dir = store.jobs_dir / "ftjob-demo"
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

            payload = store.get_job_logs("ftjob-demo", tail_lines=2)

            self.assertEqual(payload["stdout"], "line-2\nline-3\n")
            self.assertEqual(payload["stderr"], "warn-2\nwarn-3\n")
            self.assertEqual(payload["stdout_total_lines"], 3)
            self.assertEqual(payload["stderr_total_lines"], 3)
            self.assertTrue(payload["stdout_truncated"])
            self.assertTrue(payload["stderr_truncated"])
            self.assertEqual(payload["displayed_line_limit"], 2)

            download_text = store.get_job_logs_download_text("ftjob-demo")
            self.assertIn("===== stdout =====", download_text)
            self.assertIn("line-1\nline-2\nline-3", download_text)
            self.assertIn("===== stderr =====", download_text)
            self.assertIn("warn-1\nwarn-2\nwarn-3", download_text)


if __name__ == "__main__":
    unittest.main()
