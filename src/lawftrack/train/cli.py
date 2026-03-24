from __future__ import annotations

import argparse
import json
import sys
import traceback
from pathlib import Path
import time
from typing import Any

from ..config import load_config
from ..config import load_raw_config
from .algorithms import normalize_training_method
from .algorithms import build_fine_tuned_model_name
from .algorithms import get_job_output_dir
from .algorithms import is_lora_adapter_artifact
from .algorithms import run_algorithm_job
from ..vllm import is_local_vllm_endpoint
from ..vllm import load_lora_adapter
from ..vllm import sleep_vllm
from ..vllm import wake_up_vllm


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="lawftrack train",
        description="Run a lawftrack training worker.",
    )
    parser.add_argument(
        "action",
        choices=["run-job", "sft", "lawf"],
        nargs="?",
        default="run-job",
        help="training action to run (default: run-job)",
    )
    parser.add_argument(
        "--config-dir",
        type=Path,
        required=True,
        help="directory used to load runtime state",
    )
    parser.add_argument(
        "--job-id",
        required=True,
        help="fine-tuning job identifier",
    )
    return parser


def load_job(config_dir: Path, job_id: str) -> dict:
    job_path = config_dir / "fine_tuning" / "jobs" / job_id / "job.json"
    return json.loads(job_path.read_text(encoding="utf-8"))


def write_job(config_dir: Path, job: dict[str, Any]) -> None:
    job_path = config_dir / "fine_tuning" / "jobs" / job["id"] / "job.json"
    job_path.write_text(json.dumps(job, indent=2) + "\n", encoding="utf-8")


def fail_job(config_dir: Path, job: dict[str, Any], *, code: str, message: str) -> None:
    now = int(time.time())
    process = job.setdefault("process", {})
    process["exit_code"] = 1
    job["finished_at"] = now
    job["status"] = "failed"
    job["error"] = {
        "code": code,
        "message": message,
    }
    write_job(config_dir, job)


def summarize_job_stderr(config_dir: Path, job_id: str, fallback: str) -> str:
    stderr_path = config_dir / "fine_tuning" / "jobs" / job_id / "stderr.log"
    if not stderr_path.is_file():
        return fallback

    lines = [
        line.strip()
        for line in stderr_path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    if not lines:
        return fallback

    return lines[-1]


def get_local_vllm_sleep_config(config_dir: Path) -> tuple[bool, int]:
    payload = load_raw_config(config_dir)
    training_config = payload.get("training")
    if not isinstance(training_config, dict):
        return False, 1

    sleep_config = training_config.get("local_vllm_sleep")
    if not isinstance(sleep_config, dict):
        return False, 1

    enabled = bool(sleep_config.get("enabled"))
    raw_level = sleep_config.get("level", 1)
    try:
        level = int(raw_level)
    except (TypeError, ValueError):
        level = 1
    return enabled, level


def maybe_sleep_local_vllm(config_dir: Path) -> bool:
    config = load_config(config_dir)
    enabled, level = get_local_vllm_sleep_config(config_dir)
    if not enabled or not is_local_vllm_endpoint(config["vllm_endpoint"]):
        return False

    result = sleep_vllm(
        base_url=config["vllm_endpoint"],
        api_key=config["api_key"],
        level=level,
    )
    if not result.ok:
        raise RuntimeError(
            "Configured local vLLM sleep before training, but the sleep request failed. "
            "Ensure vLLM was started with VLLM_SERVER_DEV_MODE=1 and --enable-sleep-mode. "
            f"Details: {result.message}"
        )
    return True


def maybe_wake_local_vllm(config_dir: Path, was_slept: bool) -> None:
    if not was_slept:
        return

    config = load_config(config_dir)
    result = wake_up_vllm(
        base_url=config["vllm_endpoint"],
        api_key=config["api_key"],
    )
    if not result.ok:
        print(
            "Warning: failed to wake vLLM after training. "
            f"Details: {result.message}",
            file=sys.stderr,
        )


def finalize_job(config_dir: Path, job: dict[str, Any], exit_code: int) -> None:
    now = int(time.time())
    process = job.setdefault("process", {})
    process["exit_code"] = exit_code
    job["finished_at"] = now

    if exit_code != 0:
        summary = summarize_job_stderr(
            config_dir,
            str(job["id"]),
            f"Fine-tuning worker exited with code {exit_code}.",
        )
        job["status"] = "failed"
        job["error"] = {
            "code": "training_failed",
            "message": summary,
        }
        write_job(config_dir, job)
        return

    output_dir = get_job_output_dir(config_dir, job)
    adapter_name = build_fine_tuned_model_name(job)
    adapter_state: dict[str, Any] = {
        "name": adapter_name,
        "path": str(output_dir),
        "base_model": str(job["model"]),
    }

    if is_lora_adapter_artifact(output_dir):
        config = load_config(config_dir)
        load_result = load_lora_adapter(
            base_url=config["vllm_endpoint"],
            api_key=config["api_key"],
            lora_name=adapter_name,
            lora_path=output_dir,
            load_inplace=True,
        )
        adapter_state["status"] = "loaded" if load_result.ok else "load_failed"
        adapter_state["updated_at"] = now
        if load_result.response_body:
            adapter_state["message"] = load_result.response_body
        if not load_result.ok:
            adapter_state["error"] = {
                "message": load_result.message,
                "status_code": load_result.status_code,
            }
        job["fine_tuned_model"] = adapter_name
    else:
        adapter_state["status"] = "not_a_lora_adapter"
        adapter_state["updated_at"] = now
        adapter_state["error"] = {
            "message": (
                f"Training output at {output_dir} does not contain "
                "an adapter_config.json file, so it cannot be loaded as a LoRA adapter."
            )
        }

    job["lora_adapter"] = adapter_state
    job["status"] = "succeeded"
    job["error"] = None
    write_job(config_dir, job)


def run_train_worker(args: argparse.Namespace) -> int:
    config_dir = args.config_dir.expanduser()
    job = load_job(config_dir, args.job_id)
    was_slept = False

    try:
        was_slept = maybe_sleep_local_vllm(config_dir)
        if args.action == "run-job":
            method = normalize_training_method(job.get("method"))
            exit_code = run_algorithm_job(method["type"], job, config_dir)
        else:
            exit_code = run_algorithm_job(args.action, job, config_dir)
    except Exception as exc:
        traceback.print_exc(file=sys.stderr)
        fail_job(
            config_dir,
            job,
            code="worker_error",
            message=summarize_job_stderr(config_dir, str(job["id"]), str(exc)),
        )
        return 1
    finally:
        maybe_wake_local_vllm(config_dir, was_slept)

    if args.action == "run-job":
        finalize_job(config_dir, job, exit_code)
        return exit_code

    finalize_job(config_dir, job, exit_code)
    return exit_code


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return run_train_worker(args)
