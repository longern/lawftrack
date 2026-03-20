from __future__ import annotations

from functools import lru_cache
from typing import Any


class TokenizerDependencyError(RuntimeError):
    pass


def _import_auto_tokenizer():
    try:
        from transformers import AutoTokenizer
    except ImportError as exc:  # pragma: no cover - exercised via callers
        raise TokenizerDependencyError(
            "Tokenizer support requires `transformers`. Install the runtime with tokenizer dependencies."
        ) from exc
    return AutoTokenizer


@lru_cache(maxsize=8)
def load_tokenizer(model: str):
    AutoTokenizer = _import_auto_tokenizer()
    try:
        return AutoTokenizer.from_pretrained(model, use_fast=True)
    except TypeError:
        tokenizer = AutoTokenizer.from_pretrained(model)
    if not getattr(tokenizer, "is_fast", False):
        raise TokenizerDependencyError(
            f"Model tokenizer for `{model}` does not expose fast offset mappings."
        )
    return tokenizer


def tokenize_text(*, model: str, text: str) -> list[dict[str, Any]]:
    tokenizer = load_tokenizer(model)
    encoded = tokenizer(
        text,
        add_special_tokens=False,
        return_offsets_mapping=True,
    )
    input_ids = list(encoded["input_ids"])
    offsets = list(encoded["offset_mapping"])
    tokens: list[dict[str, Any]] = []
    for token_index, (token_id, offset_pair) in enumerate(zip(input_ids, offsets)):
        start, end = int(offset_pair[0]), int(offset_pair[1])
        rendered = tokenizer.decode(
            [int(token_id)],
            clean_up_tokenization_spaces=False,
        )
        if not rendered and end > start:
            rendered = text[start:end]
        tokens.append(
            {
                "token_index": token_index,
                "token_id": int(token_id),
                "token": str(tokenizer.convert_ids_to_tokens(int(token_id))),
                "text": rendered,
                "start": start,
                "end": end,
            }
        )
    return tokens


def build_continuation_prefix(
    *,
    model: str,
    text: str,
    token_index: int,
    replacement_text: str,
) -> tuple[str, str, str]:
    tokenizer = load_tokenizer(model)
    encoded = tokenizer(text, add_special_tokens=False)
    input_ids = list(encoded["input_ids"])
    if token_index < 0 or token_index >= len(input_ids):
        raise ValueError(f"Token index {token_index} is out of range.")

    replacement_ids = list(tokenizer(replacement_text, add_special_tokens=False)["input_ids"])
    if len(replacement_ids) != 1:
        raise ValueError("Replacement must map to exactly one tokenizer token.")

    original_token = tokenizer.decode(
        [int(input_ids[token_index])],
        clean_up_tokenization_spaces=False,
    )
    replacement_token = tokenizer.decode(
        [int(replacement_ids[0])],
        clean_up_tokenization_spaces=False,
    )
    prefix_ids = input_ids[:token_index] + replacement_ids
    prefix = tokenizer.decode(prefix_ids, clean_up_tokenization_spaces=False)
    return prefix, original_token, replacement_token


def build_prefix_before_token(
    *,
    model: str,
    text: str,
    token_index: int,
) -> str:
    tokenizer = load_tokenizer(model)
    encoded = tokenizer(text, add_special_tokens=False)
    input_ids = list(encoded["input_ids"])
    if token_index < 0 or token_index >= len(input_ids):
        raise ValueError(f"Token index {token_index} is out of range.")

    prefix_ids = input_ids[:token_index]
    return tokenizer.decode(prefix_ids, clean_up_tokenization_spaces=False)


def count_text_tokens(*, model: str, text: str) -> int:
    tokenizer = load_tokenizer(model)
    encoded = tokenizer(text, add_special_tokens=False)
    return len(list(encoded["input_ids"]))


def get_tokenizer_max_length(*, model: str) -> int | None:
    tokenizer = load_tokenizer(model)
    max_length = getattr(tokenizer, "model_max_length", None)
    if not isinstance(max_length, int) or max_length <= 0:
        return None
    # Hugging Face uses extremely large sentinels when max length is unknown.
    if max_length >= 1_000_000:
        return None
    return max_length
