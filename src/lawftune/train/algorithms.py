from __future__ import annotations

import signal
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any


DEFAULT_TRAINING_ALGORITHM = "sft"


@dataclass(frozen=True)
class TrainingAlgorithm:
    name: str
    aliases: tuple[str, ...]
    description: str


TRAINING_ALGORITHMS: dict[str, TrainingAlgorithm] = {
    "sft": TrainingAlgorithm(
        name="sft",
        aliases=("supervised", "supervised_fine_tuning"),
        description="Run supervised fine-tuning through the TRL CLI.",
    ),
    "lawf": TrainingAlgorithm(
        name="lawf",
        aliases=("lawftune",),
        description="Run the native LAwF-style training worker.",
    ),
}


def normalize_training_method(method: dict[str, Any] | None) -> dict[str, Any]:
    raw_type = DEFAULT_TRAINING_ALGORITHM
    if method is not None:
        raw_type = str(method.get("type", DEFAULT_TRAINING_ALGORITHM))

    normalized_type = raw_type.strip().lower()
    for algorithm in TRAINING_ALGORITHMS.values():
        if normalized_type == algorithm.name or normalized_type in algorithm.aliases:
            normalized_method = dict(method or {})
            normalized_method["type"] = algorithm.name
            return normalized_method

    supported = ", ".join(sorted(TRAINING_ALGORITHMS))
    raise ValueError(
        f"Unsupported fine-tuning method: {raw_type}. Supported methods: {supported}"
    )


def build_sft_command(job: dict[str, Any], config_dir: Path) -> list[str]:
    job_dir = config_dir / "fine_tuning" / "jobs" / job["id"]
    output_dir = job_dir / "artifacts" / "model"
    output_dir.mkdir(parents=True, exist_ok=True)
    return [
        "trl",
        "sft",
        "--model_name_or_path",
        str(job["model"]),
        "--dataset_name",
        str(job["training_file"]),
        "--output_dir",
        str(output_dir),
    ]


def run_subprocess_command(command: list[str]) -> int:
    process = subprocess.Popen(command)

    def handle_exit(signum, frame) -> None:  # type: ignore[no-untyped-def]
        if process.poll() is None:
            process.send_signal(signum)

    signal.signal(signal.SIGTERM, handle_exit)
    signal.signal(signal.SIGINT, handle_exit)
    return process.wait()


def run_sft_job(job: dict[str, Any], config_dir: Path) -> int:
    return run_subprocess_command(build_sft_command(job, config_dir))


def run_lawf_job(job: dict[str, Any], config_dir: Path) -> int:
    should_exit = False

    def handle_exit(signum, frame) -> None:  # type: ignore[no-untyped-def]
        nonlocal should_exit
        should_exit = True

    signal.signal(signal.SIGTERM, handle_exit)
    signal.signal(signal.SIGINT, handle_exit)

    while not should_exit:
        time.sleep(1)
    return 0


def run_algorithm_job(
    algorithm_name: str, job: dict[str, Any], config_dir: Path
) -> int:
    if algorithm_name == "sft":
        return run_sft_job(job, config_dir)
    if algorithm_name == "lawf":
        return run_lawf_job(job, config_dir)
    supported = ", ".join(sorted(TRAINING_ALGORITHMS))
    raise ValueError(
        f"Unsupported fine-tuning method: {algorithm_name}. Supported methods: {supported}"
    )
