from __future__ import annotations

import json
import os
from pathlib import Path


DEFAULT_VLLM_ENDPOINT = "http://localhost:8000/v1"
DEFAULT_API_KEY = ""
DEFAULT_CONFIG_DIRNAME = ".lawftune"
CONFIG_FILENAME = "config.json"


def get_config_dir() -> Path:
    configured_home = os.environ.get("LAWFTUNE_HOME")
    if configured_home:
        return Path(configured_home).expanduser()

    return Path.home() / DEFAULT_CONFIG_DIRNAME


def get_config_path(config_dir: Path | None = None) -> Path:
    resolved_dir = config_dir if config_dir is not None else get_config_dir()
    return resolved_dir / CONFIG_FILENAME


def load_config(config_dir: Path | None = None) -> dict[str, str]:
    config_path = get_config_path(config_dir)
    if not config_path.exists():
        return {
            "vllm_endpoint": DEFAULT_VLLM_ENDPOINT,
            "api_key": DEFAULT_API_KEY,
        }

    payload = json.loads(config_path.read_text(encoding="utf-8"))
    endpoint = str(payload.get("vllm_endpoint", DEFAULT_VLLM_ENDPOINT))
    api_key = str(payload.get("api_key", DEFAULT_API_KEY))
    return {
        "vllm_endpoint": endpoint,
        "api_key": api_key,
    }


def save_config(
    *,
    endpoint: str,
    api_key: str,
    config_dir: Path | None = None,
) -> Path:
    target_dir = config_dir if config_dir is not None else get_config_dir()
    target_dir.mkdir(parents=True, exist_ok=True)
    config_path = get_config_path(target_dir)
    config_path.write_text(
        json.dumps(
            {
                "vllm_endpoint": endpoint,
                "api_key": api_key,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    return config_path
