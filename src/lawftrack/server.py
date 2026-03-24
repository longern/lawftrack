from __future__ import annotations

import os
import platform
import socket
import subprocess
from pathlib import Path

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.background import BackgroundTasks
from fastapi.responses import HTMLResponse
from fastapi.responses import FileResponse
from fastapi.responses import Response
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles

from .api.datasets_api import build_router as build_datasets_router
from .api.fine_tuning_api import build_router as build_fine_tuning_router
from .api.files_api import build_router as build_files_router
from .config import load_config
from .vllm import build_vllm_url


PACKAGE_FRONTEND_DIR = Path(__file__).resolve().parent / "_frontend"
FRONTEND_DIR = Path(__file__).resolve().parents[2] / "frontend"
PACKAGE_FRONTEND_ASSETS_DIR = PACKAGE_FRONTEND_DIR / "assets"
PACKAGE_FRONTEND_INDEX = PACKAGE_FRONTEND_DIR / "index.html"
HOP_BY_HOP_HEADERS = {
    "connection",
    "content-length",
    "host",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
}
DEFAULT_CORS_ORIGIN_REGEX = r"^https?://(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$"


def parse_optional_int(raw_value: str) -> int | None:
    try:
        return int(raw_value)
    except (TypeError, ValueError):
        return None


def query_gpu_metrics() -> list[dict[str, str | int | None]]:
    try:
        result = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=name,memory.total,memory.used,memory.free,utilization.gpu,temperature.gpu",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True,
            text=True,
            check=True,
            timeout=2,
        )
    except (FileNotFoundError, OSError, subprocess.SubprocessError):
        return []

    gpus: list[dict[str, str | int | None]] = []
    for index, line in enumerate(result.stdout.splitlines()):
        if not line.strip():
            continue
        parts = [part.strip() for part in line.split(",")]
        if len(parts) != 6:
            continue
        name, memory_total, memory_used, memory_free, utilization_gpu, temperature = parts
        gpus.append(
            {
                "index": index,
                "name": name or "Unknown GPU",
                "memory_total_mb": parse_optional_int(memory_total),
                "memory_used_mb": parse_optional_int(memory_used),
                "memory_free_mb": parse_optional_int(memory_free),
                "utilization_gpu_percent": parse_optional_int(utilization_gpu),
                "temperature_celsius": parse_optional_int(temperature),
            }
        )
    return gpus


def build_status_payload() -> dict[str, object]:
    system_name = platform.system() or "Unknown"
    release_name = platform.release() or "Unknown"
    return {
        "name": "lawftrack",
        "status": "running",
        "hostname": socket.gethostname() or "Unknown",
        "operating_system": f"{system_name} {release_name}".strip(),
        "architecture": platform.machine() or "Unknown",
        "cpu_threads": os.cpu_count(),
        "python_version": platform.python_version(),
        "gpus": query_gpu_metrics(),
    }


def sanitize_outbound_headers(headers: Request.headers, api_key: str) -> dict[str, str]:
    outbound_headers = {
        key: value
        for key, value in headers.items()
        if key.lower() not in HOP_BY_HOP_HEADERS
    }
    if api_key:
        outbound_headers["authorization"] = f"Bearer {api_key}"
    return outbound_headers


def sanitize_inbound_headers(headers: httpx.Headers) -> dict[str, str]:
    return {
        key: value
        for key, value in headers.items()
        if key.lower() not in HOP_BY_HOP_HEADERS
    }


async def close_streaming_upstream(
    upstream_response: httpx.Response, client: httpx.AsyncClient
) -> None:
    await upstream_response.aclose()
    await client.aclose()


def build_cors_middleware_options() -> dict[str, object]:
    configured_origins = os.environ.get("LAWFTRACK_CORS_ALLOW_ORIGINS", "").strip()
    configured_regex = os.environ.get("LAWFTRACK_CORS_ALLOW_ORIGIN_REGEX", "").strip()
    options: dict[str, object] = {
        "allow_credentials": True,
        "allow_methods": ["*"],
        "allow_headers": ["*"],
    }
    if configured_origins:
        options["allow_origins"] = [
            origin.strip() for origin in configured_origins.split(",") if origin.strip()
        ]
        return options
    if configured_regex:
        options["allow_origin_regex"] = configured_regex
        return options
    options["allow_origin_regex"] = DEFAULT_CORS_ORIGIN_REGEX
    return options


def create_app(config_dir: Path | None = None) -> FastAPI:
    app = FastAPI(title="lawftrack", version="0.1.0")
    app.add_middleware(CORSMiddleware, **build_cors_middleware_options())
    app.include_router(build_datasets_router(config_dir))
    app.include_router(
        build_files_router(config_dir, prefixes=("/v1/files", "/api/files"))
    )
    app.include_router(
        build_fine_tuning_router(
            config_dir, prefixes=("/v1/fine_tuning", "/api/fine_tuning")
        )
    )
    if PACKAGE_FRONTEND_INDEX.exists() and PACKAGE_FRONTEND_ASSETS_DIR.exists():
        app.mount(
            "/assets", StaticFiles(directory=PACKAGE_FRONTEND_ASSETS_DIR), name="assets"
        )

    @app.get("/", response_class=HTMLResponse)
    def index():
        if PACKAGE_FRONTEND_INDEX.exists():
            return FileResponse(PACKAGE_FRONTEND_INDEX)
        return HTMLResponse(
            "<!DOCTYPE html><html><body><h1>lawftrack gateway</h1>"
            "<p>The frontend UI is not bundled in this installation.</p>"
            "<p>Reinstall without <code>--headless</code> to enable the web UI.</p>"
            "</body></html>",
            status_code=200,
        )

    @app.get("/status")
    @app.get("/api/status")
    def status() -> dict[str, object]:
        return build_status_payload()

    @app.get("/healthz")
    @app.get("/api/healthz")
    def healthz() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/config")
    @app.get("/api/config")
    def config() -> dict[str, str | bool]:
        current_config = load_config(config_dir)
        return {
            "vllm_endpoint": current_config["vllm_endpoint"],
            "has_api_key": bool(current_config["api_key"]),
        }

    @app.api_route(
        "/v1/{path:path}",
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    )
    async def proxy_v1(path: str, request: Request) -> Response:
        current_config = load_config(config_dir)
        upstream_url = build_vllm_url(
            current_config["vllm_endpoint"],
            path,
            request.url.query,
        )
        headers = sanitize_outbound_headers(request.headers, current_config["api_key"])
        body = await request.body()
        client = httpx.AsyncClient(follow_redirects=True, timeout=120.0)
        upstream_request = client.build_request(
            method=request.method,
            url=upstream_url,
            headers=headers,
            content=body,
        )
        upstream_response = await client.send(upstream_request, stream=True)

        background = BackgroundTasks()
        background.add_task(close_streaming_upstream, upstream_response, client)

        return StreamingResponse(
            upstream_response.aiter_raw(),
            status_code=upstream_response.status_code,
            headers=sanitize_inbound_headers(upstream_response.headers),
            media_type=upstream_response.headers.get("content-type"),
            background=background,
        )

    return app

