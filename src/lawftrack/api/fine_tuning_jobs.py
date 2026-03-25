from __future__ import annotations

import ast
from collections import deque
import json
import os
import re
import signal
import subprocess
import sys
import time
import uuid
from pathlib import Path
from typing import Any

from ..config import get_config_dir
from ..train.algorithms import normalize_training_method


TERMINAL_JOB_STATUSES = {"cancelled", "failed", "succeeded"}
NUMERIC_METRIC_FIELDS = {
    "eval_loss",
    "loss",
    "train_loss",
    "train_mean_token_accuracy",
    "valid_loss",
    "valid_mean_token_accuracy",
    "full_valid_loss",
    "full_valid_mean_token_accuracy",
    "anchor_probs",
    "learning_rate",
    "epoch",
    "step",
    "global_step",
}
METRIC_ALIAS_MAP = {
    "eval_loss": "valid_loss",
    "loss": "train_loss",
    "global_step": "step",
}
INLINE_METRIC_PATTERN = re.compile(
    r"([A-Za-z_][A-Za-z0-9_ ]*?)\s*[:=]\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)"
)
DEFAULT_LOG_TAIL_LINES = 2000


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
            "organization_id": "org-lawftrack",
            "result_files": [],
            "seed": payload.get("seed"),
            "status": "running",
            "trained_tokens": None,
            "training_file": payload["training_file"],
            "validation_file": payload.get("validation_file"),
            "suffix": payload.get("suffix"),
            "lora_adapter": None,
            "process": {
                "pid": None,
                "started_at": now,
                "exit_code": None,
            },
        }
        self._write_job(job)

        try:
            process = self._spawn_job_worker(job_id, stdout_path, stderr_path)
        except Exception as exc:
            job["status"] = "failed"
            job["finished_at"] = int(time.time())
            job["error"] = {
                "code": "worker_spawn_failed",
                "message": f"Could not start fine-tuning worker: {exc}",
            }
            self._write_job(job)
            raise

        job["process"]["pid"] = process.pid
        self._write_job(job)
        return job

    def get_job_logs(
        self,
        job_id: str,
        *,
        tail_lines: int = DEFAULT_LOG_TAIL_LINES,
    ) -> dict[str, Any]:
        job = self.get_job(job_id)
        job_dir = self.jobs_dir / job_id
        stdout_path = job_dir / "stdout.log"
        stderr_path = job_dir / "stderr.log"
        stdout, stdout_total_lines, stdout_truncated = self._read_log_tail(
            stdout_path,
            tail_lines,
        )
        stderr, stderr_total_lines, stderr_truncated = self._read_log_tail(
            stderr_path,
            tail_lines,
        )
        return {
            "object": "fine_tuning.job.logs",
            "id": job_id,
            "stdout": stdout,
            "stderr": stderr,
            "stdout_total_lines": stdout_total_lines,
            "stderr_total_lines": stderr_total_lines,
            "stdout_truncated": stdout_truncated,
            "stderr_truncated": stderr_truncated,
            "displayed_line_limit": tail_lines,
            "status": job["status"],
        }

    def get_job_logs_download_text(self, job_id: str) -> str:
        self.get_job(job_id)
        job_dir = self.jobs_dir / job_id
        stdout_path = job_dir / "stdout.log"
        stderr_path = job_dir / "stderr.log"
        stdout = stdout_path.read_text(encoding="utf-8") if stdout_path.is_file() else ""
        stderr = stderr_path.read_text(encoding="utf-8") if stderr_path.is_file() else ""
        return "\n".join(
            [
                f"Fine-tuning job logs: {job_id}",
                "",
                "===== stdout =====",
                stdout.rstrip("\n"),
                "",
                "===== stderr =====",
                stderr.rstrip("\n"),
                "",
            ]
        )

    def list_job_events(self, job_id: str) -> list[dict[str, Any]]:
        job = self.get_job(job_id)
        job_dir = self.jobs_dir / job_id
        events: list[dict[str, Any]] = []
        base_time = int(job.get("created_at", time.time()))

        for stream_name in ("stdout", "stderr"):
            log_path = job_dir / f"{stream_name}.log"
            if not log_path.is_file():
                continue
            for line_index, raw_line in enumerate(
                log_path.read_text(encoding="utf-8").splitlines()
            ):
                message = raw_line.strip()
                if not message:
                    continue
                metrics = self._parse_metrics_line(message)
                data = {"type": "message", "stream": stream_name}
                if metrics is not None:
                    data = {
                        "type": "metrics",
                        "stream": stream_name,
                        "step": metrics.get("step"),
                        "metrics": metrics,
                    }
                events.append(
                    {
                        "id": f"ftevent-{job_id}-{stream_name}-{line_index}",
                        "object": "fine_tuning.job.event",
                        "created_at": base_time + line_index,
                        "level": self._infer_event_level(stream_name, message),
                        "message": message,
                        "data": data,
                    }
                )

        events.sort(key=lambda event: (int(event["created_at"]), str(event["id"])))
        return events

    def list_job_checkpoints(self, job_id: str) -> list[dict[str, Any]]:
        job = self.get_job(job_id)
        checkpoints: list[dict[str, Any]] = []
        metrics_points = self._read_structured_metric_points(job_id)
        if not metrics_points:
            metrics_points = self._extract_metric_points(self.list_job_events(job_id))
        for index, metrics in enumerate(metrics_points):
            step_number = int(metrics.get("step") or (index + 1))
            checkpoints.append(
                {
                    "id": f"ftckpt-{job_id}-{step_number}",
                    "object": "fine_tuning.job.checkpoint",
                    "created_at": int(job.get("created_at", time.time())) + index,
                    "fine_tuning_job_id": job_id,
                    "fine_tuned_model_checkpoint": (
                        job.get("fine_tuned_model")
                        if index == len(metrics_points) - 1 and job.get("fine_tuned_model")
                        else None
                    ),
                    "step_number": step_number,
                    "metrics": metrics,
                }
            )
        return checkpoints

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
            "lawftrack.train",
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

    def _read_log_tail(self, log_path: Path, tail_lines: int) -> tuple[str, int, bool]:
        if not log_path.is_file():
            return "", 0, False

        total_lines = 0
        buffer: deque[str] = deque(maxlen=tail_lines)
        with log_path.open("r", encoding="utf-8") as handle:
            for line in handle:
                total_lines += 1
                buffer.append(line)

        return "".join(buffer), total_lines, total_lines > tail_lines

    def _reconcile_job(self, job: dict[str, Any]) -> dict[str, Any]:
        if job["status"] in TERMINAL_JOB_STATUSES:
            return job

        pid = int(job.get("process", {}).get("pid") or 0)
        if pid <= 0:
            return job
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

    def _parse_metrics_line(self, line: str) -> dict[str, float | int] | None:
        text = line.strip()
        payload: dict[str, Any] | None = None
        if text.startswith("{") and text.endswith("}"):
            try:
                parsed = json.loads(text)
            except json.JSONDecodeError:
                try:
                    parsed = ast.literal_eval(text)
                except (ValueError, SyntaxError):
                    parsed = None
            if isinstance(parsed, dict):
                payload = parsed

        if payload is not None:
            return self._normalize_metrics_payload(payload)

        metrics: dict[str, float | int] = {}
        if payload is None:
            for raw_key, raw_value in INLINE_METRIC_PATTERN.findall(text):
                key = raw_key.strip().lower().replace(" ", "_")
                if key not in NUMERIC_METRIC_FIELDS:
                    continue
                normalized_key = METRIC_ALIAS_MAP.get(key, key)
                value = float(raw_value)
                metrics[normalized_key] = int(value) if normalized_key == "step" else value

        return metrics or None

    def _normalize_metrics_payload(
        self,
        payload: dict[str, Any],
    ) -> dict[str, float | int] | None:
        metrics: dict[str, float | int] = {}
        for key, value in payload.items():
            if key not in NUMERIC_METRIC_FIELDS or not isinstance(value, (int, float)):
                continue
            normalized_key = METRIC_ALIAS_MAP.get(key, key)
            metrics[normalized_key] = int(value) if normalized_key == "step" else float(value)
        return metrics or None

    def _read_structured_metric_points(self, job_id: str) -> list[dict[str, Any]]:
        trainer_state_path = (
            self.jobs_dir / job_id / "artifacts" / "model" / "trainer_state.json"
        )
        if not trainer_state_path.is_file():
            return []

        try:
            payload = json.loads(trainer_state_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return []

        log_history = payload.get("log_history")
        if not isinstance(log_history, list):
            return []

        points: list[dict[str, Any]] = []
        for entry in log_history:
            if not isinstance(entry, dict):
                continue
            raw_step = entry.get("step")
            if not isinstance(raw_step, (int, float)):
                continue

            # `trainer_state.json` commonly includes a final aggregate `train_loss`
            # summary; only per-step `loss` / validation metrics should appear on the curve.
            metrics = self._normalize_metrics_payload(entry)
            if metrics is None or (
                "loss" not in entry
                and "eval_loss" not in entry
                and "valid_loss" not in entry
                and "full_valid_loss" not in entry
            ):
                continue
            metrics["step"] = int(raw_step)
            points.append(metrics)
        return points

    def _extract_metric_points(self, events: list[dict[str, Any]]) -> list[dict[str, Any]]:
        points: list[dict[str, Any]] = []
        for index, event in enumerate(events):
            data = event.get("data")
            if not isinstance(data, dict) or data.get("type") != "metrics":
                continue
            metrics = data.get("metrics")
            if not isinstance(metrics, dict):
                continue
            point = dict(metrics)
            if "step" not in point:
                point["step"] = index + 1
            points.append(point)
        return points

    def _infer_event_level(self, stream_name: str, message: str) -> str:
        lowered = message.lower()
        if stream_name == "stderr" or "error" in lowered or "traceback" in lowered:
            return "error"
        if "warn" in lowered:
            return "warn"
        return "info"
