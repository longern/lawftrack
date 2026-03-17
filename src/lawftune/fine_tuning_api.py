from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import APIRouter
from fastapi import HTTPException
from pydantic import BaseModel
from pydantic import Field

from lawftune.fine_tuning_jobs import FineTuningJobStore


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


def build_router(config_dir: Path | None = None) -> APIRouter:
    router = APIRouter(prefix="/v1/fine_tuning", tags=["fine_tuning"])
    store = FineTuningJobStore(config_dir)

    @router.get("/")
    def fine_tuning_root() -> dict[str, str]:
        return {
            "name": "lawftune fine_tuning",
            "status": "ready",
        }

    @router.post("/jobs")
    def create_fine_tuning_job(payload: CreateFineTuningJobRequest) -> dict[str, Any]:
        return store.create_job(serialize_model(payload))

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

    @router.post("/jobs/{job_id}/cancel")
    def cancel_fine_tuning_job(job_id: str) -> dict[str, Any]:
        try:
            return store.cancel_job(job_id)
        except FileNotFoundError as exc:
            raise HTTPException(
                status_code=404, detail=f"Fine-tuning job not found: {job_id}"
            ) from exc

    return router
