from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path
import unittest
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from lawftune.api.files_store import FileStore  # noqa: E402
from lawftune.train.algorithms import run_lawf_job  # noqa: E402
from lawftune.train.lawf_runner import run_lawf_training  # noqa: E402

sys.path.pop(0)


class LAwFRunnerTests(unittest.TestCase):
    def test_run_lawf_job_delegates_to_lawf_runner(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            job = {"id": "ftjob-lawf-123", "model": "demo-model", "training_file": "file-123"}
            with mock.patch(
                "lawftune.train.lawf_runner.run_lawf_training"
            ) as mocked_runner:
                exit_code = run_lawf_job(job, Path(temp_dir))

        self.assertEqual(exit_code, 0)
        mocked_runner.assert_called_once_with(job, Path(temp_dir))

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

            @classmethod
            def from_pretrained(cls, model_name: str) -> FakeTokenizer:
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
                self.saved_model_paths: list[str] = []
                FakeTrainer.last_instance = self

            def train(self) -> None:
                self.trained = True

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
                "lawftune.train.lawf_runner._load_dependencies",
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
            self.assertEqual(trainer.kwargs["model"], "demo-model")
            self.assertEqual(trainer.kwargs["train_dataset"], train_records)
            self.assertEqual(trainer.kwargs["eval_dataset"], valid_records)
            self.assertTrue(trainer.trained)

            output_dir = config_dir / "fine_tuning" / "jobs" / "ftjob-lawf-456" / "artifacts" / "model"
            self.assertEqual(trainer.saved_model_paths, [str(output_dir)])

            tokenizer = FakeAutoTokenizer.last_tokenizer
            self.assertIsNotNone(tokenizer)
            self.assertEqual(tokenizer.pad_token, "</s>")
            self.assertEqual(tokenizer.saved_paths, [str(output_dir)])

            exported_train_file = config_dir / "fine_tuning" / "jobs" / "ftjob-lawf-456" / "artifacts" / "data" / "train.jsonl"
            self.assertTrue(exported_train_file.exists())


if __name__ == "__main__":
    unittest.main()
