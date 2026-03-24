from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path
import unittest
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]


class UpdateTests(unittest.TestCase):
    def test_resolve_update_target_for_local_directory(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            from lawftrack.update import resolve_update_target
        finally:
            sys.path.pop(0)

        with tempfile.TemporaryDirectory() as temp_dir:
            target = resolve_update_target(temp_dir)

        self.assertEqual(target, f"{Path(temp_dir).resolve()}[server]")

    def test_resolve_update_target_for_git_repository(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            from lawftrack.update import resolve_update_target
        finally:
            sys.path.pop(0)

        target = resolve_update_target("https://github.com/longern/LAwF.git")

        self.assertEqual(target, "lawftrack[server] @ git+https://github.com/longern/LAwF.git")

    def test_infer_update_target_from_editable_install_metadata(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            import lawftrack.update as update_module
        finally:
            sys.path.pop(0)

        class DummyDistribution:
            def read_text(self, filename: str) -> str:
                self.filename = filename
                return json.dumps(
                    {
                        "url": "file:///Users/demo/workspace/lawftrack",
                        "dir_info": {"editable": True},
                    }
                )

        with mock.patch.object(update_module.metadata, "distribution", return_value=DummyDistribution()):
            target = update_module.infer_update_target()

        self.assertEqual(target, "/Users/demo/workspace/lawftrack[server]")

    def test_build_update_command_uses_default_source_when_none_is_given(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            import lawftrack.update as update_module
        finally:
            sys.path.pop(0)

        with mock.patch.object(update_module, "infer_update_target", return_value="lawftrack[server]"):
            command = update_module.build_update_command(None)

        self.assertEqual(command[-1], "lawftrack[server]")

    def test_maybe_restart_gateway_prompts_when_service_is_installed(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            import lawftrack.update as update_module
        finally:
            sys.path.pop(0)

        manager = mock.Mock()
        manager.is_installed.return_value = True
        manager.restart.return_value = "gateway restarted"

        with mock.patch.object(update_module, "get_service_manager", return_value=manager):
            with mock.patch.object(update_module, "prompt_yes_no", return_value=True) as mocked_prompt:
                with mock.patch("builtins.print") as mocked_print:
                    update_module.maybe_restart_gateway()

        mocked_prompt.assert_called_once_with("Restart the gateway now?", default=False)
        manager.restart.assert_called_once_with()
        mocked_print.assert_any_call("A gateway system service is installed.")
        mocked_print.assert_any_call("gateway restarted")

    def test_maybe_restart_gateway_prints_manual_restart_when_service_is_not_installed(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            import lawftrack.update as update_module
        finally:
            sys.path.pop(0)

        manager = mock.Mock()
        manager.is_installed.return_value = False

        with mock.patch.object(update_module, "get_service_manager", return_value=manager):
            with mock.patch("builtins.print") as mocked_print:
                update_module.maybe_restart_gateway()

        mocked_print.assert_any_call("If the gateway is running, restart it to load the updated version:")
        mocked_print.assert_any_call("lawftrack gateway restart")
