from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from lawftune.train.algorithms import export_uploaded_file_for_job
from lawftune.train.algorithms import get_job_dir
from lawftune.train.algorithms import get_job_output_dir
from lawftune.train.algorithms import get_method_hyperparameters
from lawftune.model_resolution import resolve_model_reference


def _load_dependencies():
    try:
        import torch
        from datasets import Dataset
        from peft import LoraConfig
        from peft import TaskType
        from transformers import AutoTokenizer
        from transformers import TrainingArguments

        from lawftune.train.lawf_trainer import LAwFTrainer
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "LAwF training dependencies are missing. Install torch, transformers, "
            "datasets, peft, and trl in the training environment."
        ) from exc

    return {
        "torch": torch,
        "Dataset": Dataset,
        "LoraConfig": LoraConfig,
        "TaskType": TaskType,
        "AutoTokenizer": AutoTokenizer,
        "TrainingArguments": TrainingArguments,
        "LAwFTrainer": LAwFTrainer,
    }


def _load_training_records(dataset_path: Path) -> list[dict[str, Any]]:
    content = dataset_path.read_text(encoding="utf-8").strip()
    if not content:
        raise ValueError(f"Training dataset is empty: {dataset_path}")

    if content.startswith("{") or content.startswith("["):
        payload = json.loads(content)
        if isinstance(payload, list):
            records = payload
        elif isinstance(payload, dict) and isinstance(payload.get("samples"), list):
            records = payload["samples"]
        else:
            records = [payload]
    else:
        records = [
            json.loads(line)
            for line in content.splitlines()
            if line.strip()
        ]

    if not records:
        raise ValueError(f"Training dataset is empty: {dataset_path}")
    return records


def run_lawf_training(job: dict[str, Any], config_dir: Path) -> None:
    deps = _load_dependencies()
    torch = deps["torch"]
    Dataset = deps["Dataset"]
    LoraConfig = deps["LoraConfig"]
    TaskType = deps["TaskType"]
    AutoTokenizer = deps["AutoTokenizer"]
    TrainingArguments = deps["TrainingArguments"]
    LAwFTrainer = deps["LAwFTrainer"]

    job_dir = get_job_dir(config_dir, str(job["id"]))
    data_dir = job_dir / "artifacts" / "data"
    output_dir = get_job_output_dir(config_dir, job)
    output_dir.mkdir(parents=True, exist_ok=True)

    training_file_path = export_uploaded_file_for_job(
        config_dir,
        file_id=str(job["training_file"]),
        target_dir=data_dir,
    )

    train_records = _load_training_records(training_file_path)
    train_dataset = Dataset.from_list(train_records)

    eval_dataset = None
    validation_file_id = job.get("validation_file")
    if validation_file_id:
        validation_file_path = export_uploaded_file_for_job(
            config_dir,
            file_id=str(validation_file_id),
            target_dir=data_dir,
        )
        eval_dataset = Dataset.from_list(_load_training_records(validation_file_path))

    hyperparameters = get_method_hyperparameters(job)
    resolved_model = resolve_model_reference(str(job["model"]), config_dir=config_dir)
    tokenizer = AutoTokenizer.from_pretrained(resolved_model)
    if tokenizer.pad_token is None and tokenizer.eos_token is not None:
        tokenizer.pad_token = tokenizer.eos_token

    report_to: list[str] = []
    logging_dir = job_dir / "artifacts" / "logs"
    integrations = job.get("integrations") or []
    if any(item.get("type") == "tensorboard" for item in integrations):
        logging_dir.mkdir(parents=True, exist_ok=True)
        report_to.append("tensorboard")

    lora_config = LoraConfig(
        task_type=TaskType.CAUSAL_LM,
        r=int(hyperparameters.get("lora_rank", 16)),
        lora_alpha=int(hyperparameters.get("lora_alpha", 32)),
        lora_dropout=float(hyperparameters.get("lora_dropout", 0.05)),
        bias="none",
    )

    use_bf16 = torch.cuda.is_available() and torch.cuda.is_bf16_supported()
    training_args = TrainingArguments(
        output_dir=str(output_dir),
        remove_unused_columns=False,
        num_train_epochs=float(hyperparameters.get("n_epochs", 1)),
        per_device_train_batch_size=int(hyperparameters.get("batch_size", 1)),
        learning_rate=float(hyperparameters.get("learning_rate", 5e-5)),
        logging_steps=int(hyperparameters.get("logging_steps", 1)),
        save_strategy="no",
        report_to=report_to,
        logging_dir=str(logging_dir),
        bf16=use_bf16,
        fp16=torch.cuda.is_available() and not use_bf16,
    )

    trainer = LAwFTrainer(
        model=resolved_model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=eval_dataset,
        processing_class=tokenizer,
        peft_config=lora_config,
    )
    trainer.train()
    trainer.save_model(str(output_dir))
    tokenizer.save_pretrained(str(output_dir))
