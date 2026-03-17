from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from lawftune.config import load_config


FRONTEND_DIR = Path(__file__).resolve().parents[2] / "frontend"
FRONTEND_SRC_DIR = FRONTEND_DIR / "src"
FRONTEND_DIST_DIR = FRONTEND_DIR / "dist"
FRONTEND_DIST_ASSETS_DIR = FRONTEND_DIST_DIR / "assets"


def create_app(config_dir: Path | None = None) -> FastAPI:
    app = FastAPI(title="lawftune", version="0.1.0")
    if FRONTEND_DIST_DIR.exists() and FRONTEND_DIST_ASSETS_DIR.exists():
        app.mount("/assets", StaticFiles(directory=FRONTEND_DIST_ASSETS_DIR), name="assets")
    else:
        app.mount("/src", StaticFiles(directory=FRONTEND_SRC_DIR), name="src")

    @app.get("/")
    def index() -> FileResponse:
        if FRONTEND_DIST_DIR.exists():
            return FileResponse(FRONTEND_DIST_DIR / "index.html")
        return FileResponse(FRONTEND_DIR / "index.html")

    @app.get("/status")
    def status() -> dict[str, str]:
        return {"name": "lawftune", "status": "running"}

    @app.get("/healthz")
    def healthz() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/config")
    def config() -> dict[str, str | bool]:
        current_config = load_config(config_dir)
        return {
            "vllm_endpoint": current_config["vllm_endpoint"],
            "has_api_key": bool(current_config["api_key"]),
        }

    return app
