from __future__ import annotations

import os
import platform
import plistlib
import shlex
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


SERVICE_NAME = "lawftune-gateway"
MACOS_LABEL = "io.lawftune.gateway"


@dataclass(frozen=True)
class ServiceConfig:
    host: str
    port: int
    config_dir: Path
    python_executable: str

    def gateway_run_command(self) -> list[str]:
        return [
            self.python_executable,
            "-m",
            "lawftune",
            "gateway",
            "run",
            "--host",
            self.host,
            "--port",
            str(self.port),
            "--config-dir",
            str(self.config_dir),
        ]


class ServiceManagerError(RuntimeError):
    pass


class BaseServiceManager:
    def is_installed(self) -> bool:
        raise NotImplementedError

    def install(self, config: ServiceConfig) -> str:
        raise NotImplementedError

    def start(self) -> str:
        raise NotImplementedError

    def stop(self) -> str:
        raise NotImplementedError

    def restart(self) -> str:
        self.stop()
        return self.start()

    def status(self) -> str:
        raise NotImplementedError

    def uninstall(self) -> str:
        raise NotImplementedError


class LaunchdServiceManager(BaseServiceManager):
    @property
    def service_file(self) -> Path:
        return Path.home() / "Library" / "LaunchAgents" / f"{MACOS_LABEL}.plist"

    @property
    def bootstrap_target(self) -> str:
        return f"gui/{os.getuid()}"

    @property
    def service_target(self) -> str:
        return f"{self.bootstrap_target}/{MACOS_LABEL}"

    def is_installed(self) -> bool:
        return self.service_file.exists()

    def install(self, config: ServiceConfig) -> str:
        self.service_file.parent.mkdir(parents=True, exist_ok=True)
        log_dir = config.config_dir / "logs"
        log_dir.mkdir(parents=True, exist_ok=True)

        payload = {
            "Label": MACOS_LABEL,
            "ProgramArguments": config.gateway_run_command(),
            "RunAtLoad": False,
            "KeepAlive": True,
            "WorkingDirectory": str(config.config_dir),
            "StandardOutPath": str(log_dir / "gateway.stdout.log"),
            "StandardErrorPath": str(log_dir / "gateway.stderr.log"),
        }
        with self.service_file.open("wb") as handle:
            plistlib.dump(payload, handle)

        return f"launchd gateway definition written to {self.service_file}"

    def start(self) -> str:
        self._run_command(
            [
                "launchctl",
                "bootstrap",
                self.bootstrap_target,
                str(self.service_file),
            ]
        )
        return f"launchd gateway started: {MACOS_LABEL}"

    def stop(self) -> str:
        self._run_command(
            [
                "launchctl",
                "bootout",
                self.bootstrap_target,
                str(self.service_file),
            ]
        )
        return f"launchd gateway stopped: {MACOS_LABEL}"

    def restart(self) -> str:
        try:
            self.stop()
        except ServiceManagerError:
            pass
        return self.start()

    def status(self) -> str:
        result = self._run_command(
            [
                "launchctl",
                "print",
                self.service_target,
            ],
            capture_output=True,
        )
        return result.stdout.strip() or f"launchd gateway loaded: {MACOS_LABEL}"

    def uninstall(self) -> str:
        if self.service_file.exists():
            try:
                self.stop()
            except ServiceManagerError:
                pass
            self.service_file.unlink()
        return f"launchd gateway definition removed: {self.service_file}"

    def _run_command(
        self,
        args: list[str],
        *,
        capture_output: bool = False,
    ) -> subprocess.CompletedProcess[str]:
        try:
            return subprocess.run(
                args,
                check=True,
                capture_output=capture_output,
                text=True,
            )
        except FileNotFoundError as exc:
            raise ServiceManagerError("`launchctl` is not available on this system.") from exc
        except subprocess.CalledProcessError as exc:
            stderr = exc.stderr.strip() if exc.stderr else ""
            raise ServiceManagerError(stderr or f"launchctl command failed: {' '.join(args)}") from exc


