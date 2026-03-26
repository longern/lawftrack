from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from urllib import error
from urllib import request
from urllib.parse import urlsplit
from urllib.parse import urlunsplit

logger = logging.getLogger(__name__)


def build_vllm_url(base_url: str, path: str, query: str = "") -> str:
    normalized_base = base_url.rstrip("/")
    url = f"{normalized_base}/{path}"
    if query:
        return f"{url}?{query}"
    return url


def build_vllm_server_url(base_url: str, path: str, query: str = "") -> str:
    parsed = urlsplit(base_url)
    server_path = parsed.path.rstrip("/")
    if server_path.endswith("/v1"):
        server_path = server_path[:-3]
    normalized_path = f"{server_path}/{path}".replace("//", "/")
    return urlunsplit(
        (parsed.scheme, parsed.netloc, normalized_path, query, "")
    )


def is_local_vllm_endpoint(base_url: str) -> bool:
    hostname = (urlsplit(base_url).hostname or "").lower()
    return hostname in {"localhost", "127.0.0.1", "::1"}


@dataclass(frozen=True)
class RuntimeLoRAUpdateResult:
    ok: bool
    status_code: int | None
    message: str
    response_body: str


@dataclass(frozen=True)
class RuntimeServerControlResult:
    ok: bool
    status_code: int | None
    message: str
    response_body: str


@dataclass(frozen=True)
class VLLMConnectionCheckResult:
    ok: bool
    status_code: int | None
    message: str
    response_body: str


def check_vllm_connection(
    *,
    base_url: str,
    api_key: str,
    timeout: float = 5.0,
) -> VLLMConnectionCheckResult:
    headers: dict[str, str] = {}
    if api_key:
        headers["authorization"] = f"Bearer {api_key}"

    http_request = request.Request(
        build_vllm_url(base_url, "models"),
        headers=headers,
        method="GET",
    )

    try:
        with request.urlopen(http_request, timeout=timeout) as response:
            body = response.read().decode("utf-8", errors="replace")
            return VLLMConnectionCheckResult(
                ok=True,
                status_code=getattr(response, "status", 200),
                message="Successfully reached the configured vLLM endpoint.",
                response_body=body,
            )
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        if exc.code in {401, 403}:
            message = (
                f"Reached the vLLM endpoint, but the API key was rejected with HTTP {exc.code}."
            )
        else:
            message = f"vLLM responded with HTTP {exc.code} while checking `/models`."
        return VLLMConnectionCheckResult(
            ok=False,
            status_code=exc.code,
            message=message,
            response_body=body,
        )
    except error.URLError as exc:
        return VLLMConnectionCheckResult(
            ok=False,
            status_code=None,
            message=f"Could not reach the configured vLLM endpoint: {exc.reason}.",
            response_body="",
        )


def post_vllm_server_action(
    *,
    base_url: str,
    api_key: str,
    path: str,
    query: str = "",
    timeout: float = 30.0,
) -> RuntimeServerControlResult:
    headers: dict[str, str] = {}
    if api_key:
        headers["authorization"] = f"Bearer {api_key}"

    http_request = request.Request(
        build_vllm_server_url(base_url, path, query),
        headers=headers,
        method="POST",
    )

    try:
        with request.urlopen(http_request, timeout=timeout) as response:
            body = response.read().decode("utf-8", errors="replace")
            return RuntimeServerControlResult(
                ok=True,
                status_code=getattr(response, "status", 200),
                message=f"vLLM server action `{path}` succeeded.",
                response_body=body,
            )
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        return RuntimeServerControlResult(
            ok=False,
            status_code=exc.code,
            message=f"vLLM rejected the `{path}` request with HTTP {exc.code}.",
            response_body=body,
        )
    except error.URLError as exc:
        return RuntimeServerControlResult(
            ok=False,
            status_code=None,
            message=f"Could not reach the configured vLLM endpoint: {exc.reason}.",
            response_body="",
        )


def sleep_vllm(
    *,
    base_url: str,
    api_key: str,
    level: int,
    timeout: float = 30.0,
) -> RuntimeServerControlResult:
    return post_vllm_server_action(
        base_url=base_url,
        api_key=api_key,
        path="sleep",
        query=f"level={level}",
        timeout=timeout,
    )


def wake_up_vllm(
    *,
    base_url: str,
    api_key: str,
    timeout: float = 30.0,
) -> RuntimeServerControlResult:
    return post_vllm_server_action(
        base_url=base_url,
        api_key=api_key,
        path="wake_up",
        timeout=timeout,
    )


def load_lora_adapter(
    *,
    base_url: str,
    api_key: str,
    lora_name: str,
    lora_path: Path,
    load_inplace: bool = True,
    timeout: float = 30.0,
) -> RuntimeLoRAUpdateResult:
    payload = json.dumps(
        {
            "lora_name": lora_name,
            "lora_path": str(lora_path),
            "load_inplace": load_inplace,
        }
    ).encode("utf-8")
    headers = {"content-type": "application/json"}
    if api_key:
        headers["authorization"] = f"Bearer {api_key}"

    request_url = build_vllm_url(base_url, "load_lora_adapter")
    http_request = request.Request(
        request_url,
        data=payload,
        headers=headers,
        method="POST",
    )

    try:
        with request.urlopen(http_request, timeout=timeout) as response:
            body = response.read().decode("utf-8", errors="replace")
            return RuntimeLoRAUpdateResult(
                ok=True,
                status_code=getattr(response, "status", 200),
                message="LoRA adapter loaded successfully.",
                response_body=body,
            )
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        logger.exception(
            "Failed to load LoRA adapter into vLLM via HTTP error: "
            "request_url=%s base_url=%s lora_name=%s lora_path=%s load_inplace=%s "
            "status_code=%s response_body=%s",
            request_url,
            base_url,
            lora_name,
            lora_path,
            load_inplace,
            exc.code,
            body,
        )
        return RuntimeLoRAUpdateResult(
            ok=False,
            status_code=exc.code,
            message=f"vLLM rejected the LoRA adapter load request with HTTP {exc.code}.",
            response_body=body,
        )
    except error.URLError as exc:
        logger.exception(
            "Failed to load LoRA adapter into vLLM because the endpoint was unreachable: "
            "request_url=%s base_url=%s lora_name=%s lora_path=%s load_inplace=%s reason=%s",
            request_url,
            base_url,
            lora_name,
            lora_path,
            load_inplace,
            exc.reason,
        )
        return RuntimeLoRAUpdateResult(
            ok=False,
            status_code=None,
            message=f"Could not reach the configured vLLM endpoint: {exc.reason}.",
            response_body="",
        )
