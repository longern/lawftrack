from __future__ import annotations

import json
import shutil
import time
import uuid
from pathlib import Path
from typing import Any

import yaml

from lawftune.api.files_store import FileStore
from lawftune.config import get_config_dir


class DatasetStore:
    def __init__(self, config_dir: Path | None = None) -> None:
        self.config_dir = (
            config_dir if config_dir is not None else get_config_dir()
        ).expanduser()
        self.datasets_dir = self.config_dir / "datasets"
        self.datasets_dir.mkdir(parents=True, exist_ok=True)
        self.file_store = FileStore(config_dir)

    def list_datasets(self) -> list[dict[str, Any]]:
        datasets: list[dict[str, Any]] = []
        for dataset_dir in self.datasets_dir.iterdir():
            dataset_path = dataset_dir / "dataset.yaml"
            if not dataset_path.is_file():
                continue
            datasets.append(self._enrich_dataset(self._load_dataset_path(dataset_path)))
        datasets.sort(key=lambda item: int(item.get("updated_at", 0)), reverse=True)
        return datasets

    def create_dataset(self, payload: dict[str, Any]) -> dict[str, Any]:
        now = int(time.time())
        dataset_id = f"ds-{uuid.uuid4().hex[:24]}"
        dataset = self._build_dataset_record(
            dataset_id,
            now,
            {
                "name": payload["name"],
                "base_model": payload.get("base_model"),
                "training_file_id": payload.get("training_file_id"),
            },
        )
        self._write_dataset(dataset)
        if dataset.get("training_file_id"):
            self._load_or_bootstrap_samples(dataset)
        else:
            self._write_samples(dataset_id, [])
        return self._enrich_dataset(dataset)

    def import_metadata_file(self, *, filename: str, content: bytes) -> dict[str, Any]:
        payload = yaml.safe_load(content.decode("utf-8")) or {}
        if not isinstance(payload, dict):
            raise ValueError("Dataset YAML metadata must be a mapping.")

        now = int(time.time())
        dataset_id = f"ds-{uuid.uuid4().hex[:24]}"
        dataset = self._build_dataset_record(
            dataset_id,
            now,
            {
                "name": str(payload.get("name") or Path(filename).stem),
                "base_model": payload.get("base_model"),
                "training_file_id": payload.get("training_file_id"),
            },
        )
        self._write_dataset(dataset)
        if dataset.get("training_file_id"):
            self._load_or_bootstrap_samples(dataset)
        else:
            self._write_samples(dataset_id, [])
        return self._enrich_dataset(dataset)

    def import_training_data_file(
        self,
        *,
        filename: str,
        content: bytes,
        content_type: str | None = None,
    ) -> dict[str, Any]:
        created_file = self.file_store.create_file(
            filename=filename,
            purpose="fine-tune",
            content=content,
            content_type=content_type,
        )
        now = int(time.time())
        dataset_id = f"ds-{uuid.uuid4().hex[:24]}"
        dataset = self._build_dataset_record(
            dataset_id,
            now,
            {
                "name": Path(filename).stem,
                "base_model": None,
                "training_file_id": created_file["id"],
            },
        )
        self._write_dataset(dataset)
        self._write_samples(
            dataset_id,
            self._build_samples_from_training_content(
                dataset_id=dataset_id,
                filename=filename,
                content=content,
            ),
        )
        return self._enrich_dataset(dataset)

    def _build_dataset_record(
        self,
        dataset_id: str,
        now: int,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        return {
            "id": dataset_id,
            "object": "dataset",
            "name": payload["name"],
            "created_at": now,
            "updated_at": now,
            "base_model": payload.get("base_model"),
            "training_file_id": payload.get("training_file_id"),
        }

    def get_dataset(self, dataset_id: str) -> dict[str, Any]:
        return self._enrich_dataset(self._load_dataset(dataset_id))

    def list_samples(self, dataset_id: str) -> list[dict[str, Any]]:
        dataset = self._load_dataset(dataset_id)
        samples = self._load_or_bootstrap_samples(dataset)
        return [dict(sample) for sample in samples]

    def get_sample(self, dataset_id: str, sample_id: str) -> dict[str, Any]:
        dataset = self._load_dataset(dataset_id)
        samples = self._load_or_bootstrap_samples(dataset)
        for sample in samples:
            if str(sample.get("id")) == sample_id:
                return dict(sample)
        raise FileNotFoundError(sample_id)

    def create_sample(self, dataset_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        dataset = self._load_dataset(dataset_id)
        samples = self._load_or_bootstrap_samples(dataset)
        now = int(time.time())
        sample_index = len(samples) + 1
        messages = self._normalize_messages(payload.get("messages")) or [
            {"role": "user", "content": ""},
            {"role": "assistant", "content": ""},
        ]
        sample = {
            "id": f"sample-{sample_index:04d}",
            "object": "dataset.sample",
            "dataset_id": dataset_id,
            "title": str(payload.get("title") or self._derive_sample_title(messages, sample_index - 1)),
            "created_at": now,
            "updated_at": now,
            "messages": messages,
            "source_messages": self._normalize_messages(payload.get("source_messages")) or messages,
            "edits": [],
        }
        samples.append(sample)
        self._write_samples(dataset_id, samples)
        return dict(sample)

    def update_sample(
        self,
        dataset_id: str,
        sample_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        dataset = self._load_dataset(dataset_id)
        samples = self._load_or_bootstrap_samples(dataset)

        for index, sample in enumerate(samples):
            if str(sample.get("id")) != sample_id:
                continue

            samples[index] = {
                **sample,
                "title": payload.get("title") or sample.get("title") or f"样本 {index + 1}",
                "messages": self._normalize_messages(payload.get("messages")),
                "source_messages": self._normalize_messages(
                    payload.get("source_messages") or sample.get("source_messages")
                ),
                "edits": self._normalize_edits(payload.get("edits")),
                "updated_at": int(time.time()),
            }
            self._write_samples(dataset_id, samples)
            return dict(samples[index])

        raise FileNotFoundError(sample_id)

    def update_dataset(self, dataset_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        dataset = self._load_dataset(dataset_id)
        previous_training_file_id = dataset.get("training_file_id")
        if "name" in payload:
            dataset["name"] = payload["name"]
        if "base_model" in payload:
            dataset["base_model"] = payload["base_model"]
        if "training_file_id" in payload:
            dataset["training_file_id"] = payload["training_file_id"]
        dataset["updated_at"] = int(time.time())
        self._write_dataset(dataset)
        if "training_file_id" in payload:
            next_training_file_id = payload.get("training_file_id")
            if next_training_file_id and next_training_file_id != previous_training_file_id:
                self._bootstrap_samples_for_dataset(dataset)
        return self._enrich_dataset(dataset)

    def delete_dataset(self, dataset_id: str) -> None:
        dataset_dir = self.datasets_dir / dataset_id
        dataset_path = dataset_dir / "dataset.yaml"
        if not dataset_path.is_file():
            raise FileNotFoundError(dataset_id)
        shutil.rmtree(dataset_dir)

    def _load_dataset(self, dataset_id: str) -> dict[str, Any]:
        dataset_path = self.datasets_dir / dataset_id / "dataset.yaml"
        if not dataset_path.is_file():
            raise FileNotFoundError(dataset_id)
        return self._load_dataset_path(dataset_path)

    def _load_dataset_path(self, dataset_path: Path) -> dict[str, Any]:
        payload = yaml.safe_load(dataset_path.read_text(encoding="utf-8")) or {}
        if not isinstance(payload, dict):
            raise ValueError(f"Dataset metadata must be a mapping: {dataset_path}")
        return payload

    def _write_dataset(self, dataset: dict[str, Any]) -> None:
        dataset_dir = self.datasets_dir / str(dataset["id"])
        dataset_dir.mkdir(parents=True, exist_ok=True)
        dataset_path = dataset_dir / "dataset.yaml"
        dataset_path.write_text(
            yaml.safe_dump(dataset, sort_keys=False, allow_unicode=True),
            encoding="utf-8",
        )

    def _samples_path(self, dataset_id: str) -> Path:
        dataset_dir = self.datasets_dir / dataset_id
        dataset_dir.mkdir(parents=True, exist_ok=True)
        return dataset_dir / "samples.json"

    def _load_or_bootstrap_samples(self, dataset: dict[str, Any]) -> list[dict[str, Any]]:
        dataset_id = str(dataset["id"])
        samples_path = self._samples_path(dataset_id)
        if samples_path.is_file():
            payload = json.loads(samples_path.read_text(encoding="utf-8"))
            if isinstance(payload, list):
                return [self._normalize_sample(item, idx) for idx, item in enumerate(payload)]

        training_file_id = dataset.get("training_file_id")
        if not training_file_id:
            samples: list[dict[str, Any]] = []
            self._write_samples(dataset_id, samples)
            return samples

        metadata = self.file_store.get_file(str(training_file_id))
        content = self.file_store.get_file_content(str(training_file_id))
        samples = self._build_samples_from_training_content(
            dataset_id=dataset_id,
            filename=str(metadata.get("filename") or "train.jsonl"),
            content=content,
        )
        self._write_samples(dataset_id, samples)
        return samples

    def _bootstrap_samples_for_dataset(self, dataset: dict[str, Any]) -> list[dict[str, Any]]:
        dataset_id = str(dataset["id"])
        training_file_id = dataset.get("training_file_id")
        if not training_file_id:
            self._write_samples(dataset_id, [])
            return []
        metadata = self.file_store.get_file(str(training_file_id))
        content = self.file_store.get_file_content(str(training_file_id))
        samples = self._build_samples_from_training_content(
            dataset_id=dataset_id,
            filename=str(metadata.get("filename") or "train.jsonl"),
            content=content,
        )
        self._write_samples(dataset_id, samples)
        return samples

    def _build_samples_from_training_content(
        self,
        *,
        dataset_id: str,
        filename: str,
        content: bytes,
    ) -> list[dict[str, Any]]:
        now = int(time.time())
        records: list[dict[str, Any]] = []
        suffix = Path(filename).suffix.lower()
        text = content.decode("utf-8")

        if suffix == ".json":
            parsed = json.loads(text)
            if isinstance(parsed, list):
                iterable = parsed
            else:
                iterable = [parsed]
        else:
            iterable = [
                json.loads(line)
                for line in text.splitlines()
                if line.strip()
            ]

        for index, item in enumerate(iterable):
            if not isinstance(item, dict):
                continue
            messages = self._normalize_messages(item.get("messages"))
            records.append(
                {
                    "id": f"sample-{index + 1:04d}",
                    "object": "dataset.sample",
                    "dataset_id": dataset_id,
                    "title": self._derive_sample_title(messages, index),
                    "created_at": now,
                    "updated_at": now,
                    "messages": messages,
                    "source_messages": messages,
                    "edits": [],
                }
            )
        return records

    def _derive_sample_title(
        self,
        messages: list[dict[str, str]],
        index: int,
    ) -> str:
        for message in messages:
            if message.get("role") == "user" and message.get("content"):
                return str(message["content"])[:24] or f"样本 {index + 1}"
        return f"样本 {index + 1}"

    def _normalize_messages(self, payload: Any) -> list[dict[str, str]]:
        messages: list[dict[str, str]] = []
        if not isinstance(payload, list):
            return messages
        for item in payload:
            if not isinstance(item, dict):
                continue
            role = str(item.get("role") or "").strip()
            content = str(item.get("content") or "")
            if not role:
                continue
            messages.append({"role": role, "content": content})
        return messages

    def _normalize_edits(self, payload: Any) -> list[dict[str, Any]]:
        edits: list[dict[str, Any]] = []
        if not isinstance(payload, list):
            return edits
        for item in payload:
            if not isinstance(item, dict):
                continue
            edits.append(
                {
                    "message_index": int(item.get("message_index", 0)),
                    "token_index": int(item.get("token_index", 0)),
                    "original_token": str(item.get("original_token") or ""),
                    "replacement_token": str(item.get("replacement_token") or ""),
                    "regenerated_from_token_index": (
                        None
                        if item.get("regenerated_from_token_index") is None
                        else int(item.get("regenerated_from_token_index"))
                    ),
                    "created_at": int(item.get("created_at", time.time())),
                }
            )
        return edits

    def _normalize_sample(self, payload: Any, index: int) -> dict[str, Any]:
        if not isinstance(payload, dict):
            raise ValueError("Dataset sample payload must be a mapping.")
        sample_id = str(payload.get("id") or f"sample-{index + 1:04d}")
        messages = self._normalize_messages(payload.get("messages"))
        source_messages = self._normalize_messages(payload.get("source_messages")) or messages
        return {
            "id": sample_id,
            "object": "dataset.sample",
            "dataset_id": str(payload.get("dataset_id") or ""),
            "title": str(payload.get("title") or self._derive_sample_title(messages, index)),
            "created_at": int(payload.get("created_at", time.time())),
            "updated_at": int(payload.get("updated_at", time.time())),
            "messages": messages,
            "source_messages": source_messages,
            "edits": self._normalize_edits(payload.get("edits")),
        }

    def _write_samples(self, dataset_id: str, samples: list[dict[str, Any]]) -> None:
        samples_path = self._samples_path(dataset_id)
        samples_path.write_text(
            json.dumps(samples, indent=2, ensure_ascii=True) + "\n",
            encoding="utf-8",
        )

    def _enrich_dataset(self, dataset: dict[str, Any]) -> dict[str, Any]:
        enriched = dict(dataset)
        training_file_id = enriched.get("training_file_id")
        if training_file_id:
            try:
                file_metadata = self.file_store.get_file(str(training_file_id))
            except FileNotFoundError:
                enriched["training_filename"] = None
            else:
                enriched["training_filename"] = file_metadata.get("filename")
        else:
            enriched["training_filename"] = None
        try:
            enriched["sample_count"] = len(self._load_or_bootstrap_samples(dataset))
        except Exception:
            enriched["sample_count"] = 0
        return enriched
