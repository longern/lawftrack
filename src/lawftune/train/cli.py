from __future__ import annotations

import argparse
import json
from pathlib import Path

from lawftune.train.algorithms import normalize_training_method
from lawftune.train.algorithms import run_algorithm_job


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


def run_train_worker(args: argparse.Namespace) -> int:
    config_dir = args.config_dir.expanduser()
    job = load_job(config_dir, args.job_id)

    if args.action == "run-job":
        method = normalize_training_method(job.get("method"))
        return run_algorithm_job(method["type"], job, config_dir)

    return run_algorithm_job(args.action, job, config_dir)


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return run_train_worker(args)
