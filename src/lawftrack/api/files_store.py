from __future__ import annotations

import json
import shutil
import time
import uuid
from pathlib import Path
from typing import Any

from ..config import get_config_dir


class FileStore:
    def __init__(self, config_dir: Path | None = None) -> None:
        self.config_dir = (config_dir if config_dir is not None else get_config_dir()).expanduser()
        self.files_dir = self.config_dir / "files"
        self.files_dir.mkdir(parents=True, exist_ok=True)

    def create_file(
        self,
        *,
        filename: str,
        purpose: str,
        content: bytes,
        content_type: str | None = None,
    ) -> dict[str, Any]:
        now = int(time.time())
        file_id = f"file-{uuid.uuid4().hex[:24]}"
        file_dir = self.files_dir / file_id
        file_dir.mkdir(parents=True, exist_ok=False)

        binary_path = file_dir / "content.bin"
        metadata_path = file_dir / "file.json"
        binary_path.write_bytes(content)
        metadata = {
            "id": file_id,
            "object": "file",
            "bytes": len(content),
            "created_at": now,
            "filename": filename,
            "purpose": purpose,
            "status": "processed",
            "status_details": None,
            "content_type": content_type or "application/octet-stream",
        }
        metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
        return metadata

    def list_files(self) -> list[dict[str, Any]]:
        files: list[dict[str, Any]] = []
        for file_dir in self.files_dir.iterdir():
            metadata_path = file_dir / "file.json"
            if metadata_path.is_file():
                files.append(json.loads(metadata_path.read_text(encoding="utf-8")))
        files.sort(key=lambda item: int(item.get("created_at", 0)), reverse=True)
        return files

    def get_file(self, file_id: str) -> dict[str, Any]:
        metadata_path = self.files_dir / file_id / "file.json"
        if not metadata_path.is_file():
            raise FileNotFoundError(file_id)
        return json.loads(metadata_path.read_text(encoding="utf-8"))

    def get_file_content(self, file_id: str) -> bytes:
        content_path = self.files_dir / file_id / "content.bin"
        if not content_path.is_file():
            raise FileNotFoundError(file_id)
        return content_path.read_bytes()

    def get_file_content_path(self, file_id: str) -> Path:
        content_path = self.files_dir / file_id / "content.bin"
        if not content_path.is_file():
            raise FileNotFoundError(file_id)
        return content_path

    def export_file(self, file_id: str, destination: Path) -> Path:
        metadata = self.get_file(file_id)
        source_path = self.get_file_content_path(file_id)
        destination.parent.mkdir(parents=True, exist_ok=True)

        if destination.is_dir():
            target_path = destination / metadata["filename"]
        else:
            target_path = destination

        shutil.copyfile(source_path, target_path)
        return target_path

    def delete_file(self, file_id: str) -> dict[str, Any]:
        file_dir = self.files_dir / file_id
        if not file_dir.is_dir():
            raise FileNotFoundError(file_id)
        for child in file_dir.iterdir():
            child.unlink()
        file_dir.rmdir()
        return {
            "id": file_id,
            "object": "file",
            "deleted": True,
        }
