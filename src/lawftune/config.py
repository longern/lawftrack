from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any


DEFAULT_VLLM_ENDPOINT = "http://localhost:8000/v1"
DEFAULT_API_KEY = ""
DEFAULT_CONFIG_DIRNAME = ".lawftune"
CONFIG_FILENAME = "config.json"


def default_config() -> dict[str, Any]:
    return {
        "vllm_endpoint": DEFAULT_VLLM_ENDPOINT,
        "api_key": DEFAULT_API_KEY,
    }


def get_config_dir() -> Path:
    configured_home = os.environ.get("LAWFTUNE_HOME")
    if configured_home:
        return Path(configured_home).expanduser()

    return Path.home() / DEFAULT_CONFIG_DIRNAME


def get_config_path(config_dir: Path | None = None) -> Path:
    resolved_dir = config_dir if config_dir is not None else get_config_dir()
    return resolved_dir / CONFIG_FILENAME


def load_raw_config(config_dir: Path | None = None) -> dict[str, Any]:
    config_path = get_config_path(config_dir)
    if not config_path.exists():
        return default_config()

    payload = json.loads(config_path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"Config root must be a JSON object: {config_path}")

    merged = default_config()
    merged.update(payload)
    return merged


def load_config(config_dir: Path | None = None) -> dict[str, str]:
    payload = load_raw_config(config_dir)
    endpoint = str(payload.get("vllm_endpoint", DEFAULT_VLLM_ENDPOINT))
    api_key = str(payload.get("api_key", DEFAULT_API_KEY))
    return {
        "vllm_endpoint": endpoint,
        "api_key": api_key,
    }


def save_raw_config(payload: dict[str, Any], config_dir: Path | None = None) -> Path:
    target_dir = config_dir if config_dir is not None else get_config_dir()
    target_dir.mkdir(parents=True, exist_ok=True)
    config_path = get_config_path(target_dir)
    config_path.write_text(
        json.dumps(payload, indent=2) + "\n",
        encoding="utf-8",
    )
    return config_path


def save_config(
    *,
    endpoint: str,
    api_key: str,
    config_dir: Path | None = None,
) -> Path:
    payload = load_raw_config(config_dir)
    payload["vllm_endpoint"] = endpoint
    payload["api_key"] = api_key
    return save_raw_config(payload, config_dir)


def parse_config_value(raw_value: str) -> Any:
    try:
        return json.loads(raw_value)
    except json.JSONDecodeError:
        return raw_value


def set_config_value(
    key_path: str,
    value: Any,
    config_dir: Path | None = None,
) -> Path:
    payload = load_raw_config(config_dir)
    parts = [part for part in key_path.split(".") if part]
    if not parts:
        raise ValueError("Config key path cannot be empty.")

    cursor = payload
    for part in parts[:-1]:
        next_value = cursor.get(part)
        if not isinstance(next_value, dict):
            next_value = {}
            cursor[part] = next_value
        cursor = next_value
    cursor[parts[-1]] = value
    return save_raw_config(payload, config_dir)


def get_config_value(key_path: str, config_dir: Path | None = None) -> Any:
    payload = load_raw_config(config_dir)
    parts = [part for part in key_path.split(".") if part]
    if not parts:
        raise ValueError("Config key path cannot be empty.")

    cursor: Any = payload
    for part in parts:
        if not isinstance(cursor, dict) or part not in cursor:
            raise KeyError(key_path)
        cursor = cursor[part]
    return cursor
