from __future__ import annotations

import signal
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
import re
from typing import Any

from lawftune.api.files_store import FileStore


DEFAULT_TRAINING_ALGORITHM = "sft"
LORA_ADAPTER_CONFIG_FILENAME = "adapter_config.json"
SANITIZED_ADAPTER_NAME_PATTERN = re.compile(r"[^A-Za-z0-9._-]+")


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


def get_algorithm(method_type: str) -> TrainingAlgorithm:
    normalized_type = method_type.strip().lower()
    for algorithm in TRAINING_ALGORITHMS.values():
        if normalized_type == algorithm.name or normalized_type in algorithm.aliases:
            return algorithm

    supported = ", ".join(sorted(TRAINING_ALGORITHMS))
    raise ValueError(
        f"Unsupported fine-tuning method: {method_type}. Supported methods: {supported}"
    )


def normalize_training_method(method: dict[str, Any] | None) -> dict[str, Any]:
    raw_type = DEFAULT_TRAINING_ALGORITHM
    if method is not None:
        raw_type = str(method.get("type", DEFAULT_TRAINING_ALGORITHM))

    algorithm = get_algorithm(raw_type)
    normalized_method = dict(method or {})
    normalized_method["type"] = algorithm.name
    return normalized_method


def get_job_dir(config_dir: Path, job_id: str) -> Path:
    return config_dir / "fine_tuning" / "jobs" / job_id


def get_job_output_dir(config_dir: Path, job: dict[str, Any]) -> Path:
    return get_job_dir(config_dir, str(job["id"])) / "artifacts" / "model"


def build_fine_tuned_model_name(job: dict[str, Any]) -> str:
    raw_suffix = str(job.get("suffix") or "").strip()
    if raw_suffix:
        normalized = SANITIZED_ADAPTER_NAME_PATTERN.sub("-", raw_suffix).strip("._-")
        if normalized:
            return normalized.lower()
    return str(job["id"])


def is_lora_adapter_artifact(path: Path) -> bool:
    return (path / LORA_ADAPTER_CONFIG_FILENAME).is_file()


def get_method_hyperparameters(job: dict[str, Any]) -> dict[str, Any]:
    method = job.get("method")
    if not isinstance(method, dict):
        return {}

    raw_type = str(method.get("type", DEFAULT_TRAINING_ALGORITHM))
    algorithm = get_algorithm(raw_type)
    candidates = (algorithm.name, *algorithm.aliases)

    for key in candidates:
        scoped_config = method.get(key)
        if isinstance(scoped_config, dict):
            hyperparameters = scoped_config.get("hyperparameters")
            if isinstance(hyperparameters, dict):
                return hyperparameters

    top_level_hyperparameters = method.get("hyperparameters")
    if isinstance(top_level_hyperparameters, dict):
        return top_level_hyperparameters
    return {}


def build_sft_hyperparameter_args(job: dict[str, Any]) -> list[str]:
    hyperparameters = get_method_hyperparameters(job)
    extra_args: list[str] = []

    if "n_epochs" in hyperparameters:
        extra_args.extend(
            ["--num_train_epochs", str(hyperparameters["n_epochs"])]
        )

    return extra_args


def export_uploaded_file_for_job(
    config_dir: Path,
    *,
    file_id: str,
    target_dir: Path,
) -> Path:
    file_store = FileStore(config_dir)
    metadata = file_store.get_file(file_id)
    return file_store.export_file(file_id, target_dir / str(metadata["filename"]))


def build_sft_command(job: dict[str, Any], config_dir: Path) -> list[str]:
    output_dir = get_job_output_dir(config_dir, job)
    output_dir.mkdir(parents=True, exist_ok=True)
    data_dir = get_job_dir(config_dir, str(job["id"])) / "artifacts" / "data"
    training_file_path = export_uploaded_file_for_job(
        config_dir,
        file_id=str(job["training_file"]),
        target_dir=data_dir,
    )
    return [
        "trl",
        "sft",
        "--model_name_or_path",
        str(job["model"]),
        "--dataset_name",
        str(training_file_path),
        "--output_dir",
        str(output_dir),
        *build_sft_hyperparameter_args(job),
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
    try:
        from lawftune.train.lawf_runner import run_lawf_training

        run_lawf_training(job, config_dir)
        return 0
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 1


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
