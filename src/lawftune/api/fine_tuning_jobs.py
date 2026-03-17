from __future__ import annotations

import json
import os
import signal
import subprocess
import sys
import time
import uuid
from pathlib import Path
from typing import Any

from lawftune.config import get_config_dir
from lawftune.train.algorithms import normalize_training_method


TERMINAL_JOB_STATUSES = {"cancelled", "failed", "succeeded"}


def process_is_running(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


class FineTuningJobStore:
    def __init__(self, config_dir: Path | None = None) -> None:
        self.config_dir = (
            config_dir if config_dir is not None else get_config_dir()
        ).expanduser()
        self.root_dir = self.config_dir / "fine_tuning"
        self.jobs_dir = self.root_dir / "jobs"
        self.jobs_dir.mkdir(parents=True, exist_ok=True)

    def list_jobs(self) -> list[dict[str, Any]]:
        jobs: list[dict[str, Any]] = []
        for job_dir in self.jobs_dir.iterdir():
            job_path = job_dir / "job.json"
            if not job_path.is_file():
                continue
            jobs.append(self._reconcile_job(self._load_job_from_path(job_path)))
        jobs.sort(key=lambda job: int(job.get("created_at", 0)), reverse=True)
        return jobs

    def get_job(self, job_id: str) -> dict[str, Any]:
        return self._reconcile_job(self._load_job(job_id))

    def create_job(self, payload: dict[str, Any]) -> dict[str, Any]:
        now = int(time.time())
        job_id = f"ftjob-{uuid.uuid4().hex[:24]}"
        job_dir = self.jobs_dir / job_id
        job_dir.mkdir(parents=True, exist_ok=False)

        stdout_path = job_dir / "stdout.log"
        stderr_path = job_dir / "stderr.log"
        process = self._spawn_job_worker(job_id, stdout_path, stderr_path)
        method = normalize_training_method(payload.get("method"))

        job = {
            "id": job_id,
            "object": "fine_tuning.job",
            "created_at": now,
            "error": None,
            "estimated_finish": None,
            "fine_tuned_model": None,
            "finished_at": None,
            "hyperparameters": payload.get("hyperparameters", {}),
            "integrations": payload.get("integrations", []),
            "metadata": payload.get("metadata", {}),
            "method": method,
            "model": payload["model"],
            "organization_id": "org-lawftune",
            "result_files": [],
            "seed": payload.get("seed"),
            "status": "running",
            "trained_tokens": None,
            "training_file": payload["training_file"],
            "validation_file": payload.get("validation_file"),
            "suffix": payload.get("suffix"),
            "process": {
                "pid": process.pid,
                "started_at": now,
                "exit_code": None,
            },
        }
        self._write_job(job)
        return job

    def cancel_job(self, job_id: str) -> dict[str, Any]:
        job = self._load_job(job_id)
        if job["status"] in TERMINAL_JOB_STATUSES:
            return job

        pid = int(job.get("process", {}).get("pid") or 0)
        if process_is_running(pid):
            os.kill(pid, signal.SIGTERM)

        now = int(time.time())
        job["status"] = "cancelled"
        job["finished_at"] = now
        job["error"] = None
        job.setdefault("process", {})["cancelled_at"] = now
        self._write_job(job)
        return job

    def _spawn_job_worker(
        self,
        job_id: str,
        stdout_path: Path,
        stderr_path: Path,
    ) -> subprocess.Popen[bytes]:
        command = [
            sys.executable,
            "-m",
            "lawftune.train",
            "--config-dir",
            str(self.config_dir),
            "--job-id",
            job_id,
        ]
        with stdout_path.open("ab") as stdout_handle, stderr_path.open(
            "ab"
        ) as stderr_handle:
            return subprocess.Popen(
                command,
                stdout=stdout_handle,
                stderr=stderr_handle,
            )

    def _load_job(self, job_id: str) -> dict[str, Any]:
        job_path = self.jobs_dir / job_id / "job.json"
        if not job_path.is_file():
            raise FileNotFoundError(job_id)
        return self._load_job_from_path(job_path)

    def _load_job_from_path(self, job_path: Path) -> dict[str, Any]:
        return json.loads(job_path.read_text(encoding="utf-8"))

    def _write_job(self, job: dict[str, Any]) -> None:
        job_dir = self.jobs_dir / job["id"]
        job_dir.mkdir(parents=True, exist_ok=True)
        job_path = job_dir / "job.json"
        job_path.write_text(json.dumps(job, indent=2) + "\n", encoding="utf-8")

    def _reconcile_job(self, job: dict[str, Any]) -> dict[str, Any]:
        if job["status"] in TERMINAL_JOB_STATUSES:
            return job

        pid = int(job.get("process", {}).get("pid") or 0)
        if process_is_running(pid):
            return job

        now = int(time.time())
        job["status"] = "failed"
        job["finished_at"] = now
        job["error"] = {
            "code": "process_exited",
            "message": "Fine-tuning worker exited unexpectedly.",
        }
        job.setdefault("process", {})["exit_code"] = 1
        self._write_job(job)
        return job
