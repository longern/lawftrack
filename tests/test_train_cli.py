from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from lawftune.train.cli import finalize_job  # noqa: E402

sys.path.pop(0)


class TrainCliTests(unittest.TestCase):
    def test_finalize_job_uses_stderr_summary_for_failed_jobs(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            config_dir = Path(temp_dir)
            job_dir = config_dir / "fine_tuning" / "jobs" / "ftjob-demo"
            job_dir.mkdir(parents=True, exist_ok=True)
            job = {
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
                "method": {"type": "lawf"},
                "model": "demo-model",
                "organization_id": "org-lawftune",
                "result_files": [],
                "seed": None,
                "status": "running",
                "trained_tokens": None,
                "training_file": "file-training",
                "validation_file": None,
                "suffix": None,
                "lora_adapter": None,
                "process": {"pid": 123, "started_at": 1000, "exit_code": None},
            }
            (job_dir / "job.json").write_text(
                json.dumps(job, indent=2) + "\n",
                encoding="utf-8",
            )
            (job_dir / "stderr.log").write_text(
                "Traceback (most recent call last):\n"
                "  File \"worker.py\", line 1, in <module>\n"
                "    raise ValueError('boom')\n"
                "ValueError: boom\n",
                encoding="utf-8",
            )

            finalize_job(config_dir, job, 1)

            payload = json.loads((job_dir / "job.json").read_text(encoding="utf-8"))
            self.assertEqual(payload["status"], "failed")
            self.assertEqual(payload["error"]["code"], "training_failed")
            self.assertEqual(payload["error"]["message"], "ValueError: boom")


if __name__ == "__main__":
    unittest.main()
