from __future__ import annotations

import logging
from contextlib import nullcontext
from typing import Any

import torch
import torch.nn.functional as F
from transformers.trainer import _is_peft_model
from trl import SFTTrainer
from trl.trainer.utils import pad


def _get_anchor_token_index(anchor: dict[str, Any]) -> int | None:
    raw_index = anchor.get("token_index", anchor.get("position"))
    if isinstance(raw_index, int):
        return raw_index
    return None


def _normalize_message_list(payload: Any) -> list[dict[str, str]]:
    if not isinstance(payload, list):
        return []

    messages: list[dict[str, str]] = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        role = str(item.get("role") or "").strip()
        if not role:
            continue
        messages.append({"role": role, "content": str(item.get("content") or "")})
    return messages


def _resolve_prompt_completion_row(
    row: dict[str, Any],
) -> tuple[list[dict[str, str]] | str, list[dict[str, str]] | str, list[dict[str, Any]], Any]:
    tools = row.get("tools")
    prompt = row.get("prompt")
    completion = row.get("completion")
    anchors = row.get("anchors") or []

    if prompt is not None and completion is not None:
        return prompt, completion, anchors, tools

    messages = _normalize_message_list(row.get("messages"))
    if not messages:
        raise ValueError("LAwF record must include messages or prompt/completion.")

    raw_completion_index = row.get("completion_message_index")
    completion_index = raw_completion_index if isinstance(raw_completion_index, int) else None
    if completion_index is None or not (0 <= completion_index < len(messages)):
        completion_index = next(
            (
                index
                for index in range(len(messages) - 1, -1, -1)
                if messages[index].get("role") == "assistant"
            ),
            None,
        )
    if completion_index is None:
        raise ValueError("LAwF messages record must contain at least one assistant message.")

    prompt_messages = messages[:completion_index]
    completion_messages = [messages[completion_index]]
    normalized_anchors = [
        dict(anchor)
        for anchor in anchors
        if isinstance(anchor, dict)
        and (
            anchor.get("message_index") is None
            or int(anchor.get("message_index", -1)) == completion_index
        )
    ]
    for anchor in normalized_anchors:
        anchor.pop("message_index", None)
    return prompt_messages, completion_messages, normalized_anchors, tools


class LAwFDataCollator:
    def __init__(self, model, tokenizer):
        self.model = model
        self.tokenizer = tokenizer

    def tokenize_row(self, row):
        prompt, completion, anchor_records, tools = _resolve_prompt_completion_row(row)
        is_conversational_format = isinstance(prompt, list)
        if is_conversational_format:
            prompt_messages = prompt
            completion_messages = completion if isinstance(completion, list) else []
            prompt = self.tokenizer.apply_chat_template(
                prompt,
                tools=tools,
                add_generation_prompt=True,
                tokenize=False,
            )
            prompt_completion = self.tokenizer.apply_chat_template(
                prompt_messages + completion_messages,
                tools=tools,
                tokenize=False,
            )
        else:
            prompt = str(prompt)
            prompt_completion = prompt + str(completion)

        prompt_ids = (
            self.tokenizer(prompt, return_tensors="pt")
            .input_ids.squeeze(0)
            .to(self.model.device)
        )
        prompt_completion_ids = (
            self.tokenizer(prompt_completion, return_tensors="pt")
            .input_ids.squeeze(0)
            .to(self.model.device)
        )
        completion_ids = prompt_completion_ids[..., prompt_ids.size(-1) :]

        anchors = torch.zeros_like(completion_ids)
        anchor_confidence = torch.zeros_like(completion_ids, dtype=torch.float)

        token_indices = torch.tensor(
            [
                index
                for anchor in anchor_records
                if (index := _get_anchor_token_index(anchor)) is not None
                and 0 <= index < completion_ids.size(-1)
            ],
            device=anchors.device,
            dtype=torch.long,
        )
        confidences = torch.tensor(
            [
                0.999 if anchor.get("confidence") is None else anchor["confidence"]
                for anchor in anchor_records
                if (index := _get_anchor_token_index(anchor)) is not None
                and 0 <= index < completion_ids.size(-1)
            ],
            device=anchors.device,
            dtype=torch.float,
        )
        anchors[token_indices] = 1
        anchor_confidence[token_indices] = confidences

        return {
            "prompt_ids": prompt_ids,
            "prompt_completion_ids": prompt_completion_ids,
            "completion_ids": completion_ids,
            "anchors": anchors,
            "anchor_confidence": anchor_confidence,
        }

    def __call__(self, dataset):
        collated = [self.tokenize_row(row) for row in dataset]

        assert len(collated) > 0, "No data."

        def pad_ids(key, padding_side="right"):
            return pad(
                [record[key] for record in collated],
                padding_value=self.tokenizer.pad_token_id,
                padding_side=padding_side,
            )

        def pad_mask(key, padding_value=0, padding_side="right"):
            return pad(
                [torch.ones_like(record[key]) for record in collated],
                padding_value=padding_value,
                padding_side=padding_side,
            )

        prompt_ids = pad_ids("prompt_ids", padding_side="left")
        prompt_mask = pad_mask("prompt_ids", padding_side="left")
        completion_ids = pad_ids("completion_ids")
        completion_mask = pad_mask("completion_ids")
        anchors = pad([record["anchors"] for record in collated])
        anchor_confidence = pad([record["anchor_confidence"] for record in collated])
        input_ids = torch.cat([prompt_ids, completion_ids], dim=-1)
        attention_mask = torch.cat([prompt_mask, completion_mask], dim=-1)

        with torch.inference_mode():
            if _is_peft_model(self.model):
                model_context = self.model.disable_adapter()
            else:
                model_context = nullcontext()

            with model_context:
                outputs = self.model(input_ids=input_ids, attention_mask=attention_mask)
                teacher_logits = outputs.logits[:, prompt_ids.size(-1) - 1 : -1, :]

        labels = None
        if collated[0].get("labels"):
            labels = pad_mask("labels", padding_value=-100, padding_side="right").to(
                "cpu"
            )

        return {
            "input_ids": input_ids.to("cpu"),
            "attention_mask": attention_mask.to("cpu"),
            "teacher_logits": teacher_logits.to("cpu"),
            "anchors": anchors.to("cpu"),
            "anchor_confidence": anchor_confidence.to("cpu"),
            "labels": labels,
        }


