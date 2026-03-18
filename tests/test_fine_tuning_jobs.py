from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path
import unittest
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from lawftune.api.fine_tuning_jobs import FineTuningJobStore  # noqa: E402

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


if __name__ == "__main__":
    unittest.main()
