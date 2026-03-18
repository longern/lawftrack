from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from urllib import error
from urllib import request


def build_vllm_url(base_url: str, path: str, query: str = "") -> str:
    normalized_base = base_url.rstrip("/")
    url = f"{normalized_base}/{path}"
    if query:
        return f"{url}?{query}"
    return url


@dataclass(frozen=True)
class RuntimeLoRAUpdateResult:
    ok: bool
    status_code: int | None
    message: str
    response_body: str


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

    http_request = request.Request(
        build_vllm_url(base_url, "load_lora_adapter"),
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
        return RuntimeLoRAUpdateResult(
            ok=False,
            status_code=exc.code,
            message=f"vLLM rejected the LoRA adapter load request with HTTP {exc.code}.",
            response_body=body,
        )
    except error.URLError as exc:
        return RuntimeLoRAUpdateResult(
            ok=False,
            status_code=None,
            message=f"Could not reach the configured vLLM endpoint: {exc.reason}.",
            response_body="",
        )
