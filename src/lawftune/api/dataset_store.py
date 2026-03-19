from __future__ import annotations

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

    def update_dataset(self, dataset_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        dataset = self._load_dataset(dataset_id)
        if "name" in payload:
            dataset["name"] = payload["name"]
        if "base_model" in payload:
            dataset["base_model"] = payload["base_model"]
        if "training_file_id" in payload:
            dataset["training_file_id"] = payload["training_file_id"]
        dataset["updated_at"] = int(time.time())
        self._write_dataset(dataset)
        return self._enrich_dataset(dataset)

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
        return enriched
