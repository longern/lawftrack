from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import APIRouter
from fastapi import File
from fastapi import HTTPException
from fastapi import UploadFile
from pydantic import BaseModel

from lawftune.api.dataset_store import DatasetStore
from lawftune.api.files_store import FileStore


class CreateDatasetRequest(BaseModel):
    name: str
    base_model: str | None = None
    training_file_id: str | None = None


class UpdateDatasetRequest(BaseModel):
    name: str | None = None
    base_model: str | None = None
    training_file_id: str | None = None


def serialize_model(model: BaseModel) -> dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump(exclude_unset=True)
    return model.dict(exclude_unset=True)


def build_router(config_dir: Path | None = None) -> APIRouter:
    router = APIRouter(prefix="/api/datasets", tags=["datasets"])
    store = DatasetStore(config_dir)
    file_store = FileStore(config_dir)

    def validate_training_file(file_id: str) -> None:
        try:
            metadata = file_store.get_file(file_id)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=400, detail=f"Unknown training file: {file_id}") from exc

        if metadata.get("purpose") != "fine-tune":
            raise HTTPException(
                status_code=400,
                detail=f"Dataset training_file_id must reference a fine-tune file: {file_id}",
            )

    @router.get("")
    def list_datasets() -> dict[str, Any]:
        return {
            "object": "list",
            "data": store.list_datasets(),
            "has_more": False,
        }

    @router.post("")
    def create_dataset(payload: CreateDatasetRequest) -> dict[str, Any]:
        serialized = serialize_model(payload)
        training_file_id = serialized.get("training_file_id")
        if training_file_id:
            validate_training_file(str(training_file_id))
        return store.create_dataset(serialized)

    @router.post("/import")
    async def import_dataset(file: UploadFile = File(...)) -> dict[str, Any]:
        filename = file.filename or "dataset-upload"
        suffix = Path(filename).suffix.lower()
        content = await file.read()

        if suffix in {".yaml", ".yml"}:
            try:
                dataset = store.import_metadata_file(filename=filename, content=content)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
            training_file_id = dataset.get("training_file_id")
            if training_file_id:
                validate_training_file(str(training_file_id))
            return dataset

        if suffix in {".json", ".jsonl"}:
            return store.import_training_data_file(
                filename=filename,
                content=content,
                content_type=file.content_type,
            )

        raise HTTPException(
            status_code=400,
            detail="Unsupported dataset file type. Use .yaml, .yml, .json, or .jsonl.",
        )

    @router.get("/{dataset_id}")
    def retrieve_dataset(dataset_id: str) -> dict[str, Any]:
        try:
            return store.get_dataset(dataset_id)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=f"Dataset not found: {dataset_id}") from exc

    @router.patch("/{dataset_id}")
    def update_dataset(dataset_id: str, payload: UpdateDatasetRequest) -> dict[str, Any]:
        serialized = serialize_model(payload)
        training_file_id = serialized.get("training_file_id")
        if training_file_id:
            validate_training_file(str(training_file_id))
        try:
            return store.update_dataset(dataset_id, serialized)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=f"Dataset not found: {dataset_id}") from exc

    return router
