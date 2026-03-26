from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path
import unittest
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from lawftrack.api import tokenizer_service  # noqa: E402

sys.path.pop(0)


class FakeTokenizer:
    _encodings = {
        "Hello world": [1, 2],
        "Hello": [1],
        " world": [2],
        " there!": [3, 4],
    }
    _decoded = {
        1: "Hello",
        2: " world",
        3: " there",
        4: "!",
    }

    def __call__(self, text, add_special_tokens=False):
        if text not in self._encodings:
            raise AssertionError(text)
        return {"input_ids": list(self._encodings[text])}

    def decode(self, input_ids, clean_up_tokenization_spaces=False):
        return "".join(self._decoded[int(token_id)] for token_id in input_ids)


class TokenizerServiceTests(unittest.TestCase):
    def tearDown(self) -> None:
        tokenizer_service.load_tokenizer.cache_clear()
        tokenizer_service.load_model_config.cache_clear()

    def test_build_continuation_prefix_preserves_leading_space(self) -> None:
        with mock.patch.object(tokenizer_service, "load_tokenizer", return_value=FakeTokenizer()):
            prefix, original_token, replacement_token = tokenizer_service.build_continuation_prefix(
                model="demo-model",
                text="Hello world",
                token_index=1,
                replacement_text=" world",
            )

        self.assertEqual(prefix, "Hello world")
        self.assertEqual(original_token, " world")
        self.assertEqual(replacement_token, " world")

    def test_build_continuation_prefix_allows_multi_token_replacement(self) -> None:
        with mock.patch.object(tokenizer_service, "load_tokenizer", return_value=FakeTokenizer()):
            prefix, original_token, replacement_token = tokenizer_service.build_continuation_prefix(
                model="demo-model",
                text="Hello",
                token_index=0,
                replacement_text=" there!",
            )

        self.assertEqual(prefix, " there!")
        self.assertEqual(original_token, "Hello")
        self.assertEqual(replacement_token, " there!")

    def test_load_tokenizer_prefers_models_dir_nested_candidate(self) -> None:
        class FakeAutoTokenizer:
            called_with: list[tuple[str, bool]] = []

            @classmethod
            def from_pretrained(cls, model_name: str, use_fast: bool = False):
                cls.called_with.append((model_name, use_fast))
                return mock.Mock(is_fast=True)

        with tempfile.TemporaryDirectory() as temp_dir:
            config_dir = Path(temp_dir)
            models_dir = config_dir / "models"
            model_dir = models_dir / "Qwen" / "Qwen3.5-27B"
            model_dir.mkdir(parents=True)
            (model_dir / "config.json").write_text("{}", encoding="utf-8")
            (config_dir / "config.json").write_text(
                json.dumps({"models_dir": str(models_dir)}),
                encoding="utf-8",
            )

            with mock.patch.object(
                tokenizer_service,
                "_import_auto_tokenizer",
                return_value=FakeAutoTokenizer,
            ):
                tokenizer_service.load_tokenizer(
                    "Qwen/Qwen3.5-27B",
                    config_dir=config_dir,
                )

        self.assertEqual(
            FakeAutoTokenizer.called_with,
            [(str(model_dir), True)],
        )

    def test_load_tokenizer_prefers_models_dir_basename_candidate(self) -> None:
        class FakeAutoTokenizer:
            called_with: list[tuple[str, bool]] = []

            @classmethod
            def from_pretrained(cls, model_name: str, use_fast: bool = False):
                cls.called_with.append((model_name, use_fast))
                return mock.Mock(is_fast=True)

        with tempfile.TemporaryDirectory() as temp_dir:
            config_dir = Path(temp_dir)
            models_dir = config_dir / "models"
            model_dir = models_dir / "Qwen3.5-27B"
            model_dir.mkdir(parents=True)
            (model_dir / "config.json").write_text("{}", encoding="utf-8")
            (config_dir / "config.json").write_text(
                json.dumps({"models_dir": str(models_dir)}),
                encoding="utf-8",
            )

            with mock.patch.object(
                tokenizer_service,
                "_import_auto_tokenizer",
                return_value=FakeAutoTokenizer,
            ):
                tokenizer_service.load_tokenizer(
                    "Qwen/Qwen3.5-27B",
                    config_dir=config_dir,
                )

        self.assertEqual(
            FakeAutoTokenizer.called_with,
            [(str(model_dir), True)],
        )

    def test_get_model_max_position_embeddings_reads_model_config(self) -> None:
        fake_config = mock.Mock(max_position_embeddings=40960)

        with mock.patch.object(
            tokenizer_service,
            "load_model_config",
            return_value=fake_config,
        ):
            self.assertEqual(
                tokenizer_service.get_model_max_position_embeddings(model="demo-model"),
                40960,
            )

    def test_get_model_max_position_embeddings_ignores_invalid_values(self) -> None:
        fake_config = mock.Mock(max_position_embeddings="40960")

        with mock.patch.object(
            tokenizer_service,
            "load_model_config",
            return_value=fake_config,
        ):
            self.assertIsNone(
                tokenizer_service.get_model_max_position_embeddings(model="demo-model")
            )


if __name__ == "__main__":
    unittest.main()
