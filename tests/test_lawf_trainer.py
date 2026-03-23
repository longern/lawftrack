from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


@unittest.skipUnless(
    importlib.util.find_spec("torch")
    and importlib.util.find_spec("trl")
    and importlib.util.find_spec("transformers"),
    "LAwF trainer dependencies are not installed",
)
class LAwFTrainerTests(unittest.TestCase):
    def test_data_collator_accepts_conversational_prompt_and_completion_lists(self) -> None:
        sys.path.insert(0, str(ROOT / "src"))
        try:
            import torch
            from lawftune.train.lawf_trainer import LAwFDataCollator
        finally:
            sys.path.pop(0)

        class FakeTokenizer:
            pad_token_id = 0

            def apply_chat_template(
                self,
                messages,
                *,
                tools=None,
                add_generation_prompt=False,
                tokenize=False,
            ) -> str:
                self.last_messages = messages
                rendered = " | ".join(
                    f"{message['role']}:{message['content']}" for message in messages
                )
                if add_generation_prompt:
                    rendered += " | assistant:"
                return rendered

            def __call__(self, text: str, return_tensors: str = "pt"):
                token_count = max(1, len(text.split()))
                return type(
                    "TokenResult",
                    (),
                    {"input_ids": torch.arange(token_count).unsqueeze(0)},
                )()

        fake_model = type("FakeModel", (), {"device": "cpu"})()
        collator = LAwFDataCollator(fake_model, FakeTokenizer())

        payload = collator.tokenize_row(
            {
                "prompt": [{"role": "user", "content": "hello"}],
                "completion": [{"role": "assistant", "content": "world"}],
                "anchors": [{"token_index": 0}],
            }
        )

        self.assertIn("prompt_ids", payload)
        self.assertIn("prompt_completion_ids", payload)
        self.assertIn("completion_ids", payload)
        self.assertEqual(int(payload["anchors"].sum().item()), 1)


if __name__ == "__main__":
    unittest.main()
