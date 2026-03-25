from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Callable

from ..service import ServiceManagerError
from ..vllm import check_vllm_connection
from .wizard_ui import BACK
from .wizard_ui import prompt_select_step
from .wizard_ui import prompt_text_step


class WizardCanceled(Exception):
    pass


def collect_wizard_inputs(
    *,
    initial_endpoint: str,
    initial_api_key: str,
    initial_models_dir: str,
    is_local_vllm_endpoint,
    vllm_sleep_level: int,
    text_step=prompt_text_step,
    select_step=prompt_select_step,
    verify_connection=check_vllm_connection,
    should_check_connection: bool | None = None,
) -> tuple[str, str, str, bool, bool]:
    endpoint = initial_endpoint
    api_key = initial_api_key
    models_dir = initial_models_dir
    should_sleep_vllm = False
    install_gateway = False
    connection_checked = False
    index = 0
    if should_check_connection is None:
        should_check_connection = sys.stdin.isatty() and sys.stdout.isatty()

    while True:
        steps = ["endpoint", "api_key"]
        if should_check_connection:
            steps.append("connection_check")
        steps.append("models_dir")
        if is_local_vllm_endpoint(endpoint):
            steps.append("local_sleep")
        steps.append("gateway")

        if index >= len(steps):
            return (
                endpoint,
                api_key,
                models_dir,
                should_sleep_vllm,
                install_gateway,
            )

        step = steps[index]
        if step == "endpoint":
            result = text_step(
                label="vLLM endpoint",
                default=endpoint,
                help_text="Usually http://localhost:8000/v1 for a local server.",
            )
            if result is BACK:
                raise WizardCanceled
            endpoint = result
            connection_checked = False
            index += 1
            continue

        if step == "api_key":
            result = text_step(
                label="API key",
                default=api_key,
                help_text="Leave blank if your endpoint does not require authentication.",
            )
            if result is BACK:
                index -= 1
                continue
            api_key = result
            connection_checked = False
            index += 1
            continue

        if step == "connection_check":
            if connection_checked:
                index += 1
                continue

            connection_result = verify_connection(
                base_url=endpoint,
                api_key=api_key,
            )
            connection_checked = True
            if connection_result.ok:
                index += 1
                continue

            result = select_step(
                message=(
                    "Could not verify the vLLM connection.\n"
                    f"{connection_result.message}\n"
                    "What do you want to do?"
                ),
                choices=["Modify URL", "Modify API key", "Continue anyway"],
                default_index=2,
            )
            if result is BACK:
                index -= 1
                continue
            if result == 0:
                index = 0
                continue
            if result == 1:
                index = 1
                continue
            index += 1
            continue

        if step == "models_dir":
            result = text_step(
                label="Local models directory",
                default=models_dir,
                help_text="Optional. Matching subdirectories are preferred before remote downloads.",
            )
            if result is BACK:
                index -= 1
                continue
            models_dir = result
            index += 1
            continue

        if step == "local_sleep":
            result = select_step(
                message=(
                    "Detected a local vLLM endpoint. Let training jobs put vLLM into "
                    f"sleep mode (level {vllm_sleep_level}) before training to free GPU memory?"
                ),
                choices=["Yes", "No"],
                default_index=1,
            )
            if result is BACK:
                index -= 1
                continue
            should_sleep_vllm = result == 0
            index += 1
            continue

        result = select_step(
            message="Install the gateway as a system service?",
            choices=["Yes", "No"],
            default_index=1,
        )
        if result is BACK:
            index -= 1
            continue
        install_gateway = result == 0
        index += 1


def run_wizard(
    args: argparse.Namespace,
    *,
    default_vllm_endpoint: str,
    default_api_key: str,
    default_models_dir: str,
    default_gateway_port: int,
    get_config_dir: Callable[[], Path],
    save_config: Callable[..., Path],
    set_config_value,
    get_service_manager,
    build_service_config,
    gateway_access_url: Callable[[str, int], str],
    is_local_vllm_endpoint,
    vllm_sleep_level: int,
) -> int:
    try:
        target_dir = args.config_dir.expanduser() if args.config_dir is not None else get_config_dir()
        endpoint, api_key, models_dir, should_sleep_vllm, install_gateway = collect_wizard_inputs(
            initial_endpoint=args.endpoint if args.endpoint is not None else default_vllm_endpoint,
            initial_api_key=args.api_key if args.api_key is not None else default_api_key,
            initial_models_dir=args.models_dir if args.models_dir is not None else default_models_dir,
            is_local_vllm_endpoint=is_local_vllm_endpoint,
            vllm_sleep_level=vllm_sleep_level,
        )
        config_path = save_config(
            endpoint=endpoint,
            api_key=api_key,
            models_dir=models_dir,
            config_dir=target_dir,
        )

        if is_local_vllm_endpoint(endpoint):
            set_config_value(
                "training.local_vllm_sleep.enabled",
                should_sleep_vllm,
                target_dir,
            )
            set_config_value(
                "training.local_vllm_sleep.level",
                vllm_sleep_level,
                target_dir,
            )

        print(f"Configuration saved to {config_path}")

        if install_gateway:
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
    except WizardCanceled as exc:
        raise SystemExit("Wizard canceled.") from exc
    except EOFError as exc:
        raise SystemExit(
            "Wizard requires interactive input. Re-run it in a terminal or use --skip-wizard during installation."
        ) from exc
