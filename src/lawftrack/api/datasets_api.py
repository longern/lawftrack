from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import APIRouter
from fastapi import File
from fastapi import HTTPException
from fastapi import UploadFile
import httpx
from pydantic import BaseModel

from .dataset_store import DatasetStore
from .tokenizer_service import TokenizerDependencyError
from .tokenizer_service import build_prefix_before_token
from .tokenizer_service import build_continuation_prefix
from .tokenizer_service import count_text_tokens
from .tokenizer_service import get_model_max_position_embeddings
from .tokenizer_service import get_tokenizer_max_length
from .tokenizer_service import load_tokenizer
from .tokenizer_service import tokenize_text
from ..config import load_config
from ..train.algorithms import normalize_training_method
from ..vllm import build_vllm_url


class CreateDatasetRequest(BaseModel):
    name: str
    base_model: str | None = None


class UpdateDatasetRequest(BaseModel):
    name: str | None = None
    base_model: str | None = None


class DatasetMessagePayload(BaseModel):
    role: str
    content: str
    reasoning: str | None = None


class DatasetTokenEditPayload(BaseModel):
    message_index: int
    token_index: int
    target: str | None = "content"
    original_token: str | None = None
    replacement_token: str
    regenerated_from_token_index: int | None = None
    created_at: int | None = None


class UpdateDatasetSampleRequest(BaseModel):
    title: str | None = None
    messages: list[DatasetMessagePayload]
    edits: list[DatasetTokenEditPayload] | None = None
    anchors: list[DatasetTokenEditPayload] | None = None


class CreateDatasetSampleRequest(BaseModel):
    title: str | None = None
    messages: list[DatasetMessagePayload] | None = None
    anchors: list[DatasetTokenEditPayload] | None = None


class TokenizeDatasetSampleRequest(BaseModel):
    model: str
    messages: list[DatasetMessagePayload] | None = None


class ContinueDatasetSampleRequest(BaseModel):
    model: str
    message_index: int
    token_index: int
    target: str | None = "content"
    replacement_token: str
    max_tokens: int | None = None
    temperature: float = 0.7


class ListTokenCandidatesRequest(BaseModel):
    model: str
    message_index: int
    token_index: int
    target: str | None = "content"
    top_logprobs: int = 10


class RenderCompletionPromptRequest(BaseModel):
    model: str
    messages: list[DatasetMessagePayload]
    assistant_prefill: str = ""


class ExportDatasetTrainingFileRequest(BaseModel):
    method: dict[str, Any] | None = None


def serialize_model(model: BaseModel) -> dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump(exclude_unset=True)
    return model.dict(exclude_unset=True)


