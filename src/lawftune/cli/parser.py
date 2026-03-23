from __future__ import annotations

import argparse
from pathlib import Path

from lawftune import __version__
from lawftune.config import DEFAULT_API_KEY
from lawftune.config import DEFAULT_VLLM_ENDPOINT


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

    wizard_parser = subparsers.add_parser(
        "wizard",
        help="run the setup wizard",
        description="Configure lawftune for a vLLM endpoint.",
    )
    wizard_parser.add_argument(
        "--endpoint",
        default=None,
        help=f"vLLM endpoint address (default: {DEFAULT_VLLM_ENDPOINT})",
    )
    wizard_parser.add_argument(
        "--api-key",
        default=None,
        help="API key for the vLLM endpoint (default: empty)",
    )
    wizard_parser.add_argument(
        "--models-dir",
        default=None,
        help="optional local models root; matching subdirectories are preferred before remote downloads",
    )
    wizard_parser.add_argument(
        "--config-dir",
        type=Path,
        default=None,
        help="directory used to store config (default: ~/.lawftune or LAWFTUNE_HOME)",
    )

    train_parser = subparsers.add_parser(
        "train",
        help="run a training worker",
        description="Run a lawftune training worker.",
    )
    train_parser.add_argument(
        "--config-dir",
        type=Path,
        required=True,
        help="directory used to load runtime state",
    )
    train_parser.add_argument(
        "--job-id",
        required=True,
        help="fine-tuning job identifier",
    )

    config_parser = subparsers.add_parser(
        "config",
        help="show or update runtime config",
        description="Show or update lawftune runtime config.",
    )
    config_parser.add_argument(
        "action",
        choices=["show", "get", "set"],
        nargs="?",
        default="show",
        help="config action to run (default: show)",
    )
    config_parser.add_argument(
        "key",
        nargs="?",
        help="dot-separated config key path",
    )
    config_parser.add_argument(
        "value",
        nargs="?",
        help="value to write for `config set`",
    )
    config_parser.add_argument(
        "--config-dir",
        type=Path,
        default=None,
        help="directory used to load config (default: ~/.lawftune or LAWFTUNE_HOME)",
    )

    update_parser = subparsers.add_parser(
        "update",
        help="update lawftune",
        description="Update lawftune from the current install source, a local path, or a git repository.",
    )
    update_parser.add_argument(
        "source",
        nargs="?",
        default=None,
        help="optional update source: local directory, git repository URL, or pip requirement",
    )
    update_parser.add_argument(
        "--dry-run",
        action="store_true",
        help="print the pip command without executing it",
    )
    update_parser.add_argument(
        "--yes",
        action="store_true",
        help="accept the gateway restart prompt automatically",
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
