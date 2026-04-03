from __future__ import annotations

from pathlib import Path
from typing import Any

from .tokenizer_service import load_tokenizer


def extract_message_text(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return "".join(
            str(item.get("text") or "") for item in value if isinstance(item, dict)
        )
    return ""


def _build_template_message(
    message: dict[str, Any],
    *,
    assistant_mode: str,
) -> dict[str, Any]:
    role = str(message.get("role") or "")
    payload: dict[str, Any] = {"role": role}
    if role == "assistant":
        if assistant_mode == "placeholder":
            payload["content"] = ""
        else:
            payload["content"] = extract_message_text(message.get("content"))
            tool_calls = message.get("tool_calls")
            if isinstance(tool_calls, list) and tool_calls:
                payload["tool_calls"] = [
                    item for item in tool_calls if isinstance(item, dict)
                ]
    else:
        payload["content"] = extract_message_text(message.get("content"))
    if message.get("tool_call_id") is not None:
        payload["tool_call_id"] = str(message.get("tool_call_id") or "")
    if message.get("name") is not None:
        payload["name"] = str(message.get("name") or "")
    return payload


def _apply_chat_template_token_ids(
    *,
    model: str,
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]] | None = None,
    add_generation_prompt: bool = False,
    config_dir: Path | None = None,
) -> list[int]:
    if not messages:
        return []
    tokenizer = load_tokenizer(model, config_dir=config_dir)
    template_kwargs: dict[str, Any] = {
        "tokenize": True,
        "add_generation_prompt": add_generation_prompt,
    }
    if tools:
        template_kwargs["tools"] = tools
    token_ids = tokenizer.apply_chat_template(messages, **template_kwargs)
    return _normalize_token_ids(token_ids)


def _normalize_token_ids(value: Any) -> list[int]:
    if value is None:
        return []
    if hasattr(value, "tolist"):
        value = value.tolist()
    if isinstance(value, dict):
        value = value.get("input_ids", [])
    elif hasattr(value, "keys") and hasattr(value, "__getitem__"):
        try:
            value = value["input_ids"]
        except Exception:
            pass
    if hasattr(value, "tolist"):
        value = value.tolist()
    if isinstance(value, tuple):
        value = list(value)
    if not isinstance(value, list):
        return [int(value)]
    if value and isinstance(value[0], (list, tuple)):
        value = list(value[0])
    return [int(token_id) for token_id in value]


def _decode_token_ids(
    *,
    model: str,
    token_ids: list[int],
    config_dir: Path | None = None,
) -> str:
    if not token_ids:
        return ""
    tokenizer = load_tokenizer(model, config_dir=config_dir)
    return tokenizer.decode(
        token_ids,
        clean_up_tokenization_spaces=False,
        skip_special_tokens=False,
    )


def _extract_template_delta(
    *,
    before_ids: list[int],
    after_ids: list[int],
) -> list[int]:
    common_length = 0
    max_common = min(len(before_ids), len(after_ids))
    while common_length < max_common and before_ids[common_length] == after_ids[common_length]:
        common_length += 1

    return after_ids[common_length:]


def render_message_delta_from_chat_template(
    *,
    model: str,
    prompt_messages: list[dict[str, Any]],
    message: dict[str, Any],
    tools: list[dict[str, Any]] | None = None,
    config_dir: Path | None = None,
) -> str:
    context_messages = [
        _build_template_message(item, assistant_mode="placeholder")
        if str(item.get("role") or "") == "assistant"
        else _build_template_message(item, assistant_mode="raw")
        for item in prompt_messages
    ]
    before_ids = _apply_chat_template_token_ids(
        model=model,
        messages=context_messages,
        tools=tools,
        add_generation_prompt=False,
        config_dir=config_dir,
    )
    after_ids = _apply_chat_template_token_ids(
        model=model,
        messages=context_messages
        + [_build_template_message(message, assistant_mode="raw")],
        tools=tools,
        add_generation_prompt=False,
        config_dir=config_dir,
    )
    return _decode_token_ids(
        model=model,
        token_ids=_extract_template_delta(
            before_ids=before_ids,
            after_ids=after_ids,
        ),
        config_dir=config_dir,
    )


def render_generation_prompt_delta_from_chat_template(
    *,
    model: str,
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]] | None = None,
    config_dir: Path | None = None,
) -> str:
    context_messages = [
        _build_template_message(item, assistant_mode="placeholder")
        if str(item.get("role") or "") == "assistant"
        else _build_template_message(item, assistant_mode="raw")
        for item in messages
    ]
    before_ids = _apply_chat_template_token_ids(
        model=model,
        messages=context_messages,
        tools=tools,
        add_generation_prompt=False,
        config_dir=config_dir,
    )
    after_ids = _apply_chat_template_token_ids(
        model=model,
        messages=context_messages,
        tools=tools,
        add_generation_prompt=True,
        config_dir=config_dir,
    )
    return _decode_token_ids(
        model=model,
        token_ids=_extract_template_delta(
            before_ids=before_ids,
            after_ids=after_ids,
        ),
        config_dir=config_dir,
    )


def render_prompt_from_stored_messages(
    *,
    model: str,
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]] | None = None,
    assistant_prefill: str = "",
    add_generation_prompt: bool = False,
    config_dir: Path | None = None,
) -> str:
    rendered_parts: list[str] = []
    logical_history: list[dict[str, Any]] = []

    for message in messages:
        role = str(message.get("role") or "")
        if role == "assistant":
            rendered_parts.append(extract_message_text(message.get("content")))
            logical_history.append(
                _build_template_message(message, assistant_mode="placeholder")
            )
            continue

        rendered_parts.append(
            render_message_delta_from_chat_template(
                model=model,
                prompt_messages=logical_history,
                message=message,
                tools=tools,
                config_dir=config_dir,
            )
        )
        logical_history.append(
            _build_template_message(
                message,
                assistant_mode="placeholder" if role == "assistant" else "raw",
            )
        )

    if add_generation_prompt:
        rendered_parts.append(
            render_generation_prompt_delta_from_chat_template(
                model=model,
                messages=logical_history,
                tools=tools,
                config_dir=config_dir,
            )
        )

    return "".join(rendered_parts) + assistant_prefill
