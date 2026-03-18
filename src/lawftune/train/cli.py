from __future__ import annotations

import argparse
import json
from pathlib import Path
import time
from typing import Any

from lawftune.config import load_config
from lawftune.train.algorithms import normalize_training_method
from lawftune.train.algorithms import build_fine_tuned_model_name
from lawftune.train.algorithms import get_job_output_dir
from lawftune.train.algorithms import is_lora_adapter_artifact
from lawftune.train.algorithms import run_algorithm_job
from lawftune.vllm import load_lora_adapter


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="lawftune train",
        description="Run a lawftune training worker.",
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


def finalize_job(config_dir: Path, job: dict[str, Any], exit_code: int) -> None:
    now = int(time.time())
    process = job.setdefault("process", {})
    process["exit_code"] = exit_code
    job["finished_at"] = now

    if exit_code != 0:
        job["status"] = "failed"
        job["error"] = {
            "code": "training_failed",
            "message": f"Fine-tuning worker exited with code {exit_code}.",
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

    if args.action == "run-job":
        method = normalize_training_method(job.get("method"))
        exit_code = run_algorithm_job(method["type"], job, config_dir)
        finalize_job(config_dir, job, exit_code)
        return exit_code

    exit_code = run_algorithm_job(args.action, job, config_dir)
    finalize_job(config_dir, job, exit_code)
    return exit_code


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return run_train_worker(args)