class LAwFTrainer(SFTTrainer):
    _tag_names = ["trl", "lawf"]

    def __init__(self, *args, **kwargs):
        is_model_str = False
        processing_class = kwargs.get("processing_class") or kwargs.get("tokenizer")
        if kwargs.get("processing_class") is None and processing_class is not None:
            kwargs["processing_class"] = processing_class

        if kwargs.get("data_collator") is None:
            ref_model = kwargs.pop("ref_model", None)
            if ref_model is not None:
                model = ref_model
            else:
                model = kwargs.get("model") or args[0]
                is_model_str = isinstance(model, str)
                is_peft_model = kwargs.get("peft_config") is not None or _is_peft_model(
                    model
                )

                if not is_peft_model:
                    logging.warning(
                        "Using training model itself as the reference model is dangerous."
                    )

            kwargs["data_collator"] = LAwFDataCollator(model, processing_class)

        super().__init__(*args, **kwargs)

        if is_model_str:
            kwargs["data_collator"].model = self.model
        self._anchor_prob_sum = 0.0
        self._anchor_prob_count = 0

    def _processing_class(self):
        return getattr(self, "processing_class", None) or getattr(self, "tokenizer")

    def _set_signature_columns_if_needed(self):
        if self._signature_columns is None:
            self._signature_columns = [
                "prompt",
                "completion",
                "messages",
                "completion_message_index",
                "tools",
                "teacher_logits",
                "anchors",
                "anchor_confidence",
            ]

    def _prepare_dataset(self, dataset, *args, **kwargs):
        return dataset

    def log(self, logs: dict[str, float], *args, **kwargs) -> None:
        if self._anchor_prob_count > 0:
            logs = dict(logs)
            logs["anchor_probs"] = self._anchor_prob_sum / self._anchor_prob_count
            self._anchor_prob_sum = 0.0
            self._anchor_prob_count = 0
        super().log(logs, *args, **kwargs)

    def compute_loss(
        self, model, inputs, num_items_in_batch=None, return_outputs=False
    ):
        completion_length = inputs["teacher_logits"].size(-2)
        completion_ids = inputs["input_ids"][..., -completion_length:]

        outputs = model(
            inputs["input_ids"],
            attention_mask=inputs["attention_mask"],
            use_cache=False,
        )
        student_logits = outputs.logits[:, -completion_length - 1 : -1, :]

        p_student = F.softmax(student_logits, dim=-1)
        target_probs = F.softmax(inputs["teacher_logits"], dim=-1)

        anchors = inputs["anchors"]
        alpha = inputs["anchor_confidence"][anchors == 1].unsqueeze(-1)
        one_hot = F.one_hot(
            completion_ids[anchors == 1], num_classes=student_logits.size(-1)
        ).float()
        mixed = alpha * one_hot + (1 - alpha) * target_probs[anchors == 1]
        target_probs[anchors == 1] = mixed

        distill_topk = 4
        _, idx_topk = torch.topk(target_probs, distill_topk, dim=-1)

        tgt_teacher = target_probs.gather(-1, idx_topk)
        rest_teacher = torch.clamp_min(1 - tgt_teacher.sum(dim=-1, keepdim=True), 1e-10)
        tgt_teacher = torch.cat((tgt_teacher, rest_teacher), dim=-1)
        tgt_student = p_student.gather(-1, idx_topk)
        rest_student = torch.clamp_min(1 - tgt_student.sum(dim=-1, keepdim=True), 1e-10)
        tgt_student = torch.cat((tgt_student, rest_student), dim=-1)

        kl = F.kl_div(
            input=tgt_student.log(), target=tgt_teacher, reduction="none"
        ).sum(dim=-1)

        mask = inputs.get(
            "loss_mask", inputs["attention_mask"][..., -completion_length:]
        ).float()
        loss = (kl * mask).sum() / mask.sum()

        student_probs = F.softmax(student_logits, dim=-1)
        anchor_probs = student_probs[anchors == 1, completion_ids[anchors == 1]]
        if anchor_probs.numel() > 0:
            self._anchor_prob_sum += float(anchor_probs.detach().sum().item())
            self._anchor_prob_count += int(anchor_probs.numel())

        return (loss, outputs) if return_outputs else loss
