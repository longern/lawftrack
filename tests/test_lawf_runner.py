from __future__ import annotations

import json
import os
import io
import sys
import tempfile
from contextlib import redirect_stderr
from pathlib import Path
import unittest
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from lawftrack.api.files_store import FileStore  # noqa: E402
from lawftrack.train.algorithms import run_lawf_job  # noqa: E402
from lawftrack.train.lawf_runner import run_lawf_training  # noqa: E402

sys.path.pop(0)


class LAwFRunnerTests(unittest.TestCase):
    def test_run_lawf_job_delegates_to_lawf_runner(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            job = {"id": "ftjob-lawf-123", "model": "demo-model", "training_file": "file-123"}
            with mock.patch(
                "lawftrack.train.lawf_runner.run_lawf_training"
            ) as mocked_runner:
                exit_code = run_lawf_job(job, Path(temp_dir))

        self.assertEqual(exit_code, 0)
        mocked_runner.assert_called_once_with(job, Path(temp_dir))

    def test_run_lawf_job_writes_full_traceback_to_stderr(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            job = {"id": "ftjob-lawf-err", "model": "demo-model", "training_file": "file-123"}
            stderr_buffer = io.StringIO()
            with mock.patch(
                "lawftrack.train.lawf_runner.run_lawf_training",
                side_effect=ValueError("boom"),
            ):
                with redirect_stderr(stderr_buffer):
                    exit_code = run_lawf_job(job, Path(temp_dir))

        self.assertEqual(exit_code, 1)
        self.assertIn("Traceback", stderr_buffer.getvalue())
        self.assertIn("ValueError: boom", stderr_buffer.getvalue())

    def test_run_lawf_training_uses_uploaded_dataset_records_without_conversion(self) -> None:
        class FakeTorch:
            class cuda:
                @staticmethod
                def is_available() -> bool:
                    return False

                @staticmethod
                def is_bf16_supported() -> bool:
                    return False

        class FakeDataset:
            @staticmethod
            def from_list(records):
                return records

        class FakeTokenizer:
            def __init__(self) -> None:
                self.pad_token = None
                self.eos_token = "</s>"
                self.saved_paths: list[str] = []

            def save_pretrained(self, path: str) -> None:
                self.saved_paths.append(path)

        class FakeAutoTokenizer:
            last_tokenizer: FakeTokenizer | None = None
            last_model_name: str | None = None

            @classmethod
            def from_pretrained(cls, model_name: str) -> FakeTokenizer:
                cls.last_model_name = model_name
                cls.last_tokenizer = FakeTokenizer()
                return cls.last_tokenizer

        class FakeTrainingArguments:
            def __init__(self, **kwargs) -> None:
                self.kwargs = kwargs

        class FakeLoraConfig:
            def __init__(self, **kwargs) -> None:
                self.kwargs = kwargs

        class FakeTaskType:
            CAUSAL_LM = "CAUSAL_LM"

        class FakeTrainer:
            last_instance: FakeTrainer | None = None

            def __init__(self, **kwargs) -> None:
                self.kwargs = kwargs
                self.trained = False
                self.state_saved = False
                self.saved_model_paths: list[str] = []
                FakeTrainer.last_instance = self

            def train(self) -> None:
                self.trained = True

            def save_state(self) -> None:
                self.state_saved = True

            def save_model(self, path: str) -> None:
                self.saved_model_paths.append(path)

        train_records = [
            {
                "prompt": "Question:",
                "completion": "Answer",
                "anchors": [{"token_index": 0, "confidence": 0.9}],
            }
        ]
        valid_records = [
            {
                "prompt": [{"role": "user", "content": "Hi"}],
                "completion": [{"role": "assistant", "content": "Hello"}],
                "anchors": [{"token_index": 0}],
            }
        ]

        with tempfile.TemporaryDirectory() as temp_dir:
            config_dir = Path(temp_dir)
            models_dir = config_dir / "models"
            local_model_dir = models_dir / "demo-model"
            local_model_dir.mkdir(parents=True)
            (local_model_dir / "config.json").write_text("{}", encoding="utf-8")
            (config_dir / "config.json").write_text(
                json.dumps({"models_dir": str(models_dir)}),
                encoding="utf-8",
            )
            file_store = FileStore(config_dir)
            training_file = file_store.create_file(
                filename="train.jsonl",
                purpose="fine-tune",
                content="\n".join(json.dumps(item) for item in train_records).encode("utf-8"),
                content_type="application/jsonl",
            )
            validation_file = file_store.create_file(
                filename="valid.jsonl",
                purpose="fine-tune",
                content=json.dumps(valid_records).encode("utf-8"),
                content_type="application/json",
            )

            job = {
                "id": "ftjob-lawf-456",
                "model": "demo-model",
                "training_file": training_file["id"],
                "validation_file": validation_file["id"],
                "integrations": [{"type": "tensorboard"}],
                "method": {
                    "type": "lawf",
                    "lawf": {"hyperparameters": {"n_epochs": 2, "batch_size": 4}},
                },
            }

            with mock.patch(
                "lawftrack.train.lawf_runner._load_dependencies",
                return_value={
                    "torch": FakeTorch,
                    "Dataset": FakeDataset,
                    "LoraConfig": FakeLoraConfig,
                    "TaskType": FakeTaskType,
                    "AutoTokenizer": FakeAutoTokenizer,
                    "TrainingArguments": FakeTrainingArguments,
                    "LAwFTrainer": FakeTrainer,
                },
            ):
                run_lawf_training(job, config_dir)

            self.assertIsNotNone(FakeTrainer.last_instance)
            trainer = FakeTrainer.last_instance
            self.assertEqual(trainer.kwargs["model"], str(local_model_dir))
            self.assertEqual(trainer.kwargs["train_dataset"], train_records)
            self.assertEqual(trainer.kwargs["eval_dataset"], valid_records)
            self.assertTrue(trainer.trained)
            self.assertTrue(trainer.state_saved)
            self.assertEqual(
                trainer.kwargs["peft_config"].kwargs["target_modules"],
                "all-linear",
            )

            output_dir = config_dir / "fine_tuning" / "jobs" / "ftjob-lawf-456" / "artifacts" / "model"
            self.assertEqual(trainer.saved_model_paths, [str(output_dir)])
            self.assertNotIn("logging_dir", trainer.kwargs["args"].kwargs)
            self.assertEqual(trainer.kwargs["args"].kwargs["num_train_epochs"], 2.0)
            self.assertEqual(trainer.kwargs["args"].kwargs["logging_strategy"], "epoch")

            tokenizer = FakeAutoTokenizer.last_tokenizer
            self.assertIsNotNone(tokenizer)
            self.assertEqual(FakeAutoTokenizer.last_model_name, str(local_model_dir))
            self.assertIs(trainer.kwargs["processing_class"], tokenizer)
            self.assertNotIn("tokenizer", trainer.kwargs)
            self.assertEqual(tokenizer.pad_token, "</s>")
            self.assertEqual(tokenizer.saved_paths, [str(output_dir)])

            exported_train_file = config_dir / "fine_tuning" / "jobs" / "ftjob-lawf-456" / "artifacts" / "data" / "train.jsonl"
            self.assertTrue(exported_train_file.exists())
            self.assertNotIn("TENSORBOARD_LOGGING_DIR", os.environ)

    def test_run_lawf_training_defaults_to_more_epochs(self) -> None:
        class FakeTorch:
            class cuda:
                @staticmethod
                def is_available() -> bool:
                    return False

                @staticmethod
                def is_bf16_supported() -> bool:
                    return False

        class FakeDataset:
            @staticmethod
            def from_list(records):
                return records

        class FakeTokenizer:
            def __init__(self) -> None:
                self.pad_token = None
                self.eos_token = "</s>"

            def save_pretrained(self, path: str) -> None:
                return None

        class FakeAutoTokenizer:
            @classmethod
            def from_pretrained(cls, model_name: str) -> FakeTokenizer:
                return FakeTokenizer()

        class FakeTrainingArguments:
            last_kwargs: dict[str, object] | None = None

            def __init__(self, **kwargs) -> None:
                self.kwargs = kwargs
                FakeTrainingArguments.last_kwargs = kwargs

        class FakeLoraConfig:
            def __init__(self, **kwargs) -> None:
                self.kwargs = kwargs

        class FakeTaskType:
            CAUSAL_LM = "CAUSAL_LM"

        class FakeTrainer:
            def __init__(self, **kwargs) -> None:
                self.kwargs = kwargs

            def train(self) -> None:
                return None

            def save_model(self, path: str) -> None:
                return None

        train_records = [{"prompt": "Question:", "completion": "Answer", "anchors": []}]

        with tempfile.TemporaryDirectory() as temp_dir:
            config_dir = Path(temp_dir)
            models_dir = config_dir / "models"
            local_model_dir = models_dir / "demo-model"
            local_model_dir.mkdir(parents=True)
            (local_model_dir / "config.json").write_text("{}", encoding="utf-8")
            (config_dir / "config.json").write_text(
                json.dumps({"models_dir": str(models_dir)}),
                encoding="utf-8",
            )
            file_store = FileStore(config_dir)
            training_file = file_store.create_file(
                filename="train.jsonl",
                purpose="fine-tune",
                content="\n".join(json.dumps(item) for item in train_records).encode("utf-8"),
                content_type="application/jsonl",
            )
            job = {
                "id": "ftjob-lawf-default-epochs",
                "model": "demo-model",
                "training_file": training_file["id"],
                "method": {"type": "lawf", "lawf": {"hyperparameters": {}}},
            }

            with mock.patch(
                "lawftrack.train.lawf_runner._load_dependencies",
                return_value={
                    "torch": FakeTorch,
                    "Dataset": FakeDataset,
                    "LoraConfig": FakeLoraConfig,
                    "TaskType": FakeTaskType,
                    "AutoTokenizer": FakeAutoTokenizer,
                    "TrainingArguments": FakeTrainingArguments,
                    "LAwFTrainer": FakeTrainer,
                },
            ):
                run_lawf_training(job, config_dir)

        self.assertIsNotNone(FakeTrainingArguments.last_kwargs)
        self.assertEqual(FakeTrainingArguments.last_kwargs["num_train_epochs"], 32.0)
        self.assertEqual(FakeTrainingArguments.last_kwargs["logging_strategy"], "epoch")


if __name__ == "__main__":
    unittest.main()
