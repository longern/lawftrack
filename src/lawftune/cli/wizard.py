from __future__ import annotations

import argparse
from pathlib import Path
from typing import Callable

from lawftune.service import ServiceManagerError


def run_wizard(
    args: argparse.Namespace,
    *,
    default_vllm_endpoint: str,
    default_api_key: str,
    default_gateway_port: int,
    get_config_dir: Callable[[], Path],
    save_config: Callable[..., Path],
    prompt_value: Callable[[str, str], str],
    prompt_yes_no: Callable[[str, bool], bool],
    get_service_manager,
    build_service_config,
    gateway_access_url: Callable[[str, int], str],
) -> int:
    target_dir = args.config_dir.expanduser() if args.config_dir is not None else get_config_dir()
    endpoint = args.endpoint if args.endpoint is not None else prompt_value(
        "vLLM endpoint",
        default_vllm_endpoint,
    )
    api_key = args.api_key if args.api_key is not None else prompt_value(
        "API key",
        default_api_key,
    )
    config_path = save_config(
        endpoint=endpoint,
        api_key=api_key,
        config_dir=target_dir,
    )
    print(f"Configuration saved to {config_path}")

    if prompt_yes_no("Install the gateway as a system service?", default=False):
        manager = get_service_manager()
        service_config = build_service_config(
            host="127.0.0.1",
            port=default_gateway_port,
            config_dir=target_dir,
        )
        try:
            print(manager.install(service_config))
            print(f"Gateway URL: {gateway_access_url(service_config.host, service_config.port)}")
        except ServiceManagerError as exc:
            raise SystemExit(str(exc)) from exc
    return 0
