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


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command == "install":
        return run_install_wizard(args)

    print("lawftune CLI is ready.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
