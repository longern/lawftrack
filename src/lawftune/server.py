from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI

from lawftune.config import load_config


def create_app(config_dir: Path | None = None) -> FastAPI:
    app = FastAPI(title="lawftune", version="0.1.0")

    @app.get("/")
    def root() -> dict[str, str]:
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
