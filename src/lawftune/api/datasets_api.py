from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import APIRouter
from fastapi import File
from fastapi import HTTPException
from fastapi import UploadFile
import httpx
from pydantic import BaseModel

from lawftune.api.dataset_store import DatasetStore
from lawftune.api.files_store import FileStore
from lawftune.api.tokenizer_service import TokenizerDependencyError
from lawftune.api.tokenizer_service import build_continuation_prefix
from lawftune.api.tokenizer_service import tokenize_text
from lawftune.config import load_config
from lawftune.vllm import build_vllm_url


class CreateDatasetRequest(BaseModel):
    name: str
    base_model: str | None = None
    training_file_id: str | None = None


class UpdateDatasetRequest(BaseModel):
    name: str | None = None
    base_model: str | None = None
    training_file_id: str | None = None


class DatasetMessagePayload(BaseModel):
    role: str
    content: str


class DatasetTokenEditPayload(BaseModel):
    message_index: int
    token_index: int
    original_token: str
    replacement_token: str
    regenerated_from_token_index: int | None = None
    created_at: int | None = None


class UpdateDatasetSampleRequest(BaseModel):
    title: str | None = None
    messages: list[DatasetMessagePayload]
    source_messages: list[DatasetMessagePayload] | None = None
    edits: list[DatasetTokenEditPayload] | None = None


class CreateDatasetSampleRequest(BaseModel):
    title: str | None = None
    messages: list[DatasetMessagePayload] | None = None
    source_messages: list[DatasetMessagePayload] | None = None


class TokenizeDatasetSampleRequest(BaseModel):
    model: str


class ContinueDatasetSampleRequest(BaseModel):
    model: str
    message_index: int
    token_index: int
    replacement_token: str
    max_tokens: int = 256
    temperature: float = 0.7


class GenerateDatasetSampleRequest(BaseModel):
    model: str
    max_tokens: int = 512
    temperature: float = 0.7


def serialize_model(model: BaseModel) -> dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump(exclude_unset=True)
    return model.dict(exclude_unset=True)


def extract_content_from_message_payload(payload: dict[str, Any]) -> str:
    choices = payload.get("choices") or []
    if not choices:
        return ""
    message = choices[0].get("message") or {}
    content_value = message.get("content")
    if isinstance(content_value, str):
        return content_value
    if isinstance(content_value, list):
        return "".join(
            str(item.get("text") or "")
            for item in content_value
            if isinstance(item, dict)
        )
    return ""


