from __future__ import annotations

from pathlib import Path
from typing import Iterable

from fastapi import APIRouter
from fastapi import File
from fastapi import Form
from fastapi import HTTPException
from fastapi import UploadFile
from fastapi.responses import Response

from .files_store import FileStore


def build_router(
    config_dir: Path | None = None,
    *,
    prefixes: Iterable[str] = ("/v1/files",),
) -> APIRouter:
    router = APIRouter(tags=["files"])
    store = FileStore(config_dir)

    @router.post("")
    async def create_file(
        purpose: str = Form(...),
        file: UploadFile = File(...),
    ) -> dict:
        content = await file.read()
        return store.create_file(
            filename=file.filename or "upload.bin",
            purpose=purpose,
            content=content,
            content_type=file.content_type,
        )

    @router.get("")
    def list_files() -> dict:
        return {
            "object": "list",
            "data": store.list_files(),
            "has_more": False,
        }

    @router.get("/{file_id}")
    def retrieve_file(file_id: str) -> dict:
        try:
            return store.get_file(file_id)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=f"File not found: {file_id}") from exc

    @router.get("/{file_id}/content")
    def retrieve_file_content(file_id: str) -> Response:
        try:
            metadata = store.get_file(file_id)
            content = store.get_file_content(file_id)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=f"File not found: {file_id}") from exc
        return Response(content=content, media_type=metadata.get("content_type", "application/octet-stream"))

    @router.delete("/{file_id}")
    def delete_file(file_id: str) -> dict:
        try:
            return store.delete_file(file_id)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=f"File not found: {file_id}") from exc

    prefixed_router = APIRouter(tags=["files"])
    for prefix in prefixes:
        prefixed_router.include_router(router, prefix=prefix)
    return prefixed_router
