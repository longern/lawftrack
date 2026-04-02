from __future__ import annotations

import json
import shutil
import time
import uuid
from pathlib import Path
from typing import Any

import yaml

from .files_store import FileStore
from ..config import get_config_dir


class DuplicateDatasetNameError(ValueError):
    pass


class DatasetStore:
    def __init__(self, config_dir: Path | None = None) -> None:
        self.config_dir = (
            config_dir if config_dir is not None else get_config_dir()
        ).expanduser()
        self.datasets_dir = self.config_dir / "datasets"
        self.datasets_dir.mkdir(parents=True, exist_ok=True)
        self.file_store = FileStore(config_dir)

    def list_datasets(self) -> list[dict[str, Any]]:
        datasets: list[dict[str, Any]] = []
        for dataset in self._iter_dataset_records():
            datasets.append(self._enrich_dataset(dataset))
        datasets.sort(key=lambda item: int(item.get("updated_at", 0)), reverse=True)
        return datasets

    def create_dataset(self, payload: dict[str, Any]) -> dict[str, Any]:
        now = int(time.time())
        dataset_id = f"ds-{uuid.uuid4().hex[:24]}"
        dataset_name = self._normalize_dataset_name(payload.get("name"))
        self._ensure_unique_dataset_name(dataset_name)
        dataset = self._build_dataset_record(
            dataset_id,
            now,
            {
                "name": dataset_name,
                "base_model": payload.get("base_model"),
            },
        )
        self._write_dataset(dataset)
        self._write_samples(dataset_id, [])
        return self._enrich_dataset(dataset)

    def import_metadata_file(self, *, filename: str, content: bytes) -> dict[str, Any]:
        payload = yaml.safe_load(content.decode("utf-8")) or {}
        if not isinstance(payload, dict):
            raise ValueError("Dataset YAML metadata must be a mapping.")

        now = int(time.time())
        dataset_id = f"ds-{uuid.uuid4().hex[:24]}"
        dataset_name = self._normalize_dataset_name(
            payload.get("name") or Path(filename).stem
        )
        self._ensure_unique_dataset_name(dataset_name)
        dataset = self._build_dataset_record(
            dataset_id,
            now,
            {
                "name": dataset_name,
                "base_model": payload.get("base_model"),
            },
        )
        self._write_dataset(dataset)
        self._write_samples(dataset_id, [])
        return self._enrich_dataset(dataset)

    def import_training_data_file(
        self,
        *,
        filename: str,
        content: bytes,
        content_type: str | None = None,
    ) -> dict[str, Any]:
        now = int(time.time())
        dataset_id = f"ds-{uuid.uuid4().hex[:24]}"
        dataset_name = self._normalize_dataset_name(Path(filename).stem)
        self._ensure_unique_dataset_name(dataset_name)
        dataset = self._build_dataset_record(
            dataset_id,
            now,
            {
                "name": dataset_name,
                "base_model": None,
            },
        )
        self._write_dataset(dataset)
        self._write_samples(
            dataset_id,
            self._build_samples_from_training_content(
                dataset_id=dataset_id,
                filename=filename,
                content=content,
            ),
        )
        return self._enrich_dataset(dataset)

    def _build_dataset_record(
        self,
        dataset_id: str,
        now: int,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        return {
            "id": dataset_id,
            "object": "dataset",
            "name": payload["name"],
            "created_at": now,
            "updated_at": now,
            "base_model": payload.get("base_model"),
        }

    def get_dataset(self, dataset_id: str) -> dict[str, Any]:
        return self._enrich_dataset(self._load_dataset(dataset_id))

    def list_samples(self, dataset_id: str) -> list[dict[str, Any]]:
        dataset = self._load_dataset(dataset_id)
        samples = self._load_or_bootstrap_samples(dataset)
        return [dict(sample) for sample in samples]

    def get_sample(self, dataset_id: str, sample_id: str) -> dict[str, Any]:
        dataset = self._load_dataset(dataset_id)
        samples = self._load_or_bootstrap_samples(dataset)
        for sample in samples:
            if str(sample.get("id")) == sample_id:
                return dict(sample)
        raise FileNotFoundError(sample_id)

    def create_sample(self, dataset_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        dataset = self._load_dataset(dataset_id)
        samples = self._load_or_bootstrap_samples(dataset)
        now = int(time.time())
        sample_index = len(samples) + 1
        messages = self._normalize_messages(payload.get("messages")) or [
            {"role": "user", "content": ""},
            {"role": "assistant", "content": ""},
        ]
        annotations = self._normalize_annotations(payload)
        sample = {
            "id": f"sample-{sample_index:04d}",
            "object": "dataset.sample",
            "dataset_id": dataset_id,
            "title": str(payload.get("title") or self._derive_sample_title(messages, sample_index - 1)),
            "created_at": now,
            "updated_at": now,
            "messages": messages,
            "tools": self._normalize_tools(payload.get("tools")),
            "edits": annotations,
            "anchors": annotations,
        }
        samples.append(sample)
        self._write_samples(dataset_id, samples)
        return dict(sample)

    def update_sample(
        self,
        dataset_id: str,
        sample_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        dataset = self._load_dataset(dataset_id)
        samples = self._load_or_bootstrap_samples(dataset)

        for index, sample in enumerate(samples):
            if str(sample.get("id")) != sample_id:
                continue
            annotations = self._normalize_annotations(payload)

            samples[index] = {
                **sample,
                "title": payload.get("title") or sample.get("title") or f"样本 {index + 1}",
                "messages": self._normalize_messages(payload.get("messages")),
                "tools": (
                    self._normalize_tools(payload.get("tools"))
                    if "tools" in payload
                    else self._normalize_tools(sample.get("tools"))
                ),
                "edits": annotations,
                "anchors": annotations,
                "updated_at": int(time.time()),
            }
            self._write_samples(dataset_id, samples)
            return dict(samples[index])

        raise FileNotFoundError(sample_id)

    def delete_sample(self, dataset_id: str, sample_id: str) -> None:
        dataset = self._load_dataset(dataset_id)
        samples = self._load_or_bootstrap_samples(dataset)

        next_samples = [
            sample
            for sample in samples
            if str(sample.get("id")) != sample_id
        ]
        if len(next_samples) == len(samples):
            raise FileNotFoundError(sample_id)

        self._write_samples(dataset_id, next_samples)

    def update_dataset(self, dataset_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        dataset = self._load_dataset(dataset_id)
        if "name" in payload:
            dataset_name = self._normalize_dataset_name(payload.get("name"))
            self._ensure_unique_dataset_name(
                dataset_name,
                exclude_dataset_id=dataset_id,
            )
            dataset["name"] = dataset_name
        if "base_model" in payload:
            dataset["base_model"] = payload["base_model"]
        dataset.pop("training_file_id", None)
        dataset.pop("training_filename", None)
        dataset["updated_at"] = int(time.time())
        self._write_dataset(dataset)
        return self._enrich_dataset(dataset)

    def delete_dataset(self, dataset_id: str) -> None:
        dataset_dir = self.datasets_dir / dataset_id
        dataset_path = dataset_dir / "dataset.yaml"
        if not dataset_path.is_file():
            raise FileNotFoundError(dataset_id)
        shutil.rmtree(dataset_dir)

    def export_training_file(
        self,
        dataset_id: str,
        *,
        method_type: str,
    ) -> tuple[dict[str, Any], int]:
        dataset = self._load_dataset(dataset_id)
        samples = self._load_or_bootstrap_samples(dataset)
        records = self._build_training_records(samples, method_type=method_type)
        if not records:
            raise ValueError("Dataset does not contain any exportable training samples.")
        created_file = self.file_store.create_file(
            filename=self._build_export_filename(dataset, method_type=method_type),
            purpose="fine-tune",
            content=self._serialize_training_records(records),
            content_type="application/jsonl",
        )
        return created_file, len(records)

    def export_dataset_file(self, dataset_id: str) -> tuple[dict[str, Any], int]:
        dataset = self._load_dataset(dataset_id)
        samples = self._load_or_bootstrap_samples(dataset)
        payload = {
            "name": dataset.get("name"),
            "base_model": dataset.get("base_model"),
            "samples": [self._serialize_dataset_sample(sample) for sample in samples],
        }
        created_file = self.file_store.create_file(
            filename=self._build_export_filename(
                dataset,
                method_type="dataset",
                file_extension=".json",
            ),
            purpose="dataset",
            content=(json.dumps(payload, ensure_ascii=False, indent=2) + "\n").encode("utf-8"),
            content_type="application/json",
        )
        return created_file, len(samples)

    def _load_dataset(self, dataset_id: str) -> dict[str, Any]:
        dataset_path = self.datasets_dir / dataset_id / "dataset.yaml"
        if not dataset_path.is_file():
            raise FileNotFoundError(dataset_id)
        return self._load_dataset_path(dataset_path)

    def _load_dataset_path(self, dataset_path: Path) -> dict[str, Any]:
        payload = yaml.safe_load(dataset_path.read_text(encoding="utf-8")) or {}
        if not isinstance(payload, dict):
            raise ValueError(f"Dataset metadata must be a mapping: {dataset_path}")
        return payload

    def _iter_dataset_records(self) -> list[dict[str, Any]]:
        datasets: list[dict[str, Any]] = []
        for dataset_dir in self.datasets_dir.iterdir():
            dataset_path = dataset_dir / "dataset.yaml"
            if not dataset_path.is_file():
                continue
            datasets.append(self._load_dataset_path(dataset_path))
        return datasets

    def _normalize_dataset_name(self, value: Any) -> str:
        name = str(value or "").strip()
        if not name:
            raise ValueError("Dataset name is required.")
        return name

    def _ensure_unique_dataset_name(
        self,
        name: str,
        *,
        exclude_dataset_id: str | None = None,
    ) -> None:
        target_name = name.casefold()
        for dataset in self._iter_dataset_records():
            existing_id = str(dataset.get("id") or "")
            if exclude_dataset_id and existing_id == exclude_dataset_id:
                continue
            existing_name = str(dataset.get("name") or "").strip()
            if existing_name.casefold() == target_name:
                raise DuplicateDatasetNameError(
                    f"Dataset name already exists: {name}"
                )

    def _write_dataset(self, dataset: dict[str, Any]) -> None:
        dataset_dir = self.datasets_dir / str(dataset["id"])
        dataset_dir.mkdir(parents=True, exist_ok=True)
        dataset_path = dataset_dir / "dataset.yaml"
        dataset_path.write_text(
            yaml.safe_dump(dataset, sort_keys=False, allow_unicode=True),
            encoding="utf-8",
        )

    def _samples_path(self, dataset_id: str) -> Path:
        dataset_dir = self.datasets_dir / dataset_id
        dataset_dir.mkdir(parents=True, exist_ok=True)
        return dataset_dir / "samples.json"

    def _load_or_bootstrap_samples(self, dataset: dict[str, Any]) -> list[dict[str, Any]]:
        dataset_id = str(dataset["id"])
        samples_path = self._samples_path(dataset_id)
        if samples_path.is_file():
            payload = json.loads(samples_path.read_text(encoding="utf-8"))
            if isinstance(payload, list):
                return [self._normalize_sample(item, idx) for idx, item in enumerate(payload)]

        training_file_id = dataset.get("training_file_id")
        if not training_file_id:
            samples: list[dict[str, Any]] = []
            self._write_samples(dataset_id, samples)
            return samples

        metadata = self.file_store.get_file(str(training_file_id))
        content = self.file_store.get_file_content(str(training_file_id))
        samples = self._build_samples_from_training_content(
            dataset_id=dataset_id,
            filename=str(metadata.get("filename") or "train.jsonl"),
            content=content,
        )
        self._write_samples(dataset_id, samples)
        return samples

    def _bootstrap_samples_for_dataset(self, dataset: dict[str, Any]) -> list[dict[str, Any]]:
        dataset_id = str(dataset["id"])
        training_file_id = dataset.get("training_file_id")
        if not training_file_id:
            self._write_samples(dataset_id, [])
            return []
        metadata = self.file_store.get_file(str(training_file_id))
        content = self.file_store.get_file_content(str(training_file_id))
        samples = self._build_samples_from_training_content(
            dataset_id=dataset_id,
            filename=str(metadata.get("filename") or "train.jsonl"),
            content=content,
        )
        self._write_samples(dataset_id, samples)
        return samples

    def _build_samples_from_training_content(
        self,
        *,
        dataset_id: str,
        filename: str,
        content: bytes,
    ) -> list[dict[str, Any]]:
        now = int(time.time())
        records: list[dict[str, Any]] = []
        suffix = Path(filename).suffix.lower()
        text = content.decode("utf-8")

        if suffix == ".json":
            parsed = json.loads(text)
            iterable = self._normalize_training_iterable(parsed)
        else:
            iterable = [
                json.loads(line)
                for line in text.splitlines()
                if line.strip()
            ]

        for index, item in enumerate(iterable):
            if not isinstance(item, dict):
                continue
            messages = self._extract_messages_from_record(item)
            annotations = self._normalize_annotations(item)
            records.append(
                {
                    "id": f"sample-{index + 1:04d}",
                    "object": "dataset.sample",
                    "dataset_id": dataset_id,
                    "title": self._derive_sample_title(messages, index),
                    "created_at": now,
                    "updated_at": now,
                    "messages": messages,
                    "tools": self._normalize_tools(item.get("tools")),
                    "edits": annotations,
                    "anchors": annotations,
                }
            )
        return records

    def _build_training_records(
        self,
        samples: list[dict[str, Any]],
        *,
        method_type: str,
    ) -> list[dict[str, Any]]:
        normalized_method = str(method_type).strip().lower() or "sft"
        records: list[dict[str, Any]] = []
        for sample in samples:
            if normalized_method == "lawf":
                records.extend(self._build_lawf_training_records_for_sample(sample))
            else:
                records.extend(self._build_sft_training_records_for_sample(sample))
        return records

    def _build_sft_training_records_for_sample(
        self,
        sample: dict[str, Any],
    ) -> list[dict[str, Any]]:
        messages = self._normalize_messages(sample.get("messages"))
        if not messages:
            return []
        record: dict[str, Any] = {"messages": messages}
        tools = self._normalize_tools(sample.get("tools"))
        if tools:
            record["tools"] = tools
        return [record]

    def _build_lawf_training_records_for_sample(
        self,
        sample: dict[str, Any],
    ) -> list[dict[str, Any]]:
        messages = self._normalize_messages(sample.get("messages"))
        if not messages:
            return []

        annotations = self._normalize_annotations(sample)
        assistant_indices = [
            index
            for index, message in enumerate(messages)
            if message.get("role") == "assistant" and str(message.get("content") or "").strip()
        ]
        records: list[dict[str, Any]] = []
        tools = self._normalize_tools(sample.get("tools"))
        for assistant_index in assistant_indices:
            prompt_messages = messages[:assistant_index]
            completion_messages = [messages[assistant_index]]
            anchors = [
                {
                    key: value
                    for key, value in annotation.items()
                    if key != "message_index"
                }
                for annotation in annotations
                if int(annotation.get("message_index", -1)) == assistant_index
            ]
            records.append(
                {
                    "prompt": prompt_messages,
                    "completion": completion_messages,
                    "anchors": anchors,
                    **({"tools": tools} if tools else {}),
                }
            )
        return records

    def _build_export_filename(
        self,
        dataset: dict[str, Any],
        *,
        method_type: str,
        file_extension: str = ".jsonl",
    ) -> str:
        raw_name = str(dataset.get("name") or dataset.get("id") or "dataset")
        slug = "".join(
            character if character.isalnum() or character in {"-", "_", "."} else "-"
            for character in raw_name
        ).strip("-.")
        return f"{slug or 'dataset'}-{method_type}{file_extension}"

    def _serialize_training_records(self, records: list[dict[str, Any]]) -> bytes:
        if not records:
            return b""
        return (
            "\n".join(json.dumps(record, ensure_ascii=False) for record in records) + "\n"
        ).encode("utf-8")

    def _serialize_dataset_sample(self, sample: dict[str, Any]) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "id": str(sample.get("id") or ""),
            "title": str(sample.get("title") or ""),
            "created_at": int(sample.get("created_at", time.time())),
            "updated_at": int(sample.get("updated_at", time.time())),
            "messages": self._normalize_messages(sample.get("messages")),
            "anchors": self._normalize_annotations(sample),
        }
        tools = self._normalize_tools(sample.get("tools"))
        if tools:
            payload["tools"] = tools
        return payload

    def _derive_sample_title(
        self,
        messages: list[dict[str, Any]],
        index: int,
    ) -> str:
        for message in messages:
            if message.get("role") == "user" and message.get("content"):
                return str(message["content"])[:24] or f"样本 {index + 1}"
        return f"样本 {index + 1}"

    def _normalize_messages(self, payload: Any) -> list[dict[str, Any]]:
        messages: list[dict[str, Any]] = []
        if not isinstance(payload, list):
            return messages
        for item in payload:
            if not isinstance(item, dict):
                continue
            role = str(item.get("role") or "").strip()
            content = str(item.get("content") or "")
            reasoning_value = item.get("reasoning")
            if reasoning_value is None:
                reasoning_value = item.get("reasoning_content")
            reasoning = (
                None
                if reasoning_value is None
                else str(reasoning_value)
            )
            tool_call_id = (
                None
                if item.get("tool_call_id") is None
                else str(item.get("tool_call_id") or "")
            )
            name = None if item.get("name") is None else str(item.get("name") or "")
            tool_calls = self._normalize_tool_calls(item.get("tool_calls"))
            if not role:
                continue
            message: dict[str, Any] = {"role": role, "content": content}
            if reasoning:
                message["reasoning"] = reasoning
            if tool_call_id:
                message["tool_call_id"] = tool_call_id
            if name:
                message["name"] = name
            if tool_calls:
                message["tool_calls"] = tool_calls
            messages.append(message)
        return messages

    def _normalize_tools(self, payload: Any) -> list[dict[str, Any]]:
        tools: list[dict[str, Any]] = []
        if not isinstance(payload, list):
            return tools
        for item in payload:
            if not isinstance(item, dict):
                continue
            normalized = self._normalize_tool_definition(item)
            if normalized:
                tools.append(normalized)
        return tools

    def _normalize_tool_definition(self, payload: dict[str, Any]) -> dict[str, Any] | None:
        tool_type = str(payload.get("type") or "function").strip() or "function"
        function_payload = payload.get("function")
        if isinstance(function_payload, dict):
            name = str(function_payload.get("name") or "").strip()
            if not name:
                return None
            normalized_function: dict[str, Any] = {"name": name}
            if function_payload.get("description") is not None:
                normalized_function["description"] = str(function_payload.get("description") or "")
            parameters = function_payload.get("parameters")
            if isinstance(parameters, dict):
                normalized_function["parameters"] = parameters
            return {
                "type": tool_type,
                "function": normalized_function,
            }

        name = str(payload.get("name") or "").strip()
        if not name:
            return None
        normalized_function = {"name": name}
        if payload.get("description") is not None:
            normalized_function["description"] = str(payload.get("description") or "")
        parameters = payload.get("parameters")
        if not isinstance(parameters, dict):
            parameters = payload.get("input_schema")
        if isinstance(parameters, dict):
            normalized_function["parameters"] = parameters
        return {
            "type": tool_type,
            "function": normalized_function,
        }

    def _normalize_tool_calls(self, payload: Any) -> list[dict[str, Any]]:
        tool_calls: list[dict[str, Any]] = []
        if not isinstance(payload, list):
            return tool_calls
        for item in payload:
            if not isinstance(item, dict):
                continue
            normalized = self._normalize_tool_call(item)
            if normalized:
                tool_calls.append(normalized)
        return tool_calls

    def _normalize_tool_call(self, payload: dict[str, Any]) -> dict[str, Any] | None:
        function_payload = payload.get("function")
        name = ""
        arguments = ""
        if isinstance(function_payload, dict):
            name = str(function_payload.get("name") or "").strip()
            arguments = str(function_payload.get("arguments") or "")
        else:
            name = str(payload.get("name") or "").strip()
            input_payload = payload.get("input")
            if isinstance(input_payload, dict):
                arguments = json.dumps(input_payload, ensure_ascii=False)
            elif input_payload is not None:
                arguments = str(input_payload)
            else:
                arguments = str(payload.get("arguments") or "")
        if not name:
            return None
        normalized_call: dict[str, Any] = {
            "type": str(payload.get("type") or "function").strip() or "function",
            "function": {
                "name": name,
                "arguments": arguments,
            },
        }
        if payload.get("id") is not None:
            normalized_call["id"] = str(payload.get("id") or "")
        return normalized_call

    def _normalize_edits(self, payload: Any) -> list[dict[str, Any]]:
        edits: list[dict[str, Any]] = []
        if not isinstance(payload, list):
            return edits
        for item in payload:
            if not isinstance(item, dict):
                continue
            edits.append(
                {
                    "message_index": int(item.get("message_index", 0)),
                    "token_index": int(item.get("token_index", 0)),
                    "target": (
                        "reasoning"
                        if str(item.get("target") or "content").strip().lower() == "reasoning"
                        else "content"
                    ),
                    "original_token": (
                        None if item.get("original_token") is None else str(item.get("original_token") or "")
                    ),
                    "replacement_token": str(item.get("replacement_token") or ""),
                    "regenerated_from_token_index": (
                        None
                        if item.get("regenerated_from_token_index") is None
                        else int(item.get("regenerated_from_token_index"))
                    ),
                    "created_at": int(item.get("created_at", time.time())),
                }
            )
        return edits

    def _normalize_annotations(self, payload: Any) -> list[dict[str, Any]]:
        if isinstance(payload, dict):
            if isinstance(payload.get("anchors"), list):
                return self._normalize_edits(payload.get("anchors"))
            if isinstance(payload.get("edits"), list):
                return self._normalize_edits(payload.get("edits"))
            return []
        return self._normalize_edits(payload)

    def _normalize_message_group(
        self,
        payload: Any,
        *,
        default_role: str,
    ) -> list[dict[str, Any]]:
        if isinstance(payload, list):
            return self._normalize_messages(payload)
        if payload is None:
            return []
        return [{"role": default_role, "content": str(payload)}]

    def _extract_messages_from_record(self, payload: dict[str, Any]) -> list[dict[str, Any]]:
        messages = self._normalize_messages(payload.get("messages"))
        if messages:
            return messages

        prompt_messages = self._normalize_message_group(payload.get("prompt"), default_role="user")
        completion_messages = self._normalize_message_group(
            payload.get("completion"),
            default_role="assistant",
        )
        return prompt_messages + completion_messages

    def _normalize_training_iterable(self, payload: Any) -> list[dict[str, Any]]:
        if isinstance(payload, list):
            return [item for item in payload if isinstance(item, dict)]
        if not isinstance(payload, dict):
            return []
        samples = payload.get("samples")
        if isinstance(samples, list):
            return [item for item in samples if isinstance(item, dict)]
        entries = payload.get("entries")
        if isinstance(entries, list):
            return [
                self._build_record_from_session_entry(item)
                for item in entries
                if isinstance(item, dict)
            ]
        return [payload]

    def _build_record_from_session_entry(self, payload: dict[str, Any]) -> dict[str, Any]:
        request_payload = payload.get("request")
        response_payload = payload.get("response")
        if not isinstance(request_payload, dict):
            return payload

        messages = self._build_messages_from_session_request(request_payload)
        assistant_message = self._build_message_from_session_response(response_payload)
        if assistant_message is not None:
            messages.append(assistant_message)
        return {
            "messages": messages,
            "tools": self._normalize_tools(request_payload.get("tools")),
        }

    def _build_messages_from_session_request(
        self,
        payload: dict[str, Any],
    ) -> list[dict[str, Any]]:
        messages: list[dict[str, Any]] = []
        for raw_message in payload.get("messages") or []:
            if not isinstance(raw_message, dict):
                continue
            role = str(raw_message.get("role") or "").strip()
            if not role:
                continue
            content = raw_message.get("content")
            if not isinstance(content, list):
                normalized = self._normalize_messages([raw_message])
                messages.extend(normalized)
                continue

            text_parts: list[str] = []
            reasoning_parts: list[str] = []
            tool_calls: list[dict[str, Any]] = []
            tool_messages: list[dict[str, Any]] = []
            for part in content:
                if not isinstance(part, dict):
                    continue
                part_type = str(part.get("type") or "").strip()
                if part_type == "text":
                    text = str(part.get("text") or "")
                    if text:
                        text_parts.append(text)
                    continue
                if part_type == "thinking":
                    thinking = str(part.get("thinking") or "")
                    if thinking:
                        reasoning_parts.append(thinking)
                    continue
                if part_type == "tool_use":
                    normalized_call = self._normalize_tool_call(part)
                    if normalized_call:
                        tool_calls.append(normalized_call)
                    continue
                if part_type == "tool_result":
                    tool_messages.append(
                        {
                            "role": "tool",
                            "content": str(part.get("content") or ""),
                            "tool_call_id": str(part.get("tool_use_id") or ""),
                            **(
                                {"name": str(part.get("name") or "")}
                                if part.get("name") is not None
                                else {}
                            ),
                        }
                    )

            if role != "user" or text_parts:
                normalized_message: dict[str, Any] = {
                    "role": role,
                    "content": "\n".join(text_parts),
                }
                if reasoning_parts:
                    normalized_message["reasoning"] = "\n".join(reasoning_parts)
                if tool_calls:
                    normalized_message["tool_calls"] = tool_calls
                if normalized_message["content"] or reasoning_parts or tool_calls:
                    messages.append(normalized_message)
            messages.extend(tool_messages)
        return messages

    def _build_message_from_session_response(
        self,
        payload: Any,
    ) -> dict[str, Any] | None:
        if not isinstance(payload, dict):
            return None
        choices = payload.get("choices")
        if not isinstance(choices, list) or not choices:
            return None
        first_choice = choices[0]
        if not isinstance(first_choice, dict):
            return None
        message_payload = first_choice.get("message")
        if not isinstance(message_payload, dict):
            return None

        normalized_messages = self._normalize_messages(
            [
                {
                    "role": message_payload.get("role"),
                    "content": message_payload.get("content") or "",
                    "reasoning": message_payload.get("reasoning"),
                    "reasoning_content": message_payload.get("reasoning_content"),
                    "tool_calls": message_payload.get("tool_calls"),
                    "tool_call_id": message_payload.get("tool_call_id"),
                    "name": message_payload.get("name"),
                }
            ]
        )
        return normalized_messages[0] if normalized_messages else None

    def _normalize_sample(self, payload: Any, index: int) -> dict[str, Any]:
        if not isinstance(payload, dict):
            raise ValueError("Dataset sample payload must be a mapping.")
        sample_id = str(payload.get("id") or f"sample-{index + 1:04d}")
        messages = self._extract_messages_from_record(payload)
        annotations = self._normalize_annotations(payload)
        return {
            "id": sample_id,
            "object": "dataset.sample",
            "dataset_id": str(payload.get("dataset_id") or ""),
            "title": str(payload.get("title") or self._derive_sample_title(messages, index)),
            "created_at": int(payload.get("created_at", time.time())),
            "updated_at": int(payload.get("updated_at", time.time())),
            "messages": messages,
            "tools": self._normalize_tools(payload.get("tools")),
            "edits": annotations,
            "anchors": annotations,
        }

    def _write_samples(self, dataset_id: str, samples: list[dict[str, Any]]) -> None:
        samples_path = self._samples_path(dataset_id)
        samples_path.write_text(
            json.dumps(samples, indent=2, ensure_ascii=True) + "\n",
            encoding="utf-8",
        )

    def _enrich_dataset(self, dataset: dict[str, Any]) -> dict[str, Any]:
        enriched = dict(dataset)
        enriched.pop("training_file_id", None)
        enriched.pop("training_filename", None)
        try:
            enriched["sample_count"] = len(self._load_or_bootstrap_samples(dataset))
        except Exception:
            enriched["sample_count"] = 0
        return enriched
