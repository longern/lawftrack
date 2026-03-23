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
            },
        )
        self._write_dataset(dataset)
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
            },
        )
        self._write_dataset(dataset)
        self._write_samples(dataset_id, [])
        return self._enrich_dataset(dataset)

    def import_training_data_file(
        self,
        *,
        filename: str,
        content: bytes,
        content_type: str | None = None,
    ) -> dict[str, Any]:
        now = int(time.time())
        dataset_id = f"ds-{uuid.uuid4().hex[:24]}"
        dataset = self._build_dataset_record(
            dataset_id,
            now,
            {
                "name": Path(filename).stem,
                "base_model": None,
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
        annotations = self._normalize_annotations(payload)
        sample = {
            "id": f"sample-{sample_index:04d}",
            "object": "dataset.sample",
            "dataset_id": dataset_id,
            "title": str(payload.get("title") or self._derive_sample_title(messages, sample_index - 1)),
            "created_at": now,
            "updated_at": now,
            "messages": messages,
            "edits": annotations,
            "anchors": annotations,
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
            annotations = self._normalize_annotations(payload)

            samples[index] = {
                **sample,
                "title": payload.get("title") or sample.get("title") or f"样本 {index + 1}",
                "messages": self._normalize_messages(payload.get("messages")),
                "edits": annotations,
                "anchors": annotations,
                "updated_at": int(time.time()),
            }
            self._write_samples(dataset_id, samples)
            return dict(samples[index])

        raise FileNotFoundError(sample_id)

    def delete_sample(self, dataset_id: str, sample_id: str) -> None:
        dataset = self._load_dataset(dataset_id)
        samples = self._load_or_bootstrap_samples(dataset)

        next_samples = [
            sample
            for sample in samples
            if str(sample.get("id")) != sample_id
        ]
        if len(next_samples) == len(samples):
            raise FileNotFoundError(sample_id)

        self._write_samples(dataset_id, next_samples)

    def update_dataset(self, dataset_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        dataset = self._load_dataset(dataset_id)
        if "name" in payload:
            dataset["name"] = payload["name"]
        if "base_model" in payload:
            dataset["base_model"] = payload["base_model"]
        dataset.pop("training_file_id", None)
        dataset.pop("training_filename", None)
        dataset["updated_at"] = int(time.time())
        self._write_dataset(dataset)
        return self._enrich_dataset(dataset)

    def delete_dataset(self, dataset_id: str) -> None:
        dataset_dir = self.datasets_dir / dataset_id
        dataset_path = dataset_dir / "dataset.yaml"
        if not dataset_path.is_file():
            raise FileNotFoundError(dataset_id)
        shutil.rmtree(dataset_dir)

    def export_training_file(
        self,
        dataset_id: str,
        *,
        method_type: str,
    ) -> tuple[dict[str, Any], int]:
        dataset = self._load_dataset(dataset_id)
        samples = self._load_or_bootstrap_samples(dataset)
        records = self._build_training_records(samples, method_type=method_type)
        if not records:
            raise ValueError("Dataset does not contain any exportable training samples.")
        created_file = self.file_store.create_file(
            filename=self._build_export_filename(dataset, method_type=method_type),
            purpose="fine-tune",
            content=self._serialize_training_records(records),
            content_type="application/jsonl",
        )
        return created_file, len(records)

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
            messages = self._extract_messages_from_record(item)
            annotations = self._normalize_annotations(item)
            records.append(
                {
                    "id": f"sample-{index + 1:04d}",
                    "object": "dataset.sample",
                    "dataset_id": dataset_id,
                    "title": self._derive_sample_title(messages, index),
                    "created_at": now,
                    "updated_at": now,
                    "messages": messages,
                    "edits": annotations,
                    "anchors": annotations,
                }
            )
        return records

    def _build_training_records(
        self,
        samples: list[dict[str, Any]],
        *,
        method_type: str,
    ) -> list[dict[str, Any]]:
        normalized_method = str(method_type).strip().lower() or "sft"
        records: list[dict[str, Any]] = []
        for sample in samples:
            if normalized_method == "lawf":
                records.extend(self._build_lawf_training_records_for_sample(sample))
            else:
                records.extend(self._build_sft_training_records_for_sample(sample))
        return records

    def _build_sft_training_records_for_sample(
        self,
        sample: dict[str, Any],
    ) -> list[dict[str, Any]]:
        messages = self._normalize_messages(sample.get("messages"))
        if not messages:
            return []
        return [{"messages": messages}]

    def _build_lawf_training_records_for_sample(
        self,
        sample: dict[str, Any],
    ) -> list[dict[str, Any]]:
        messages = self._normalize_messages(sample.get("messages"))
        if not messages:
            return []

        annotations = self._normalize_annotations(sample)
        assistant_indices = [
            index
            for index, message in enumerate(messages)
            if message.get("role") == "assistant" and str(message.get("content") or "").strip()
        ]
        records: list[dict[str, Any]] = []
        for assistant_index in assistant_indices:
            prompt_messages = messages[:assistant_index]
            completion_messages = [messages[assistant_index]]
            anchors = [
                {
                    key: value
                    for key, value in annotation.items()
                    if key != "message_index"
                }
                for annotation in annotations
                if int(annotation.get("message_index", -1)) == assistant_index
            ]
            records.append(
                {
                    "messages": prompt_messages + completion_messages,
                    "completion_message_index": assistant_index,
                    "prompt": prompt_messages,
                    "completion": completion_messages,
                    "anchors": anchors,
                }
            )
        return records

    def _build_export_filename(
        self,
        dataset: dict[str, Any],
        *,
        method_type: str,
    ) -> str:
        raw_name = str(dataset.get("name") or dataset.get("id") or "dataset")
        slug = "".join(
            character if character.isalnum() or character in {"-", "_", "."} else "-"
            for character in raw_name
        ).strip("-.")
        return f"{slug or 'dataset'}-{method_type}.jsonl"

    def _serialize_training_records(self, records: list[dict[str, Any]]) -> bytes:
        if not records:
            return b""
        return (
            "\n".join(json.dumps(record, ensure_ascii=False) for record in records) + "\n"
        ).encode("utf-8")

    def _derive_sample_title(
        self,
        messages: list[dict[str, Any]],
        index: int,
    ) -> str:
        for message in messages:
            if message.get("role") == "user" and message.get("content"):
                return str(message["content"])[:24] or f"样本 {index + 1}"
        return f"样本 {index + 1}"

    def _normalize_messages(self, payload: Any) -> list[dict[str, Any]]:
        messages: list[dict[str, Any]] = []
        if not isinstance(payload, list):
            return messages
        for item in payload:
            if not isinstance(item, dict):
                continue
            role = str(item.get("role") or "").strip()
            content = str(item.get("content") or "")
            reasoning_value = item.get("reasoning")
            if reasoning_value is None:
                reasoning_value = item.get("reasoning_content")
            reasoning = (
                None
                if reasoning_value is None
                else str(reasoning_value)
            )
            if not role:
                continue
            message: dict[str, Any] = {"role": role, "content": content}
            if reasoning:
                message["reasoning"] = reasoning
            messages.append(message)
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
                    "target": (
                        "reasoning"
                        if str(item.get("target") or "content").strip().lower() == "reasoning"
                        else "content"
                    ),
                    "original_token": (
                        None if item.get("original_token") is None else str(item.get("original_token") or "")
                    ),
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

    def _normalize_annotations(self, payload: Any) -> list[dict[str, Any]]:
        if isinstance(payload, dict):
            if isinstance(payload.get("anchors"), list):
                return self._normalize_edits(payload.get("anchors"))
            if isinstance(payload.get("edits"), list):
                return self._normalize_edits(payload.get("edits"))
            return []
        return self._normalize_edits(payload)

    def _normalize_message_group(
        self,
        payload: Any,
        *,
        default_role: str,
    ) -> list[dict[str, Any]]:
        if isinstance(payload, list):
            return self._normalize_messages(payload)
        if payload is None:
            return []
        return [{"role": default_role, "content": str(payload)}]

    def _extract_messages_from_record(self, payload: dict[str, Any]) -> list[dict[str, Any]]:
        messages = self._normalize_messages(payload.get("messages"))
        if messages:
            return messages

        prompt_messages = self._normalize_message_group(payload.get("prompt"), default_role="user")
        completion_messages = self._normalize_message_group(
            payload.get("completion"),
            default_role="assistant",
        )
        return prompt_messages + completion_messages

    def _normalize_sample(self, payload: Any, index: int) -> dict[str, Any]:
        if not isinstance(payload, dict):
            raise ValueError("Dataset sample payload must be a mapping.")
        sample_id = str(payload.get("id") or f"sample-{index + 1:04d}")
        messages = self._extract_messages_from_record(payload)
        annotations = self._normalize_annotations(payload)
        return {
            "id": sample_id,
            "object": "dataset.sample",
            "dataset_id": str(payload.get("dataset_id") or ""),
            "title": str(payload.get("title") or self._derive_sample_title(messages, index)),
            "created_at": int(payload.get("created_at", time.time())),
            "updated_at": int(payload.get("updated_at", time.time())),
            "messages": messages,
            "edits": annotations,
            "anchors": annotations,
        }

    def _write_samples(self, dataset_id: str, samples: list[dict[str, Any]]) -> None:
        samples_path = self._samples_path(dataset_id)
        samples_path.write_text(
            json.dumps(samples, indent=2, ensure_ascii=True) + "\n",
            encoding="utf-8",
        )

    def _enrich_dataset(self, dataset: dict[str, Any]) -> dict[str, Any]:
        enriched = dict(dataset)
        enriched.pop("training_file_id", None)
        enriched.pop("training_filename", None)
        try:
            enriched["sample_count"] = len(self._load_or_bootstrap_samples(dataset))
        except Exception:
            enriched["sample_count"] = 0
        return enriched
