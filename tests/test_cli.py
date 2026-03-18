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
                input="\n\nn\nn\n",
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
                    "training": {
                        "local_vllm_sleep": {
                            "enabled": False,
                            "level": 1,
                        }
                    },
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
                input="http://127.0.0.1:9000\nsecret-key\nn\nn\n",
                capture_output=True,
                text=True,
                check=False,
            )

            self.assertEqual(result.returncode, 0)

            config_path = Path(temp_dir) / "config.json"
            self.assertEqual(
                json.loads(config_path.read_text(encoding="utf-8")),
                {
                    "training": {
                        "local_vllm_sleep": {
                            "enabled": False,
                            "level": 1,
                        }
                    },
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
                with mock.patch("builtins.input", side_effect=["", "", "n", "y"]):
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
                with mock.patch("builtins.input", side_effect=["", "", "n", "n"]):
                    exit_code = main(["wizard", "--config-dir", temp_dir])

            self.assertEqual(exit_code, 0)
            mocked_manager.install.assert_not_called()

    def test_wizard_can_enable_local_vllm_sleep_setting(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            from lawftune.cli import main
        finally:
            sys.path.pop(0)

        with tempfile.TemporaryDirectory() as temp_dir:
            with mock.patch("builtins.input", side_effect=["", "", "y", "n"]):
                exit_code = main(["wizard", "--config-dir", temp_dir])

            self.assertEqual(exit_code, 0)
            payload = json.loads(
                (Path(temp_dir) / "config.json").read_text(encoding="utf-8")
            )
            self.assertEqual(
                payload["training"]["local_vllm_sleep"],
                {
                    "enabled": True,
                    "level": 1,
                },
            )

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

    def test_config_set_supports_nested_dot_paths(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            from lawftune.cli import main
        finally:
            sys.path.pop(0)

        with tempfile.TemporaryDirectory() as temp_dir:
            with mock.patch("builtins.print") as mocked_print:
                exit_code = main(
                    ["config", "set", "a.b.c", "xxx", "--config-dir", temp_dir]
                )

            self.assertEqual(exit_code, 0)
            payload = json.loads(
                (Path(temp_dir) / "config.json").read_text(encoding="utf-8")
            )
            self.assertEqual(payload["a"]["b"]["c"], "xxx")
            mocked_print.assert_called_once_with(
                f"Configuration saved to {Path(temp_dir) / 'config.json'}"
            )

    def test_config_get_reads_nested_values(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            from lawftune.cli import main
        finally:
            sys.path.pop(0)

        with tempfile.TemporaryDirectory() as temp_dir:
            (Path(temp_dir) / "config.json").write_text(
                json.dumps({"a": {"b": {"c": 123}}}),
                encoding="utf-8",
            )

            with mock.patch("builtins.print") as mocked_print:
                exit_code = main(
                    ["config", "get", "a.b.c", "--config-dir", temp_dir]
                )

            self.assertEqual(exit_code, 0)
            mocked_print.assert_called_once_with("123")

    def test_config_show_prints_full_merged_config(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            from lawftune.cli import main
        finally:
            sys.path.pop(0)

        with tempfile.TemporaryDirectory() as temp_dir:
            (Path(temp_dir) / "config.json").write_text(
                json.dumps({"nested": {"enabled": True}}),
                encoding="utf-8",
            )

            with mock.patch("builtins.print") as mocked_print:
                exit_code = main(["config", "--config-dir", temp_dir])

            self.assertEqual(exit_code, 0)
            printed = mocked_print.call_args.args[0]
            payload = json.loads(printed)
            self.assertEqual(payload["nested"]["enabled"], True)
            self.assertEqual(payload["vllm_endpoint"], "http://localhost:8000/v1")
            self.assertEqual(payload["api_key"], "")

    def test_save_config_preserves_existing_nested_values(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            from lawftune.config import save_config
        finally:
            sys.path.pop(0)

        with tempfile.TemporaryDirectory() as temp_dir:
            config_path = Path(temp_dir) / "config.json"
            config_path.write_text(
                json.dumps({"nested": {"enabled": True}}),
                encoding="utf-8",
            )

            save_config(
                endpoint="http://127.0.0.1:9000",
                api_key="secret-key",
                config_dir=Path(temp_dir),
            )

            payload = json.loads(config_path.read_text(encoding="utf-8"))
            self.assertEqual(payload["nested"]["enabled"], True)
            self.assertEqual(payload["vllm_endpoint"], "http://127.0.0.1:9000")
            self.assertEqual(payload["api_key"], "secret-key")

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

    def test_build_sft_command_exports_uploaded_training_file(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            from lawftune.api.files_store import FileStore
            from lawftune.train.algorithms import build_sft_command
        finally:
            sys.path.pop(0)

        with tempfile.TemporaryDirectory() as temp_dir:
            file_store = FileStore(Path(temp_dir))
            created_file = file_store.create_file(
                filename="train.jsonl",
                purpose="fine-tune",
                content=b'{"messages": []}\n',
                content_type="application/jsonl",
            )

            command = build_sft_command(
                {
                    "id": "ftjob-123",
                    "model": "Qwen/Qwen2.5-7B-Instruct",
                    "training_file": created_file["id"],
                },
                Path(temp_dir),
            )

            exported_path = Path(temp_dir) / "fine_tuning" / "jobs" / "ftjob-123" / "artifacts" / "data" / "train.jsonl"
            self.assertEqual(command[0:6], ["trl", "sft", "--model_name_or_path", "Qwen/Qwen2.5-7B-Instruct", "--dataset_name", str(exported_path)])
            self.assertTrue(exported_path.exists())
            self.assertEqual(exported_path.read_bytes(), b'{"messages": []}\n')

    def test_build_sft_command_maps_openai_style_n_epochs_hyperparameter(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            from lawftune.api.files_store import FileStore
            from lawftune.train.algorithms import build_sft_command
        finally:
            sys.path.pop(0)

        with tempfile.TemporaryDirectory() as temp_dir:
            file_store = FileStore(Path(temp_dir))
            created_file = file_store.create_file(
                filename="train.jsonl",
                purpose="fine-tune",
                content=b'{"messages": []}\n',
                content_type="application/jsonl",
            )

            command = build_sft_command(
                {
                    "id": "ftjob-124",
                    "model": "Qwen/Qwen2.5-7B-Instruct",
                    "training_file": created_file["id"],
                    "method": {
                        "type": "supervised",
                        "supervised": {
                            "hyperparameters": {
                                "n_epochs": 3,
                            }
                        },
                    },
                },
                Path(temp_dir),
            )

            self.assertIn("--num_train_epochs", command)
            self.assertEqual(command[command.index("--num_train_epochs") + 1], "3")

    def test_train_worker_marks_success_and_loads_lora_adapter(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            from lawftune.train.cli import main
            from lawftune.vllm import RuntimeLoRAUpdateResult
        finally:
            sys.path.pop(0)

        with tempfile.TemporaryDirectory() as temp_dir:
            config_dir = Path(temp_dir)
            job_dir = config_dir / "fine_tuning" / "jobs" / "ftjob-789"
            output_dir = job_dir / "artifacts" / "model"
            output_dir.mkdir(parents=True)
            (output_dir / "adapter_config.json").write_text("{}", encoding="utf-8")
            (config_dir / "config.json").write_text(
                json.dumps(
                    {
                        "vllm_endpoint": "http://localhost:8000/v1",
                        "api_key": "secret-key",
                    }
                ),
                encoding="utf-8",
            )
            (job_dir / "job.json").write_text(
                json.dumps(
                    {
                        "id": "ftjob-789",
                        "model": "Qwen/Qwen2.5-7B-Instruct",
                        "training_file": "dataset-name",
                        "suffix": "Legal Draft",
                        "method": {"type": "sft"},
                        "status": "running",
                        "process": {"pid": 1234, "started_at": 1, "exit_code": None},
                    }
                ),
                encoding="utf-8",
            )

            with mock.patch(
                "lawftune.train.cli.run_algorithm_job", return_value=0
            ) as mocked_run:
                with mock.patch(
                    "lawftune.train.cli.load_lora_adapter",
                    return_value=RuntimeLoRAUpdateResult(
                        ok=True,
                        status_code=200,
                        message="ok",
                        response_body="Success",
                    ),
                ) as mocked_load:
                    exit_code = main(
                        ["run-job", "--config-dir", temp_dir, "--job-id", "ftjob-789"]
                    )

            self.assertEqual(exit_code, 0)
            mocked_run.assert_called_once()
            mocked_load.assert_called_once_with(
                base_url="http://localhost:8000/v1",
                api_key="secret-key",
                lora_name="legal-draft",
                lora_path=output_dir,
                load_inplace=True,
            )

            job_payload = json.loads((job_dir / "job.json").read_text(encoding="utf-8"))
            self.assertEqual(job_payload["status"], "succeeded")
            self.assertEqual(job_payload["fine_tuned_model"], "legal-draft")
            self.assertEqual(job_payload["process"]["exit_code"], 0)
            self.assertEqual(job_payload["lora_adapter"]["status"], "loaded")
            self.assertEqual(job_payload["lora_adapter"]["path"], str(output_dir))

    def test_train_worker_marks_failed_when_training_command_fails(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            from lawftune.train.cli import main
        finally:
            sys.path.pop(0)

        with tempfile.TemporaryDirectory() as temp_dir:
            job_dir = Path(temp_dir) / "fine_tuning" / "jobs" / "ftjob-999"
            job_dir.mkdir(parents=True)
            (job_dir / "job.json").write_text(
                json.dumps(
                    {
                        "id": "ftjob-999",
                        "model": "Qwen/Qwen2.5-7B-Instruct",
                        "training_file": "dataset-name",
                        "method": {"type": "sft"},
                        "status": "running",
                        "process": {"pid": 1234, "started_at": 1, "exit_code": None},
                    }
                ),
                encoding="utf-8",
            )

            with mock.patch(
                "lawftune.train.cli.run_algorithm_job", return_value=7
            ) as mocked_run:
                exit_code = main(["--config-dir", temp_dir, "--job-id", "ftjob-999"])

            self.assertEqual(exit_code, 7)
            mocked_run.assert_called_once()

            job_payload = json.loads((job_dir / "job.json").read_text(encoding="utf-8"))
            self.assertEqual(job_payload["status"], "failed")
            self.assertEqual(job_payload["process"]["exit_code"], 7)
            self.assertEqual(job_payload["error"]["code"], "training_failed")

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
