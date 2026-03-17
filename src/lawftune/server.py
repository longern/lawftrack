from __future__ import annotations

import os
from pathlib import Path

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.responses import FileResponse
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles

from lawftune.config import load_config
from lawftune.fine_tuning_api import build_router as build_fine_tuning_router


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


def build_vllm_url(base_url: str, path: str, query: str) -> str:
    normalized_base = base_url.rstrip("/")
    url = f"{normalized_base}/v1/{path}"
    if query:
        return f"{url}?{query}"
    return url


def sanitize_outbound_headers(headers: Request.headers, api_key: str) -> dict[str, str]:
    outbound_headers = {
        key: value
        for key, value in headers.items()
        if key.lower() not in HOP_BY_HOP_HEADERS
    }
    if api_key and "authorization" not in {key.lower() for key in outbound_headers}:
        outbound_headers["authorization"] = f"Bearer {api_key}"
    return outbound_headers


def sanitize_inbound_headers(headers: httpx.Headers) -> dict[str, str]:
    return {
        key: value
        for key, value in headers.items()
        if key.lower() not in HOP_BY_HOP_HEADERS
    }


def build_cors_middleware_options() -> dict[str, object]:
    configured_origins = os.environ.get("LAWFTUNE_CORS_ALLOW_ORIGINS", "").strip()
    configured_regex = os.environ.get("LAWFTUNE_CORS_ALLOW_ORIGIN_REGEX", "").strip()
    options: dict[str, object] = {
        "allow_credentials": True,
        "allow_methods": ["*"],
        "allow_headers": ["*"],
    }
    if configured_origins:
        options["allow_origins"] = [
            origin.strip()
            for origin in configured_origins.split(",")
            if origin.strip()
        ]
        return options
    if configured_regex:
        options["allow_origin_regex"] = configured_regex
        return options
    options["allow_origin_regex"] = DEFAULT_CORS_ORIGIN_REGEX
    return options


def create_app(config_dir: Path | None = None) -> FastAPI:
    app = FastAPI(title="lawftune", version="0.1.0")
    app.add_middleware(CORSMiddleware, **build_cors_middleware_options())
    app.include_router(build_fine_tuning_router(config_dir))
    if PACKAGE_FRONTEND_INDEX.exists() and PACKAGE_FRONTEND_ASSETS_DIR.exists():
        app.mount("/assets", StaticFiles(directory=PACKAGE_FRONTEND_ASSETS_DIR), name="assets")

    @app.get("/", response_class=HTMLResponse)
    def index():
        if PACKAGE_FRONTEND_INDEX.exists():
            return FileResponse(PACKAGE_FRONTEND_INDEX)
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

        async with httpx.AsyncClient(follow_redirects=True, timeout=120.0) as client:
            upstream_response = await client.request(
                method=request.method,
                url=upstream_url,
                headers=headers,
                content=body,
            )

        return Response(
            content=upstream_response.content,
            status_code=upstream_response.status_code,
            headers=sanitize_inbound_headers(upstream_response.headers),
            media_type=upstream_response.headers.get("content-type"),
        )

    return app
