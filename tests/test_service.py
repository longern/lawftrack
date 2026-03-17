from __future__ import annotations

import plistlib
import sys
import tempfile
from pathlib import Path
import unittest
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from lawftune.service import (  # noqa: E402
    LaunchdServiceManager,
    SystemdUserServiceManager,
    WindowsTaskServiceManager,
    build_service_config,
    get_service_manager,
)

sys.path.pop(0)


class ServiceManagerTests(unittest.TestCase):
    def test_build_service_config_uses_python_executable(self) -> None:
        config = build_service_config(
            host="127.0.0.1",
            port=5293,
            config_dir=Path("/tmp/lawftune"),
            python_executable="/usr/bin/python3",
        )

        self.assertEqual(
            config.gateway_run_command(),
            [
                "/usr/bin/python3",
                "-m",
                "lawftune",
                "gateway",
                "run",
                "--host",
                "127.0.0.1",
                "--port",
                "5293",
                "--config-dir",
                "/tmp/lawftune",
            ],
        )

    def test_get_service_manager_selects_platform_backend(self) -> None:
        self.assertIsInstance(get_service_manager("Darwin"), LaunchdServiceManager)
        self.assertIsInstance(get_service_manager("Linux"), SystemdUserServiceManager)
        self.assertIsInstance(get_service_manager("Windows"), WindowsTaskServiceManager)

    def test_launchd_install_writes_plist(self) -> None:
        manager = LaunchdServiceManager()
        config = build_service_config(
            host="127.0.0.1",
            port=5293,
            config_dir=Path("/tmp/lawftune-config"),
            python_executable="/usr/bin/python3",
        )

        with tempfile.TemporaryDirectory() as temp_home:
            with mock.patch("pathlib.Path.home", return_value=Path(temp_home)):
                message = manager.install(config)

                plist_path = Path(temp_home) / "Library" / "LaunchAgents" / "io.lawftune.gateway.plist"
                self.assertEqual(message, f"launchd gateway definition written to {plist_path}")
                self.assertTrue(plist_path.exists())

                with plist_path.open("rb") as handle:
                    payload = plistlib.load(handle)

                self.assertEqual(payload["Label"], "io.lawftune.gateway")
                self.assertEqual(
                    payload["ProgramArguments"],
                    [
                        "/usr/bin/python3",
                        "-m",
                        "lawftune",
                        "gateway",
                        "run",
                        "--host",
                        "127.0.0.1",
                        "--port",
                        "5293",
                        "--config-dir",
                        "/tmp/lawftune-config",
                    ],
                )

    def test_systemd_install_writes_service_file(self) -> None:
        manager = SystemdUserServiceManager()
        config = build_service_config(
            host="127.0.0.1",
            port=5293,
            config_dir=Path("/tmp/lawftune-config"),
            python_executable="/usr/bin/python3",
        )

        with tempfile.TemporaryDirectory() as temp_home:
            with mock.patch("pathlib.Path.home", return_value=Path(temp_home)):
                with mock.patch.object(manager, "_run_command") as mocked_command:
                    message = manager.install(config)

                service_path = Path(temp_home) / ".config" / "systemd" / "user" / "lawftune-gateway.service"
                self.assertEqual(message, f"systemd user gateway installed at {service_path}")
                self.assertTrue(service_path.exists())
                self.assertIn("ExecStart=/usr/bin/python3 -m lawftune gateway run", service_path.read_text(encoding="utf-8"))
                self.assertEqual(mocked_command.call_count, 2)

    def test_windows_install_uses_schtasks(self) -> None:
        manager = WindowsTaskServiceManager()
        config = build_service_config(
            host="127.0.0.1",
            port=5293,
            config_dir=Path("C:/lawftune"),
            python_executable="C:/Python/python.exe",
        )

        with mock.patch.object(manager, "_run_command") as mocked_command:
            message = manager.install(config)

        self.assertEqual(message, "Windows scheduled task installed for gateway: lawftune-gateway")
        mocked_command.assert_called_once()
        command = mocked_command.call_args.args[0]
        self.assertEqual(command[:6], ["schtasks", "/create", "/f", "/tn", "lawftune-gateway", "/sc"])


if __name__ == "__main__":
    unittest.main()
