from __future__ import annotations

from fastapi import APIRouter


router = APIRouter(prefix="/v1/fine_tuning", tags=["fine_tuning"])


@router.get("/jobs")
def fine_tuning_jobs() -> dict[str, str]:
    return {
        "name": "lawftune fine_tuning",
        "status": "ready",
    }
