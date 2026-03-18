from __future__ import annotations

import json
import shlex
import subprocess
import sys
from importlib import metadata
from pathlib import Path
from urllib.parse import unquote
from urllib.parse import urlparse

from lawftune.service import ServiceManagerError
from lawftune.service import get_service_manager


PACKAGE_NAME = "lawftune"
DEFAULT_UPDATE_TARGET = f"{PACKAGE_NAME}[server]"


def is_git_source(source: str) -> bool:
    return source.startswith(("git+", "git@", "ssh://")) or source.endswith(".git")


def build_local_path_target(path: Path) -> str:
    resolved_path = path.expanduser().resolve()
    if resolved_path.is_dir():
        return f"{resolved_path}[server]"
    return str(resolved_path)


def build_git_target(source: str) -> str:
    normalized_source = source if source.startswith("git+") else f"git+{source}"
    return f"{PACKAGE_NAME}[server] @ {normalized_source}"


def file_url_to_path(url: str) -> Path:
    parsed = urlparse(url)
    return Path(unquote(parsed.path))


def build_directory_target(path: Path) -> str:
    return f"{path.expanduser().resolve()}[server]"


def infer_update_target() -> str:
    try:
        distribution = metadata.distribution(PACKAGE_NAME)
    except metadata.PackageNotFoundError:
        return DEFAULT_UPDATE_TARGET

    direct_url = distribution.read_text("direct_url.json")
    if not direct_url:
        return DEFAULT_UPDATE_TARGET

    payload = json.loads(direct_url)
    source_url = str(payload.get("url", "")).strip()
    if not source_url:
        return DEFAULT_UPDATE_TARGET

    if source_url.startswith("file://") and isinstance(payload.get("dir_info"), dict):
        return build_directory_target(file_url_to_path(source_url))

    if source_url.startswith("file://"):
        return build_local_path_target(file_url_to_path(source_url))

    vcs_info = payload.get("vcs_info", {})
    if isinstance(vcs_info, dict) and vcs_info.get("vcs") == "git":
        revision = vcs_info.get("requested_revision") or vcs_info.get("commit_id")
        git_source = source_url
        if revision:
            git_source = f"{git_source}@{revision}"
        return build_git_target(git_source)

    return DEFAULT_UPDATE_TARGET


def resolve_update_target(source: str | None) -> str:
    if source is None:
        return infer_update_target()

    source_text = source.strip()
    if source_text == "":
        return infer_update_target()

    source_path = Path(source_text).expanduser()
    if source_path.exists():
        return build_local_path_target(source_path)

    if is_git_source(source_text):
        return build_git_target(source_text)

    return source_text


def build_update_command(source: str | None) -> list[str]:
    return [
        sys.executable,
        "-m",
        "pip",
        "install",
        "--upgrade",
        resolve_update_target(source),
    ]


def prompt_yes_no(label: str, default: bool = False) -> bool:
    default_hint = "Y/n" if default else "y/N"
    value = input(f"{label} [{default_hint}]: ").strip().lower()
    if value == "":
        return default
    return value in {"y", "yes"}


def maybe_restart_gateway(*, assume_yes: bool = False) -> None:
    try:
        manager = get_service_manager()
    except ServiceManagerError:
        print("If the gateway is running, restart it to load the updated version:")
        print("lawftune gateway restart")
        return

    if not manager.is_installed():
        print("If the gateway is running, restart it to load the updated version:")
        print("lawftune gateway restart")
        return

    print("A gateway system service is installed.")
    should_restart = assume_yes or prompt_yes_no("Restart the gateway now?", default=False)
    if not should_restart:
        print("You can restart it later with:")
        print("lawftune gateway restart")
        return

    try:
        print(manager.restart())
    except ServiceManagerError as exc:
        print(f"Could not restart the gateway automatically: {exc}")
        print("Restart it manually with:")
        print("lawftune gateway restart")


def run_update(source: str | None = None, dry_run: bool = False, assume_yes: bool = False) -> int:
    command = build_update_command(source)
    if dry_run:
        print(" ".join(shlex.quote(part) for part in command))
        return 0

    result = subprocess.run(command, check=False)
    if result.returncode == 0:
        print("lawftune update completed.")
        maybe_restart_gateway(assume_yes=assume_yes)
    return result.returncode