def build_sample_tokenization_payload(
    *,
    sample_id: str,
    model: str,
    messages: list[dict[str, Any]],
) -> dict[str, Any]:
    tokenized_messages = []
    for index, message in enumerate(messages):
        if message.get("role") == "assistant":
            tokens = tokenize_text(model=model, text=str(message.get("content") or ""))
        else:
            tokens = []
        tokenized_messages.append(
            {
                "message_index": index,
                "role": message.get("role"),
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
    file_store = FileStore(config_dir)

    def validate_training_file(file_id: str) -> None:
        try:
            metadata = file_store.get_file(file_id)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=400, detail=f"Unknown training file: {file_id}") from exc

        if metadata.get("purpose") != "fine-tune":
            raise HTTPException(
                status_code=400,
                detail=f"Dataset training_file_id must reference a fine-tune file: {file_id}",
            )

    @router.get("")
    def list_datasets() -> dict[str, Any]:
        return {
            "object": "list",
            "data": store.list_datasets(),
            "has_more": False,
        }

    @router.post("")
    def create_dataset(payload: CreateDatasetRequest) -> dict[str, Any]:
        serialized = serialize_model(payload)
        training_file_id = serialized.get("training_file_id")
        if training_file_id:
            validate_training_file(str(training_file_id))
        return store.create_dataset(serialized)

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
            training_file_id = dataset.get("training_file_id")
            if training_file_id:
                validate_training_file(str(training_file_id))
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
            raise HTTPException(status_code=404, detail=f"Dataset not found: {dataset_id}") from exc

    @router.get("/{dataset_id}/samples")
    def list_dataset_samples(dataset_id: str) -> dict[str, Any]:
        try:
            samples = store.list_samples(dataset_id)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=f"Dataset not found: {dataset_id}") from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        return {
            "object": "list",
            "data": samples,
            "has_more": False,
        }

    @router.post("/{dataset_id}/samples")
    def create_dataset_sample(
        dataset_id: str,
        payload: CreateDatasetSampleRequest,
    ) -> dict[str, Any]:
        try:
            return store.create_sample(dataset_id, serialize_model(payload))
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=f"Dataset not found: {dataset_id}") from exc
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
                messages=list(sample.get("messages", [])),
            )
        except TokenizerDependencyError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

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

        messages = list(sample.get("messages", []))
        if payload.message_index < 0 or payload.message_index >= len(messages):
            raise HTTPException(status_code=400, detail="Message index is out of range.")

        target_message = messages[payload.message_index]
        if target_message.get("role") != "assistant":
            raise HTTPException(status_code=400, detail="Only assistant messages support token continuation.")

        try:
            prefix, original_token, replacement_token = build_continuation_prefix(
                model=payload.model,
                text=str(target_message.get("content") or ""),
                token_index=payload.token_index,
                replacement_text=payload.replacement_token,
            )
        except TokenizerDependencyError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        request_messages = [
            {"role": str(message.get("role") or ""), "content": str(message.get("content") or "")}
            for message in messages[: payload.message_index]
        ]
        request_messages.append({"role": "assistant", "content": prefix})

        current_config = load_config(config_dir)
        headers = {"content-type": "application/json"}
        if current_config.get("api_key"):
            headers["authorization"] = f"Bearer {current_config['api_key']}"
        upstream_url = build_vllm_url(current_config["vllm_endpoint"], "chat/completions")

        async with httpx.AsyncClient(follow_redirects=True, timeout=120.0) as client:
            upstream_response = await client.post(
                upstream_url,
                headers=headers,
                json={
                    "model": payload.model,
                    "messages": request_messages,
                    "max_tokens": payload.max_tokens,
                    "temperature": payload.temperature,
                    "add_generation_prompt": False,
                    "continue_final_message": True,
                },
            )

        if not upstream_response.is_success:
            detail = upstream_response.text or f"Upstream completion failed: {upstream_response.status_code}"
            raise HTTPException(status_code=upstream_response.status_code, detail=detail)

        completion_payload = upstream_response.json()
        content = extract_content_from_message_payload(completion_payload)

        next_messages = request_messages[:-1] + [{"role": "assistant", "content": f"{prefix}{content}"}]
        previous_edits = [
            dict(edit)
            for edit in sample.get("edits", [])
            if isinstance(edit, dict)
            and (
                int(edit.get("message_index", -1)) < payload.message_index
                or (
                    int(edit.get("message_index", -1)) == payload.message_index
                    and int(edit.get("token_index", -1)) < payload.token_index
                )
            )
        ]
        next_edits = previous_edits + [
            {
                "message_index": payload.message_index,
                "token_index": payload.token_index,
                "original_token": original_token,
                "replacement_token": replacement_token,
                "regenerated_from_token_index": payload.token_index + 1,
            }
        ]

        next_sample = {
            **sample,
            "messages": next_messages,
            "edits": next_edits,
        }

        try:
            tokenization = build_sample_tokenization_payload(
                sample_id=sample_id,
                model=payload.model,
                messages=next_messages,
            )
        except TokenizerDependencyError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        return {"sample": next_sample, "tokenization": tokenization}

    @router.post("/{dataset_id}/samples/{sample_id}/generate")
    async def generate_dataset_sample_message(
        dataset_id: str,
        sample_id: str,
        payload: GenerateDatasetSampleRequest,
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

        messages = [
            {"role": str(message.get("role") or ""), "content": str(message.get("content") or "")}
            for message in sample.get("messages", [])
            if str(message.get("role") or "").strip()
        ]
        if not messages:
            raise HTTPException(status_code=400, detail="Sample must contain at least one message.")

        fill_existing_assistant = False
        if messages[-1]["role"] == "assistant":
            if messages[-1]["content"].strip():
                raise HTTPException(
                    status_code=400,
                    detail="Last message is already an assistant response. Add a user message or clear the assistant message first.",
                )
            fill_existing_assistant = True
            request_messages = messages[:-1]
        else:
            request_messages = messages

        if not request_messages:
            raise HTTPException(status_code=400, detail="Sample must contain at least one non-empty prompt message.")

        current_config = load_config(config_dir)
        headers = {"content-type": "application/json"}
        if current_config.get("api_key"):
            headers["authorization"] = f"Bearer {current_config['api_key']}"
        upstream_url = build_vllm_url(current_config["vllm_endpoint"], "chat/completions")

        async with httpx.AsyncClient(follow_redirects=True, timeout=120.0) as client:
            upstream_response = await client.post(
                upstream_url,
                headers=headers,
                json={
                    "model": payload.model,
                    "messages": request_messages,
                    "max_tokens": payload.max_tokens,
                    "temperature": payload.temperature,
                },
            )

        if not upstream_response.is_success:
            detail = upstream_response.text or f"Upstream completion failed: {upstream_response.status_code}"
            raise HTTPException(status_code=upstream_response.status_code, detail=detail)

        completion_payload = upstream_response.json()
        content = extract_content_from_message_payload(completion_payload)

        if fill_existing_assistant:
            next_messages = request_messages + [{"role": "assistant", "content": content}]
        else:
            next_messages = messages + [{"role": "assistant", "content": content}]

        return {
            "sample": {
                **sample,
                "messages": next_messages,
            }
        }

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
    def update_dataset(dataset_id: str, payload: UpdateDatasetRequest) -> dict[str, Any]:
        serialized = serialize_model(payload)
        training_file_id = serialized.get("training_file_id")
        if training_file_id:
            validate_training_file(str(training_file_id))
        try:
            return store.update_dataset(dataset_id, serialized)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=f"Dataset not found: {dataset_id}") from exc

    @router.delete("/{dataset_id}")
    def delete_dataset(dataset_id: str) -> dict[str, Any]:
        try:
            store.delete_dataset(dataset_id)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=f"Dataset not found: {dataset_id}") from exc
        return {"id": dataset_id, "object": "dataset.deleted", "deleted": True}

    return router
