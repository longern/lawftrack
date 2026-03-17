from __future__ import annotations

import argparse
from pathlib import Path

from lawftune import __version__
from lawftune.config import (
    DEFAULT_API_KEY,
    DEFAULT_VLLM_ENDPOINT,
    get_config_dir,
    save_config,
)
from lawftune.service import (
    ServiceManagerError,
    build_service_config,
    get_service_manager,
)

DEFAULT_GATEWAY_PORT = 5293


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="lawftune",
        description="lawftune command line interface",
    )
    parser.add_argument(
        "--version",
        action="version",
        version=f"%(prog)s {__version__}",
    )
    subparsers = parser.add_subparsers(dest="command")

    install_parser = subparsers.add_parser(
        "install",
        help="run the installation wizard",
        description="Configure lawftune for a vLLM endpoint.",
    )
    install_parser.add_argument(
        "--endpoint",
        default=None,
        help=f"vLLM endpoint address (default: {DEFAULT_VLLM_ENDPOINT})",
    )
    install_parser.add_argument(
        "--api-key",
        default=None,
        help="API key for the vLLM endpoint (default: empty)",
    )
    install_parser.add_argument(
        "--config-dir",
        type=Path,
        default=None,
        help="directory used to store config (default: ~/.lawftune or LAWFTUNE_HOME)",
    )

    gateway_parser = subparsers.add_parser(
        "gateway",
        help="run or manage the lawftune gateway",
        description="Run or manage the lawftune gateway.",
    )
    gateway_parser.add_argument(
        "action",
        choices=["run", "install", "start", "stop", "restart", "status", "uninstall"],
        nargs="?",
        default="run",
        help="gateway action to run (default: run)",
    )
    gateway_parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="host interface for the gateway or gateway definition (default: 127.0.0.1)",
    )
    gateway_parser.add_argument(
        "--port",
        type=int,
        default=DEFAULT_GATEWAY_PORT,
        help=f"port for the gateway or gateway definition (default: {DEFAULT_GATEWAY_PORT})",
    )
    gateway_parser.add_argument(
        "--config-dir",
        type=Path,
        default=None,
        help="directory used to load config (default: ~/.lawftune or LAWFTUNE_HOME)",
    )
    return parser


def prompt_value(label: str, default: str) -> str:
    default_text = f" [{default}]" if default else ""
    value = input(f"{label}{default_text}: ").strip()
    return default if value == "" else value


def run_install_wizard(args: argparse.Namespace) -> int:
    target_dir = args.config_dir.expanduser() if args.config_dir is not None else get_config_dir()
    endpoint = args.endpoint if args.endpoint is not None else prompt_value(
        "vLLM endpoint",
        DEFAULT_VLLM_ENDPOINT,
    )
    api_key = args.api_key if args.api_key is not None else prompt_value(
        "API key",
        DEFAULT_API_KEY,
    )
    config_path = save_config(
        endpoint=endpoint,
        api_key=api_key,
        config_dir=target_dir,
    )
    print(f"Configuration saved to {config_path}")
    return 0


def run_gateway(args: argparse.Namespace) -> int:
    try:
        import uvicorn
    except ModuleNotFoundError as exc:
        raise SystemExit(
            "FastAPI gateway dependencies are missing. Install them with "
            '`python3 -m pip install ".[server]"`.'
        ) from exc

    from lawftune.server import create_app

    config_dir = args.config_dir.expanduser() if args.config_dir is not None else get_config_dir()
    app = create_app(config_dir)
    uvicorn.run(app, host=args.host, port=args.port)
    return 0


def run_gateway_command(args: argparse.Namespace) -> int:
    config_dir = args.config_dir.expanduser() if args.config_dir is not None else get_config_dir()
    manager = get_service_manager()

    try:
        if args.action == "run":
            return run_gateway(args)
        if args.action == "install":
            service_config = build_service_config(
                host=args.host,
                port=args.port,
                config_dir=config_dir,
            )
            print(manager.install(service_config))
            return 0

        action = getattr(manager, args.action)
        print(action())
        return 0
    except ServiceManagerError as exc:
        raise SystemExit(str(exc)) from exc


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command == "install":
        return run_install_wizard(args)
    if args.command == "gateway":
        return run_gateway_command(args)

    print("lawftune CLI is ready.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
