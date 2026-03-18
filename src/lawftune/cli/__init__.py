from __future__ import annotations

from lawftune.config import DEFAULT_API_KEY
from lawftune.config import DEFAULT_VLLM_ENDPOINT
from lawftune.config import get_config_dir
from lawftune.config import get_config_value
from lawftune.config import load_raw_config
from lawftune.config import parse_config_value
from lawftune.config import save_config
from lawftune.config import set_config_value
from lawftune.service import build_service_config
from lawftune.service import get_service_manager

from .config_command import run_config_command
from .gateway import gateway_access_url
from .gateway import run_gateway
from .gateway import run_gateway_command
from .parser import DEFAULT_GATEWAY_PORT
from .parser import build_parser
from .prompts import prompt_value
from .prompts import prompt_yes_no
from .train import run_train_command
from .update_command import run_update_command
from .wizard import run_wizard as run_wizard_impl


def run_wizard(args) -> int:
    return run_wizard_impl(
        args,
        default_vllm_endpoint=DEFAULT_VLLM_ENDPOINT,
        default_api_key=DEFAULT_API_KEY,
        default_gateway_port=DEFAULT_GATEWAY_PORT,
        get_config_dir=get_config_dir,
        save_config=save_config,
        prompt_value=prompt_value,
        prompt_yes_no=prompt_yes_no,
        get_service_manager=get_service_manager,
        build_service_config=build_service_config,
        gateway_access_url=gateway_access_url,
    )


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command == "wizard":
        return run_wizard(args)
    if args.command == "train":
        return run_train_command(args)
    if args.command == "config":
        return run_config_command(
            args,
            get_config_dir=get_config_dir,
            load_raw_config=load_raw_config,
            get_config_value=get_config_value,
            set_config_value=set_config_value,
            parse_config_value=parse_config_value,
        )
    if args.command == "update":
        return run_update_command(args)
    if args.command == "gateway":
        return run_gateway_command(
            args,
            get_config_dir=get_config_dir,
            get_service_manager=get_service_manager,
            build_service_config=build_service_config,
        )

    parser.print_help()
    return 0