def extract_message_text(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return "".join(
            str(item.get("text") or "") for item in value if isinstance(item, dict)
        )
    return ""


def extract_reasoning_from_message(message: dict[str, Any]) -> str | None:
    reasoning = extract_message_text(
        message.get("reasoning", message.get("reasoning_content"))
    )
    return reasoning or None


def build_sample_message(
    *,
    role: str,
    content: str,
    reasoning: str | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "role": role,
        "content": content,
    }
    if reasoning:
        payload["reasoning"] = reasoning
    return payload


def render_assistant_prefill(*, reasoning: str | None = None, content: str = "") -> str:
    if reasoning:
        return f"<think>{reasoning}</think>{content}"
    return content


def render_prompt_message(message: dict[str, Any]) -> dict[str, str]:
    role = str(message.get("role") or "")
    if role == "assistant":
        content = render_assistant_prefill(
            reasoning=extract_reasoning_from_message(message),
            content=str(message.get("content") or ""),
        )
    else:
        content = str(message.get("content") or "")
    return {
        "role": role,
        "content": content,
    }


def build_completion_prompt(
    *,
    model: str,
    prompt_messages: list[dict[str, Any]],
    assistant_prefill: str,
    config_dir: Path | None = None,
) -> str:
    if prompt_messages:
        tokenizer = load_tokenizer(model, config_dir=config_dir)
        if not hasattr(tokenizer, "apply_chat_template"):
            raise TokenizerDependencyError(
                f"Model tokenizer for `{model}` does not expose a chat template."
            )
        prompt = tokenizer.apply_chat_template(
            [render_prompt_message(message) for message in prompt_messages],
            add_generation_prompt=True,
            tokenize=False,
        )
    else:
        prompt = ""
    return f"{prompt}{assistant_prefill}"


def build_completion_prefill(
    *,
    target_message: dict[str, Any],
    target: str,
    prefix: str,
) -> str:
    if target == "reasoning":
        return f"<think>{prefix}"
    return render_assistant_prefill(
        reasoning=extract_reasoning_from_message(target_message),
        content=prefix,
    )


def extract_completion_text(payload: dict[str, Any]) -> str:
    choices = payload.get("choices") or []
    if not choices:
        return ""
    return extract_message_text(choices[0].get("text"))


def parse_prefilled_assistant_text(text: str) -> tuple[str | None, str]:
    if not text.startswith("<think>"):
        return None, text

    closing_tag = "</think>"
    closing_index = text.find(closing_tag)
    if closing_index < 0:
        return text[len("<think>") :] or None, ""
    reasoning = text[len("<think>") : closing_index] or None
    content = text[closing_index + len(closing_tag) :]
    return reasoning, content


def extract_completion_logprob_candidates(
    payload: dict[str, Any],
) -> list[dict[str, Any]]:
    choices = payload.get("choices") or []
    if not choices:
        return []
    logprobs = choices[0].get("logprobs") or {}
    top_logprobs = logprobs.get("top_logprobs") or []
    if not top_logprobs:
        return []

    first_entry = top_logprobs[0]
    if isinstance(first_entry, dict):
        return [
            {"token": token, "logprob": logprob}
            for token, logprob in first_entry.items()
            if isinstance(token, str)
        ]
    if isinstance(first_entry, list):
        return [
            {
                "token": str(item.get("token") or ""),
                "logprob": item.get("logprob"),
            }
            for item in first_entry
            if isinstance(item, dict)
        ]
    return []


def prepare_sample_continuation(
    *,
    sample: dict[str, Any],
    payload: ContinueDatasetSampleRequest,
    config_dir: Path,
) -> dict[str, Any]:
    messages = list(sample.get("messages", []))
    if payload.message_index < 0 or payload.message_index >= len(messages):
        raise HTTPException(status_code=400, detail="Message index is out of range.")

    target_message = messages[payload.message_index]
    if target_message.get("role") != "assistant":
        raise HTTPException(
            status_code=400,
            detail="Only assistant messages support token continuation.",
        )
    target = (payload.target or "content").strip().lower()
    if target not in {"content", "reasoning"}:
        raise HTTPException(
            status_code=400, detail="Target must be `content` or `reasoning`."
        )

    try:
        prefix, original_token, replacement_token = build_continuation_prefix(
            model=payload.model,
            text=str(target_message.get(target) or ""),
            token_index=payload.token_index,
            replacement_text=payload.replacement_token,
            config_dir=config_dir,
        )
        replacement_token_count = count_text_tokens(
            model=payload.model,
            text=replacement_token,
            config_dir=config_dir,
        )
    except TokenizerDependencyError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    current_config = load_config(config_dir)
    headers = {"content-type": "application/json"}
    if current_config.get("api_key"):
        headers["authorization"] = f"Bearer {current_config['api_key']}"

    try:
        assistant_prefill = build_completion_prefill(
            target_message=target_message,
            target=target,
            prefix=prefix,
        )
        prompt = build_completion_prompt(
            model=payload.model,
            prompt_messages=messages[: payload.message_index],
            assistant_prefill=assistant_prefill,
            config_dir=config_dir,
        )
    except TokenizerDependencyError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    max_tokens = (
        payload.max_tokens
        if payload.max_tokens is not None
        else suggest_completion_max_tokens(
            model=payload.model,
            prompt=prompt,
            config_dir=config_dir,
        )
    )
    upstream_payload: dict[str, Any] = {
        "model": payload.model,
        "prompt": prompt,
        "temperature": payload.temperature,
        "max_tokens": max_tokens,
    }

    return {
        "messages": messages,
        "target_message": target_message,
        "target": target,
        "prefix": prefix,
        "original_token": original_token,
        "replacement_token": replacement_token,
        "replacement_token_count": replacement_token_count,
        "assistant_prefill": assistant_prefill,
        "headers": headers,
        "upstream_url": build_vllm_url(current_config["vllm_endpoint"], "completions"),
        "upstream_payload": upstream_payload,
    }


def build_continued_sample(
    *,
    sample: dict[str, Any],
    payload: ContinueDatasetSampleRequest,
    target_message: dict[str, Any],
    target: str,
    prefix: str,
    original_token: str,
    replacement_token: str,
    replacement_token_count: int,
    completion_text: str,
) -> dict[str, Any]:
    messages = list(sample.get("messages", []))
    existing_reasoning = extract_reasoning_from_message(target_message)
    existing_content = str(target_message.get("content") or "")
    if target == "reasoning":
        merged_reasoning, _ignored_content = parse_prefilled_assistant_text(
            build_completion_prefill(
                target_message=target_message,
                target=target,
                prefix=prefix,
            )
            + completion_text
        )
        content = existing_content
    else:
        content = f"{prefix}{completion_text}"
        merged_reasoning = existing_reasoning
    next_messages = messages[: payload.message_index] + [
        build_sample_message(
            role="assistant",
            content=content,
            reasoning=merged_reasoning,
        )
    ]
    previous_edits = [
        dict(edit)
        for edit in sample.get("edits", [])
        if isinstance(edit, dict)
        and (
            int(edit.get("message_index", -1)) < payload.message_index
            or (
                int(edit.get("message_index", -1)) == payload.message_index
                and (
                    str(edit.get("target") or "content") != target
                    or int(edit.get("token_index", -1)) < payload.token_index
                )
            )
        )
    ]
    next_edits = previous_edits + [
        {
            "message_index": payload.message_index,
            "token_index": payload.token_index,
            "target": target,
            "original_token": original_token,
            "replacement_token": replacement_token,
            "regenerated_from_token_index": payload.token_index
            + replacement_token_count,
        }
    ]

    return {
        **sample,
        "messages": next_messages,
        "edits": next_edits,
        "anchors": next_edits,
    }


def suggest_completion_max_tokens(
    *,
    model: str,
    prompt: str,
    config_dir: Path | None = None,
) -> int | None:
    prompt_tokens = count_text_tokens(
        model=model,
        text=prompt,
        config_dir=config_dir,
    )
    tokenizer_max_length = get_tokenizer_max_length(
        model=model,
        config_dir=config_dir,
    )
    config_max_length = get_model_max_position_embeddings(
        model=model,
        config_dir=config_dir,
    )
    available_limits = [
        value for value in (tokenizer_max_length, config_max_length) if value is not None
    ]
    model_max_length = min(available_limits) if available_limits else None
    if model_max_length is None:
        return 8192

    remaining_tokens = model_max_length - prompt_tokens - 1
    if remaining_tokens < 1:
        return 1
    return remaining_tokens


def build_sample_tokenization_payload(
    *,
    sample_id: str,
    model: str,
    messages: list[dict[str, Any]],
    config_dir: Path | None = None,
) -> dict[str, Any]:
    tokenized_messages = []
    for index, message in enumerate(messages):
        if message.get("role") == "assistant":
            reasoning_text = str(message.get("reasoning") or "")
            content_text = str(message.get("content") or "")
            reasoning_tokens = (
                tokenize_text(
                    model=model,
                    text=reasoning_text,
                    config_dir=config_dir,
                )
                if reasoning_text
                else []
            )
            tokens = (
                tokenize_text(
                    model=model,
                    text=content_text,
                    config_dir=config_dir,
                )
                if content_text
                else []
            )
        else:
            reasoning_text = ""
            reasoning_tokens = []
            tokens = []
        tokenized_messages.append(
            {
                "message_index": index,
                "role": message.get("role"),
                "reasoning": reasoning_text or None,
                "reasoning_tokens": reasoning_tokens,
                "content": message.get("content"),
                "tokens": tokens,
            }
        )
    return {
        "object": "dataset.sample.tokenization",
        "sample_id": sample_id,
        "messages": tokenized_messages,
    }


def build_router(config_dir: Path | None = None) -> APIRouter:
    router = APIRouter(prefix="/api/datasets", tags=["datasets"])
    store = DatasetStore(config_dir)

    @router.get("")
    def list_datasets() -> dict[str, Any]:
        return {
            "object": "list",
            "data": store.list_datasets(),
            "has_more": False,
        }

    @router.post("")
    def create_dataset(payload: CreateDatasetRequest) -> dict[str, Any]:
        return store.create_dataset(serialize_model(payload))

    @router.post("/import")
    async def import_dataset(file: UploadFile = File(...)) -> dict[str, Any]:
        filename = file.filename or "dataset-upload"
        suffix = Path(filename).suffix.lower()
        content = await file.read()

        if suffix in {".yaml", ".yml"}:
            try:
                dataset = store.import_metadata_file(filename=filename, content=content)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
            return dataset

        if suffix in {".json", ".jsonl"}:
            return store.import_training_data_file(
                filename=filename,
                content=content,
                content_type=file.content_type,
            )

        raise HTTPException(
            status_code=400,
            detail="Unsupported dataset file type. Use .yaml, .yml, .json, or .jsonl.",
        )

    @router.get("/{dataset_id}")
    def retrieve_dataset(dataset_id: str) -> dict[str, Any]:
        try:
            return store.get_dataset(dataset_id)
        except FileNotFoundError as exc:
            raise HTTPException(
                status_code=404, detail=f"Dataset not found: {dataset_id}"
            ) from exc

    @router.get("/{dataset_id}/samples")
    def list_dataset_samples(dataset_id: str) -> dict[str, Any]:
        try:
            samples = store.list_samples(dataset_id)
        except FileNotFoundError as exc:
            raise HTTPException(
                status_code=404, detail=f"Dataset not found: {dataset_id}"
            ) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        return {
            "object": "list",
            "data": samples,
            "has_more": False,
        }

    @router.post("/{dataset_id}/training_file")
    def export_dataset_training_file(
        dataset_id: str,
        payload: ExportDatasetTrainingFileRequest,
    ) -> dict[str, Any]:
        serialized = serialize_model(payload)
        try:
            method = normalize_training_method(serialized.get("method"))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        try:
            created_file, record_count = store.export_training_file(
                dataset_id,
                method_type=str(method["type"]),
            )
        except FileNotFoundError as exc:
            raise HTTPException(
                status_code=404, detail=f"Dataset not found: {dataset_id}"
            ) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        if record_count <= 0:
            raise HTTPException(
                status_code=400,
                detail="Dataset does not contain any exportable training samples.",
            )

        return {
            "object": "dataset.training_file",
            "dataset_id": dataset_id,
            "method": method["type"],
            "record_count": record_count,
            "file": created_file,
        }

    @router.post("/{dataset_id}/samples")
    def create_dataset_sample(
        dataset_id: str,
        payload: CreateDatasetSampleRequest,
    ) -> dict[str, Any]:
        try:
            return store.create_sample(dataset_id, serialize_model(payload))
        except FileNotFoundError as exc:
            raise HTTPException(
                status_code=404, detail=f"Dataset not found: {dataset_id}"
            ) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @router.post("/{dataset_id}/samples/{sample_id}/tokenize")
    def tokenize_dataset_sample(
        dataset_id: str,
        sample_id: str,
        payload: TokenizeDatasetSampleRequest,
    ) -> dict[str, Any]:
        try:
            sample = store.get_sample(dataset_id, sample_id)
        except FileNotFoundError as exc:
            missing_key = sample_id if str(exc) == sample_id else dataset_id
            detail = (
                f"Dataset sample not found: {sample_id}"
                if missing_key == sample_id
                else f"Dataset not found: {dataset_id}"
            )
            raise HTTPException(status_code=404, detail=detail) from exc

        try:
            return build_sample_tokenization_payload(
                sample_id=sample_id,
                model=payload.model,
                messages=(
                    [serialize_model(message) for message in payload.messages]
                    if payload.messages is not None
                    else list(sample.get("messages", []))
                ),
                config_dir=config_dir,
            )
        except TokenizerDependencyError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @router.post("/render_completion_prompt")
    def render_completion_prompt(
        payload: RenderCompletionPromptRequest,
    ) -> dict[str, Any]:
        try:
            prompt = build_completion_prompt(
                model=payload.model,
                prompt_messages=[
                    serialize_model(message) for message in payload.messages
                ],
                assistant_prefill=payload.assistant_prefill,
                config_dir=config_dir,
            )
        except TokenizerDependencyError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        return {
            "object": "dataset.completion_prompt",
            "prompt": prompt,
            "suggested_max_tokens": suggest_completion_max_tokens(
                model=payload.model,
                prompt=prompt,
                config_dir=config_dir,
            ),
        }

    @router.post("/{dataset_id}/samples/{sample_id}/continue_prepare")
    def prepare_dataset_sample_continuation(
        dataset_id: str,
        sample_id: str,
        payload: ContinueDatasetSampleRequest,
    ) -> dict[str, Any]:
        try:
            sample = store.get_sample(dataset_id, sample_id)
        except FileNotFoundError as exc:
            missing_key = sample_id if str(exc) == sample_id else dataset_id
            detail = (
                f"Dataset sample not found: {sample_id}"
                if missing_key == sample_id
                else f"Dataset not found: {dataset_id}"
            )
            raise HTTPException(status_code=404, detail=detail) from exc

        prepared = prepare_sample_continuation(
            sample=sample,
            payload=payload,
            config_dir=config_dir,
        )
        return {
            "object": "dataset.sample.continuation_preparation",
            "prompt": prepared["upstream_payload"]["prompt"],
            "suggested_max_tokens": prepared["upstream_payload"]["max_tokens"],
            "prefix": prepared["prefix"],
            "target": prepared["target"],
            "original_token": prepared["original_token"],
            "replacement_token": prepared["replacement_token"],
            "regenerated_from_token_index": payload.token_index
            + prepared["replacement_token_count"],
        }

    @router.post("/{dataset_id}/samples/{sample_id}/candidate_tokens")
    async def list_dataset_sample_token_candidates(
        dataset_id: str,
        sample_id: str,
        payload: ListTokenCandidatesRequest,
    ) -> dict[str, Any]:
        try:
            sample = store.get_sample(dataset_id, sample_id)
        except FileNotFoundError as exc:
            missing_key = sample_id if str(exc) == sample_id else dataset_id
            detail = (
                f"Dataset sample not found: {sample_id}"
                if missing_key == sample_id
                else f"Dataset not found: {dataset_id}"
            )
            raise HTTPException(status_code=404, detail=detail) from exc

        messages = list(sample.get("messages", []))
        if payload.message_index < 0 or payload.message_index >= len(messages):
            raise HTTPException(
                status_code=400, detail="Message index is out of range."
            )

        target_message = messages[payload.message_index]
        if target_message.get("role") != "assistant":
            raise HTTPException(
                status_code=400,
                detail="Only assistant messages support token continuation.",
            )
        target = (payload.target or "content").strip().lower()
        if target not in {"content", "reasoning"}:
            raise HTTPException(
                status_code=400, detail="Target must be `content` or `reasoning`."
            )

        target_text = str(
            extract_reasoning_from_message(target_message)
            if target == "reasoning"
            else target_message.get("content") or ""
        )
        try:
            prefix = build_prefix_before_token(
                model=payload.model,
                text=target_text,
                token_index=payload.token_index,
                config_dir=config_dir,
            )
        except TokenizerDependencyError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        current_config = load_config(config_dir)
        headers = {"content-type": "application/json"}
        if current_config.get("api_key"):
            headers["authorization"] = f"Bearer {current_config['api_key']}"
        upstream_url = build_vllm_url(current_config["vllm_endpoint"], "completions")
        try:
            prompt = build_completion_prompt(
                model=payload.model,
                prompt_messages=messages[: payload.message_index],
                assistant_prefill=build_completion_prefill(
                    target_message=target_message,
                    target=target,
                    prefix=prefix,
                ),
                config_dir=config_dir,
            )
        except TokenizerDependencyError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        async with httpx.AsyncClient(follow_redirects=True, timeout=120.0) as client:
            upstream_response = await client.post(
                upstream_url,
                headers=headers,
                json={
                    "model": payload.model,
                    "prompt": prompt,
                    "max_tokens": 1,
                    "temperature": 0,
                    "logprobs": max(1, payload.top_logprobs),
                },
            )

        if not upstream_response.is_success:
            detail = (
                upstream_response.text
                or f"Upstream completion failed: {upstream_response.status_code}"
            )
            raise HTTPException(
                status_code=upstream_response.status_code, detail=detail
            )

        seen: set[str] = set()
        candidates = []
        for candidate in extract_completion_logprob_candidates(
            upstream_response.json()
        ):
            token_text = str(candidate.get("token") or "")
            if not token_text or token_text in seen:
                continue
            seen.add(token_text)
            candidates.append(
                {
                    "text": token_text,
                    "logprob": (
                        candidate.get("logprob")
                        if isinstance(candidate.get("logprob"), (int, float))
                        else None
                    ),
                }
            )

        return {"object": "list", "data": candidates, "has_more": False}

    @router.post("/{dataset_id}/samples/{sample_id}/continue")
    async def continue_dataset_sample(
        dataset_id: str,
        sample_id: str,
        payload: ContinueDatasetSampleRequest,
    ) -> dict[str, Any]:
        try:
            sample = store.get_sample(dataset_id, sample_id)
        except FileNotFoundError as exc:
            missing_key = sample_id if str(exc) == sample_id else dataset_id
            detail = (
                f"Dataset sample not found: {sample_id}"
                if missing_key == sample_id
                else f"Dataset not found: {dataset_id}"
            )
            raise HTTPException(status_code=404, detail=detail) from exc

        prepared = prepare_sample_continuation(
            sample=sample,
            payload=payload,
            config_dir=config_dir,
        )
        target_message = prepared["target_message"]
        target = prepared["target"]
        prefix = prepared["prefix"]
        original_token = prepared["original_token"]
        replacement_token = prepared["replacement_token"]
        replacement_token_count = prepared["replacement_token_count"]

        async with httpx.AsyncClient(follow_redirects=True, timeout=120.0) as client:
            upstream_response = await client.post(
                prepared["upstream_url"],
                headers=prepared["headers"],
                json=prepared["upstream_payload"],
            )

        if not upstream_response.is_success:
            detail = (
                upstream_response.text
                or f"Upstream completion failed: {upstream_response.status_code}"
            )
            raise HTTPException(
                status_code=upstream_response.status_code, detail=detail
            )

        completion_payload = upstream_response.json()
        completion_text = extract_completion_text(completion_payload)
        next_sample = build_continued_sample(
            sample=sample,
            payload=payload,
            target_message=target_message,
            target=target,
            prefix=prefix,
            original_token=original_token,
            replacement_token=replacement_token,
            replacement_token_count=replacement_token_count,
            completion_text=completion_text,
        )

        try:
            tokenization = build_sample_tokenization_payload(
                sample_id=sample_id,
                model=payload.model,
                messages=next_sample["messages"],
                config_dir=config_dir,
            )
        except TokenizerDependencyError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        return {"sample": next_sample, "tokenization": tokenization}

    @router.put("/{dataset_id}/samples/{sample_id}")
    def update_dataset_sample(
        dataset_id: str,
        sample_id: str,
        payload: UpdateDatasetSampleRequest,
    ) -> dict[str, Any]:
        try:
            return store.update_sample(dataset_id, sample_id, serialize_model(payload))
        except FileNotFoundError as exc:
            missing_key = sample_id if str(exc) == sample_id else dataset_id
            detail = (
                f"Dataset sample not found: {sample_id}"
                if missing_key == sample_id
                else f"Dataset not found: {dataset_id}"
            )
            raise HTTPException(status_code=404, detail=detail) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @router.delete("/{dataset_id}/samples/{sample_id}")
    def delete_dataset_sample(dataset_id: str, sample_id: str) -> dict[str, Any]:
        try:
            store.delete_sample(dataset_id, sample_id)
        except FileNotFoundError as exc:
            missing_key = sample_id if str(exc) == sample_id else dataset_id
            detail = (
                f"Dataset sample not found: {sample_id}"
                if missing_key == sample_id
                else f"Dataset not found: {dataset_id}"
            )
            raise HTTPException(status_code=404, detail=detail) from exc
        return {"id": sample_id, "object": "dataset.sample.deleted", "deleted": True}

    @router.patch("/{dataset_id}")
    def update_dataset(
        dataset_id: str, payload: UpdateDatasetRequest
    ) -> dict[str, Any]:
        try:
            return store.update_dataset(dataset_id, serialize_model(payload))
        except FileNotFoundError as exc:
            raise HTTPException(
                status_code=404, detail=f"Dataset not found: {dataset_id}"
            ) from exc

    @router.delete("/{dataset_id}")
    def delete_dataset(dataset_id: str) -> dict[str, Any]:
        try:
            store.delete_dataset(dataset_id)
        except FileNotFoundError as exc:
            raise HTTPException(
                status_code=404, detail=f"Dataset not found: {dataset_id}"
            ) from exc
        return {"id": dataset_id, "object": "dataset.deleted", "deleted": True}

    return router