class SystemdUserServiceManager(BaseServiceManager):
    @property
    def service_file(self) -> Path:
        return Path.home() / ".config" / "systemd" / "user" / f"{SERVICE_NAME}.service"

    @property
    def service_unit(self) -> str:
        return f"{SERVICE_NAME}.service"

    def is_installed(self) -> bool:
        return self.service_file.exists()

    def install(self, config: ServiceConfig) -> str:
        self.service_file.parent.mkdir(parents=True, exist_ok=True)
        service_text = "\n".join(
            [
                "[Unit]",
                "Description=lawftune gateway",
                "",
                "[Service]",
                "Type=simple",
                f"WorkingDirectory={config.config_dir}",
                f"ExecStart={shlex.join(config.gateway_run_command())}",
                "Restart=always",
                "RestartSec=5",
                "",
                "[Install]",
                "WantedBy=default.target",
                "",
            ]
        )
        self.service_file.write_text(service_text, encoding="utf-8")
        self._run_command(["systemctl", "--user", "daemon-reload"])
        self._run_command(["systemctl", "--user", "enable", self.service_unit])
        return f"systemd user gateway installed at {self.service_file}"

    def start(self) -> str:
        self._run_command(["systemctl", "--user", "start", self.service_unit])
        return f"systemd user gateway started: {self.service_unit}"

    def stop(self) -> str:
        self._run_command(["systemctl", "--user", "stop", self.service_unit])
        return f"systemd user gateway stopped: {self.service_unit}"

    def status(self) -> str:
        result = self._run_command(
            ["systemctl", "--user", "status", "--no-pager", self.service_unit],
            capture_output=True,
        )
        return result.stdout.strip() or f"systemd user gateway loaded: {self.service_unit}"

    def uninstall(self) -> str:
        try:
            self._run_command(["systemctl", "--user", "disable", self.service_unit])
        except ServiceManagerError:
            pass
        try:
            self.stop()
        except ServiceManagerError:
            pass
        if self.service_file.exists():
            self.service_file.unlink()
        self._run_command(["systemctl", "--user", "daemon-reload"])
        return f"systemd user gateway removed: {self.service_file}"

    def _run_command(
        self,
        args: list[str],
        *,
        capture_output: bool = False,
    ) -> subprocess.CompletedProcess[str]:
        try:
            return subprocess.run(
                args,
                check=True,
                capture_output=capture_output,
                text=True,
            )
        except FileNotFoundError as exc:
            raise ServiceManagerError("`systemctl` is not available on this system.") from exc
        except subprocess.CalledProcessError as exc:
            stderr = exc.stderr.strip() if exc.stderr else ""
            raise ServiceManagerError(stderr or f"systemctl command failed: {' '.join(args)}") from exc


class WindowsTaskServiceManager(BaseServiceManager):
    @property
    def task_name(self) -> str:
        return SERVICE_NAME

    def is_installed(self) -> bool:
        try:
            self._run_command(["schtasks", "/query", "/tn", self.task_name])
        except ServiceManagerError:
            return False
        return True

    def install(self, config: ServiceConfig) -> str:
        command = subprocess.list2cmdline(config.gateway_run_command())
        self._run_command(
            [
                "schtasks",
                "/create",
                "/f",
                "/tn",
                self.task_name,
                "/sc",
                "onlogon",
                "/tr",
                command,
            ]
        )
        return f"Windows scheduled task installed for gateway: {self.task_name}"

    def start(self) -> str:
        self._run_command(["schtasks", "/run", "/tn", self.task_name])
        return f"Windows scheduled task started for gateway: {self.task_name}"

    def stop(self) -> str:
        self._run_command(["schtasks", "/end", "/tn", self.task_name])
        return f"Windows scheduled task stopped for gateway: {self.task_name}"

    def status(self) -> str:
        result = self._run_command(
            ["schtasks", "/query", "/tn", self.task_name, "/fo", "list"],
            capture_output=True,
        )
        return result.stdout.strip() or f"Windows scheduled task installed for gateway: {self.task_name}"

    def uninstall(self) -> str:
        self._run_command(["schtasks", "/delete", "/tn", self.task_name, "/f"])
        return f"Windows scheduled task removed for gateway: {self.task_name}"

    def _run_command(
        self,
        args: list[str],
        *,
        capture_output: bool = False,
    ) -> subprocess.CompletedProcess[str]:
        try:
            return subprocess.run(
                args,
                check=True,
                capture_output=capture_output,
                text=True,
            )
        except FileNotFoundError as exc:
            raise ServiceManagerError("`schtasks` is not available on this system.") from exc
        except subprocess.CalledProcessError as exc:
            stderr = exc.stderr.strip() if exc.stderr else ""
            raise ServiceManagerError(stderr or f"Task Scheduler command failed: {' '.join(args)}") from exc


def get_service_manager(system_name: str | None = None) -> BaseServiceManager:
    resolved_system = system_name or platform.system()
    if resolved_system == "Darwin":
        return LaunchdServiceManager()
    if resolved_system == "Linux":
        return SystemdUserServiceManager()
    if resolved_system == "Windows":
        return WindowsTaskServiceManager()
    raise ServiceManagerError(
        f"Unsupported platform: {resolved_system}. Supported platforms are macOS, Linux, and Windows."
    )


def build_service_config(
    *,
    host: str,
    port: int,
    config_dir: Path,
    python_executable: str | None = None,
) -> ServiceConfig:
    return ServiceConfig(
        host=host,
        port=port,
        config_dir=config_dir,
        python_executable=python_executable or sys.executable,
    )
