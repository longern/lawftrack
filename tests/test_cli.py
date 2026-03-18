from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from unittest import mock
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


def make_env(**extra: str) -> dict[str, str]:
    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT / "src")
    env.update(extra)
    return env


class CliTests(unittest.TestCase):
    def test_module_invocation(self) -> None:
        result = subprocess.run(
            [sys.executable, "-m", "lawftune"],
            cwd=ROOT,
            env=make_env(),
            capture_output=True,
            text=True,
            check=False,
        )

        self.assertEqual(result.returncode, 0)
        self.assertIn("usage: lawftune", result.stdout)
        self.assertIn("wizard", result.stdout)
        self.assertIn("train", result.stdout)
        self.assertIn("update", result.stdout)
        self.assertIn("gateway", result.stdout)

    def test_version_flag(self) -> None:
        result = subprocess.run(
            [sys.executable, "-m", "lawftune", "--version"],
            cwd=ROOT,
            env=make_env(),
            capture_output=True,
            text=True,
            check=False,
        )

        self.assertEqual(result.returncode, 0)
        self.assertIn("lawftune 0.1.0", result.stdout)

    def test_wizard_uses_defaults(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            result = subprocess.run(
                [sys.executable, "-m", "lawftune", "wizard"],
                cwd=ROOT,
                env=make_env(LAWFTUNE_HOME=temp_dir),
                input="\n\nn\n",
                capture_output=True,
                text=True,
                check=False,
            )

            self.assertEqual(result.returncode, 0)
            self.assertIn("Configuration saved to", result.stdout)

            config_path = Path(temp_dir) / "config.json"
            self.assertTrue(config_path.exists())
            self.assertEqual(
                json.loads(config_path.read_text(encoding="utf-8")),
                {
                    "vllm_endpoint": "http://localhost:8000/v1",
                    "api_key": "",
                },
            )

    def test_wizard_accepts_custom_values(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            result = subprocess.run(
                [sys.executable, "-m", "lawftune", "wizard"],
                cwd=ROOT,
                env=make_env(LAWFTUNE_HOME=temp_dir),
                input="http://127.0.0.1:9000\nsecret-key\nn\n",
                capture_output=True,
                text=True,
                check=False,
            )

            self.assertEqual(result.returncode, 0)

            config_path = Path(temp_dir) / "config.json"
            self.assertEqual(
                json.loads(config_path.read_text(encoding="utf-8")),
                {
                    "vllm_endpoint": "http://127.0.0.1:9000",
                    "api_key": "secret-key",
                },
            )

    def test_wizard_can_install_gateway_service(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            from lawftune.cli import main
        finally:
            sys.path.pop(0)

        with tempfile.TemporaryDirectory() as temp_dir:
            mocked_manager = mock.Mock()
            mocked_manager.install.return_value = "gateway installed"

            with mock.patch(
                "lawftune.cli.get_service_manager", return_value=mocked_manager
            ):
                with mock.patch("builtins.input", side_effect=["", "", "y"]):
                    with mock.patch("builtins.print") as mocked_print:
                        exit_code = main(["wizard", "--config-dir", temp_dir])

            self.assertEqual(exit_code, 0)
            mocked_manager.install.assert_called_once()
            service_config = mocked_manager.install.call_args.args[0]
            self.assertEqual(service_config.host, "127.0.0.1")
            self.assertEqual(service_config.port, 5293)
            self.assertEqual(service_config.config_dir, Path(temp_dir))
            self.assertEqual(
                mocked_print.call_args_list,
                [
                    mock.call(
                        f"Configuration saved to {Path(temp_dir) / 'config.json'}"
                    ),
                    mock.call("gateway installed"),
                    mock.call("Gateway URL: http://127.0.0.1:5293"),
                ],
            )

    def test_wizard_skips_gateway_service_when_declined(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            from lawftune.cli import main
        finally:
            sys.path.pop(0)

        with tempfile.TemporaryDirectory() as temp_dir:
            mocked_manager = mock.Mock()

            with mock.patch(
                "lawftune.cli.get_service_manager", return_value=mocked_manager
            ):
                with mock.patch("builtins.input", side_effect=["", "", "n"]):
                    exit_code = main(["wizard", "--config-dir", temp_dir])

            self.assertEqual(exit_code, 0)
            mocked_manager.install.assert_not_called()

    def test_gateway_without_action_starts_uvicorn_with_expected_arguments(
        self,
    ) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            from lawftune.cli import main
        finally:
            sys.path.pop(0)

        with tempfile.TemporaryDirectory() as temp_dir:
            with mock.patch("uvicorn.run") as mocked_run:
                exit_code = main(
                    [
                        "gateway",
                        "--host",
                        "0.0.0.0",
                        "--port",
                        "9001",
                        "--config-dir",
                        temp_dir,
                    ]
                )

            self.assertEqual(exit_code, 0)
            mocked_run.assert_called_once()
            _, kwargs = mocked_run.call_args
            self.assertEqual(kwargs["host"], "0.0.0.0")
            self.assertEqual(kwargs["port"], 9001)

    def test_gateway_run_explicit_action_still_works(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            from lawftune.cli import main
        finally:
            sys.path.pop(0)

        with tempfile.TemporaryDirectory() as temp_dir:
            with mock.patch("uvicorn.run") as mocked_run:
                exit_code = main(["gateway", "run", "--config-dir", temp_dir])

            self.assertEqual(exit_code, 0)
            mocked_run.assert_called_once()

    def test_gateway_help(self) -> None:
        result = subprocess.run(
            [sys.executable, "-m", "lawftune", "gateway", "--help"],
            cwd=ROOT,
            env=make_env(),
            capture_output=True,
            text=True,
            check=False,
        )

        self.assertEqual(result.returncode, 0)
        self.assertIn("Run or manage the lawftune gateway.", result.stdout)

    def test_train_command_dispatches_to_worker(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            from lawftune.cli import main
        finally:
            sys.path.pop(0)

        with tempfile.TemporaryDirectory() as temp_dir:
            with mock.patch(
                "lawftune.train.cli.run_train_worker", return_value=0
            ) as mocked_run:
                exit_code = main(
                    ["train", "--config-dir", temp_dir, "--job-id", "ftjob-123"]
                )

        self.assertEqual(exit_code, 0)
        mocked_run.assert_called_once()
        args = mocked_run.call_args.args[0]
        self.assertEqual(args.config_dir, Path(temp_dir))
        self.assertEqual(args.job_id, "ftjob-123")

    def test_train_module_help(self) -> None:
        result = subprocess.run(
            [sys.executable, "-m", "lawftune.train", "--help"],
            cwd=ROOT,
            env=make_env(),
            capture_output=True,
            text=True,
            check=False,
        )

        self.assertEqual(result.returncode, 0)
        self.assertIn("Run a lawftune training worker.", result.stdout)

    def test_update_command_dispatches_to_updater(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            from lawftune.cli import main
        finally:
            sys.path.pop(0)

        with mock.patch("lawftune.update.run_update", return_value=0) as mocked_run:
            exit_code = main(["update", "/tmp/lawftune-src", "--dry-run", "--yes"])

        self.assertEqual(exit_code, 0)
        mocked_run.assert_called_once_with(
            "/tmp/lawftune-src", dry_run=True, assume_yes=True
        )

    def test_train_worker_dispatches_to_normalized_method(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            from lawftune.train.cli import main
        finally:
            sys.path.pop(0)

        with tempfile.TemporaryDirectory() as temp_dir:
            job_dir = Path(temp_dir) / "fine_tuning" / "jobs" / "ftjob-123"
            job_dir.mkdir(parents=True)
            (job_dir / "job.json").write_text(
                json.dumps(
                    {
                        "id": "ftjob-123",
                        "model": "Qwen/Qwen2.5-7B-Instruct",
                        "training_file": "dataset-name",
                        "method": {"type": "supervised"},
                    }
                ),
                encoding="utf-8",
            )

            with mock.patch(
                "lawftune.train.cli.run_algorithm_job", return_value=0
            ) as mocked_run:
                exit_code = main(["--config-dir", temp_dir, "--job-id", "ftjob-123"])

        self.assertEqual(exit_code, 0)
        mocked_run.assert_called_once()
        self.assertEqual(mocked_run.call_args.args[0], "sft")

    def test_train_worker_can_run_explicit_lawf_action(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            from lawftune.train.cli import main
        finally:
            sys.path.pop(0)

        with tempfile.TemporaryDirectory() as temp_dir:
            job_dir = Path(temp_dir) / "fine_tuning" / "jobs" / "ftjob-456"
            job_dir.mkdir(parents=True)
            (job_dir / "job.json").write_text(
                json.dumps(
                    {
                        "id": "ftjob-456",
                        "model": "Qwen/Qwen2.5-7B-Instruct",
                        "training_file": "dataset-name",
                        "method": {"type": "lawf"},
                    }
                ),
                encoding="utf-8",
            )

            with mock.patch(
                "lawftune.train.cli.run_algorithm_job", return_value=0
            ) as mocked_run:
                exit_code = main(
                    ["lawf", "--config-dir", temp_dir, "--job-id", "ftjob-456"]
                )

        self.assertEqual(exit_code, 0)
        mocked_run.assert_called_once()
        self.assertEqual(mocked_run.call_args.args[0], "lawf")

    def test_gateway_install_dispatches_to_service_manager(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            from lawftune.cli import main
        finally:
            sys.path.pop(0)

        with tempfile.TemporaryDirectory() as temp_dir:
            mocked_manager = mock.Mock()
            mocked_manager.install.return_value = "installed"

            with mock.patch(
                "lawftune.cli.get_service_manager", return_value=mocked_manager
            ):
                with mock.patch("builtins.print") as mocked_print:
                    exit_code = main(
                        [
                            "gateway",
                            "install",
                            "--host",
                            "0.0.0.0",
                            "--port",
                            "9002",
                            "--config-dir",
                            temp_dir,
                        ]
                    )

            self.assertEqual(exit_code, 0)
            mocked_manager.install.assert_called_once()
            _, kwargs = mocked_manager.install.call_args
            self.assertEqual(kwargs, {})
            service_config = mocked_manager.install.call_args.args[0]
            self.assertEqual(service_config.host, "0.0.0.0")
            self.assertEqual(service_config.port, 9002)
            self.assertEqual(service_config.config_dir, Path(temp_dir))
            self.assertEqual(
                mocked_print.call_args_list,
                [
                    mock.call("installed"),
                    mock.call("Gateway URL: http://localhost:9002"),
                ],
            )

    def test_gateway_status_dispatches_to_service_manager(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            from lawftune.cli import main
        finally:
            sys.path.pop(0)

        mocked_manager = mock.Mock()
        mocked_manager.status.return_value = "running"

        with mock.patch(
            "lawftune.cli.get_service_manager", return_value=mocked_manager
        ):
            with mock.patch("builtins.print") as mocked_print:
                exit_code = main(["gateway", "status"])

        self.assertEqual(exit_code, 0)
        mocked_manager.status.assert_called_once_with()
        mocked_print.assert_called_once_with("running")

    def test_gateway_action_help(self) -> None:
        result = subprocess.run(
            [sys.executable, "-m", "lawftune", "gateway", "--help"],
            cwd=ROOT,
            env=make_env(),
            capture_output=True,
            text=True,
            check=False,
        )

        self.assertEqual(result.returncode, 0)
        self.assertIn("Run or manage the lawftune gateway.", result.stdout)


if __name__ == "__main__":
    unittest.main()
