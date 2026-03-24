from __future__ import annotations

from pathlib import Path
from typing import Any
from typing import Iterable

from fastapi import APIRouter
from fastapi import HTTPException
from fastapi import Query
from fastapi import Response
from pydantic import BaseModel
from pydantic import Field

from .files_store import FileStore
from .fine_tuning_jobs import FineTuningJobStore
from .fine_tuning_jobs import DEFAULT_LOG_TAIL_LINES
from ..train.algorithms import normalize_training_method


class CreateFineTuningJobRequest(BaseModel):
    model: str
    training_file: str
    validation_file: str | None = None
    suffix: str | None = None
    seed: int | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    hyperparameters: dict[str, Any] = Field(default_factory=dict)
    integrations: list[dict[str, Any]] = Field(default_factory=list)
    method: dict[str, Any] | None = None


def serialize_model(model: BaseModel) -> dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump(exclude_none=True)
    return model.dict(exclude_none=True)


def build_router(
    config_dir: Path | None = None,
    *,
    prefixes: Iterable[str] = ("/v1/fine_tuning",),
) -> APIRouter:
    router = APIRouter(tags=["fine_tuning"])
    store = FineTuningJobStore(config_dir)
    file_store = FileStore(config_dir)

    def validate_fine_tuning_file(file_id: str, field_name: str) -> None:
        try:
            metadata = file_store.get_file(file_id)
        except FileNotFoundError as exc:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"{field_name} must reference an uploaded file id from "
                    f"/api/files or /v1/files: {file_id}"
                ),
            ) from exc

        if metadata.get("purpose") != "fine-tune":
            raise HTTPException(
                status_code=400,
                detail=(
                    f"{field_name} must reference a file uploaded with purpose "
                    f"'fine-tune': {file_id}"
                ),
            )

    @router.get("/")
    def fine_tuning_root() -> dict[str, str]:
        return {
            "name": "lawftrack fine_tuning",
            "status": "ready",
        }

    @router.post("/jobs")
    def create_fine_tuning_job(payload: CreateFineTuningJobRequest) -> dict[str, Any]:
        serialized = serialize_model(payload)
        try:
            serialized["method"] = normalize_training_method(serialized.get("method"))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        validate_fine_tuning_file(serialized["training_file"], "training_file")
        validation_file = serialized.get("validation_file")
        if validation_file is not None:
            validate_fine_tuning_file(validation_file, "validation_file")
        return store.create_job(serialized)

    @router.get("/jobs")
    def list_fine_tuning_jobs() -> dict[str, Any]:
        return {
            "object": "list",
            "data": store.list_jobs(),
            "has_more": False,
        }

    @router.get("/jobs/{job_id}")
    def retrieve_fine_tuning_job(job_id: str) -> dict[str, Any]:
        try:
            return store.get_job(job_id)
        except FileNotFoundError as exc:
            raise HTTPException(
                status_code=404, detail=f"Fine-tuning job not found: {job_id}"
            ) from exc

    @router.get("/jobs/{job_id}/events")
    def list_fine_tuning_job_events(job_id: str) -> dict[str, Any]:
        try:
            return {
                "object": "list",
                "data": store.list_job_events(job_id),
                "has_more": False,
            }
        except FileNotFoundError as exc:
            raise HTTPException(
                status_code=404, detail=f"Fine-tuning job not found: {job_id}"
            ) from exc

    @router.get("/jobs/{job_id}/checkpoints")
    def list_fine_tuning_job_checkpoints(job_id: str) -> dict[str, Any]:
        try:
            return {
                "object": "list",
                "data": store.list_job_checkpoints(job_id),
                "has_more": False,
            }
        except FileNotFoundError as exc:
            raise HTTPException(
                status_code=404, detail=f"Fine-tuning job not found: {job_id}"
            ) from exc

    @router.get("/jobs/{job_id}/logs")
    def retrieve_fine_tuning_job_logs(
        job_id: str,
        tail_lines: int = Query(default=DEFAULT_LOG_TAIL_LINES, ge=1, le=10000),
    ) -> dict[str, Any]:
        try:
            return store.get_job_logs(job_id, tail_lines=tail_lines)
        except FileNotFoundError as exc:
            raise HTTPException(
                status_code=404, detail=f"Fine-tuning job not found: {job_id}"
            ) from exc

    @router.get("/jobs/{job_id}/logs/download")
    def download_fine_tuning_job_logs(job_id: str) -> Response:
        try:
            content = store.get_job_logs_download_text(job_id)
        except FileNotFoundError as exc:
            raise HTTPException(
                status_code=404, detail=f"Fine-tuning job not found: {job_id}"
            ) from exc
        return Response(
            content=content,
            media_type="text/plain; charset=utf-8",
            headers={
                "Content-Disposition": f'attachment; filename="{job_id}-logs.txt"'
            },
        )

    @router.post("/jobs/{job_id}/cancel")
    def cancel_fine_tuning_job(job_id: str) -> dict[str, Any]:
        try:
            return store.cancel_job(job_id)
        except FileNotFoundError as exc:
            raise HTTPException(
                status_code=404, detail=f"Fine-tuning job not found: {job_id}"
            ) from exc

    prefixed_router = APIRouter(tags=["fine_tuning"])
    for prefix in prefixes:
        prefixed_router.include_router(router, prefix=prefix)
    return prefixed_router
