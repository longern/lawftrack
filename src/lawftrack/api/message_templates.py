from __future__ import annotations

import json
import re
from typing import Any

THINK_OPEN = "<think>"
THINK_CLOSE = "</think>"
TOOL_CALL_OPEN = "<tool_call>"
TOOL_CALL_CLOSE = "</tool_call>"

_ASSISTANT_BLOCK_PATTERN = re.compile(
    rf"{re.escape(THINK_OPEN)}(.*?){re.escape(THINK_CLOSE)}|"
    rf"{re.escape(TOOL_CALL_OPEN)}(.*?){re.escape(TOOL_CALL_CLOSE)}",
    re.DOTALL,
)


def render_think_block(reasoning: str) -> str:
    return f"{THINK_OPEN}{reasoning}{THINK_CLOSE}"


def render_tool_call_block(tool_call: dict[str, Any]) -> str:
    return (
        f"{TOOL_CALL_OPEN}\n"
        f"{json.dumps(tool_call, ensure_ascii=False, indent=2)}\n"
        f"{TOOL_CALL_CLOSE}"
    )


def _join_template_segments(segments: list[str]) -> str:
    return "\n\n".join(segment for segment in segments if segment)


def render_assistant_message_template(
    *,
    content: str = "",
    reasoning: str | None = None,
    tool_calls: list[dict[str, Any]] | None = None,
) -> str:
    segments: list[str] = []
    if reasoning:
        segments.append(render_think_block(reasoning))
    if content:
        segments.append(content)
    for tool_call in tool_calls or []:
        if isinstance(tool_call, dict):
            segments.append(render_tool_call_block(tool_call))
    return _join_template_segments(segments)


def parse_assistant_message_template(text: Any) -> dict[str, Any]:
    raw_text = str(text or "")
    content_parts: list[str] = []
    reasoning_parts: list[str] = []
    tool_calls: list[dict[str, Any]] = []
    cursor = 0

    for match in _ASSISTANT_BLOCK_PATTERN.finditer(raw_text):
        if match.start() > cursor:
            content_parts.append(raw_text[cursor : match.start()])

        reasoning_block, tool_call_block = match.groups()
        if reasoning_block is not None:
            reasoning_parts.append(reasoning_block)
        elif tool_call_block is not None:
            tool_call_text = tool_call_block.strip()
            try:
                parsed_tool_call = json.loads(tool_call_text)
            except json.JSONDecodeError:
                content_parts.append(raw_text[match.start() : match.end()])
            else:
                if isinstance(parsed_tool_call, dict):
                    tool_calls.append(parsed_tool_call)
                else:
                    content_parts.append(raw_text[match.start() : match.end()])
        cursor = match.end()

    if cursor < len(raw_text):
        content_parts.append(raw_text[cursor:])

    content = "".join(content_parts)
    if reasoning_parts or tool_calls:
        content = content.lstrip("\n").rstrip("\n")

    return {
        "raw_content": raw_text,
        "content": content,
        "reasoning": "\n\n".join(part for part in reasoning_parts if part) or None,
        "tool_calls": tool_calls,
    }
