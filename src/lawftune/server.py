from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from lawftune.config import load_config


PACKAGE_FRONTEND_DIR = Path(__file__).resolve().parent / "_frontend"
FRONTEND_DIR = Path(__file__).resolve().parents[2] / "frontend"
FRONTEND_SRC_DIR = FRONTEND_DIR / "src"
PACKAGE_FRONTEND_ASSETS_DIR = PACKAGE_FRONTEND_DIR / "assets"
PACKAGE_FRONTEND_INDEX = PACKAGE_FRONTEND_DIR / "index.html"
SOURCE_FRONTEND_INDEX = FRONTEND_DIR / "index.html"


def create_app(config_dir: Path | None = None) -> FastAPI:
    app = FastAPI(title="lawftune", version="0.1.0")
    if PACKAGE_FRONTEND_INDEX.exists() and PACKAGE_FRONTEND_ASSETS_DIR.exists():
        app.mount("/assets", StaticFiles(directory=PACKAGE_FRONTEND_ASSETS_DIR), name="assets")
    elif SOURCE_FRONTEND_INDEX.exists() and FRONTEND_SRC_DIR.exists():
        app.mount("/src", StaticFiles(directory=FRONTEND_SRC_DIR), name="src")

    @app.get("/", response_class=HTMLResponse)
    def index():
        if PACKAGE_FRONTEND_INDEX.exists():
            return FileResponse(PACKAGE_FRONTEND_INDEX)
        if SOURCE_FRONTEND_INDEX.exists():
            return FileResponse(SOURCE_FRONTEND_INDEX)
        return HTMLResponse(
            "<!DOCTYPE html><html><body><h1>lawftune gateway</h1>"
            "<p>The frontend UI is not bundled in this installation.</p>"
            "<p>Reinstall without <code>--headless</code> to enable the web UI.</p>"
            "</body></html>",
            status_code=200,
        )

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
