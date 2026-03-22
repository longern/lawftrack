from __future__ import annotations

import sys
from pathlib import Path
import unittest
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from lawftune.api import tokenizer_service  # noqa: E402

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


if __name__ == "__main__":
    unittest.main()
