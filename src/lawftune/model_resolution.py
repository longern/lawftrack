from __future__ import annotations

from pathlib import Path

from lawftune.config import load_raw_config


MODEL_MARKER_FILENAMES = (
    "config.json",
    "tokenizer_config.json",
    "tokenizer.json",
    "tokenizer.model",
    "adapter_config.json",
    "model.safetensors",
    "pytorch_model.bin",
)


def is_model_directory(path: Path) -> bool:
    if not path.is_dir():
        return False
    if any((path / filename).exists() for filename in MODEL_MARKER_FILENAMES):
        return True
    if any(path.glob("*.safetensors")):
        return True
    if any(path.glob("*.bin")):
        return True
    return False


def get_models_dir(config_dir: Path | None = None) -> Path | None:
    payload = load_raw_config(config_dir)
    raw_value = payload.get("models_dir")
    if raw_value is None:
        return None
    models_dir = str(raw_value).strip()
    if not models_dir:
        return None
    return Path(models_dir).expanduser()


def iter_model_directory_candidates(
    model_name_or_path: str,
    *,
    config_dir: Path | None = None,
) -> list[Path]:
    models_dir = get_models_dir(config_dir)
    if models_dir is None:
        return []

    normalized = model_name_or_path.strip().strip("/")
    if not normalized:
        return []

    candidates = [
        models_dir / normalized,
        models_dir / Path(normalized).name,
    ]
    deduped: list[Path] = []
    seen: set[Path] = set()
    for candidate in candidates:
        if candidate in seen:
            continue
        seen.add(candidate)
        deduped.append(candidate)
    return deduped


def resolve_model_reference(
    model_name_or_path: str,
    *,
    config_dir: Path | None = None,
) -> str:
    normalized = model_name_or_path.strip()
    if not normalized:
        return normalized

    explicit_path = Path(normalized).expanduser()
    if is_model_directory(explicit_path):
        return str(explicit_path)

    for candidate in iter_model_directory_candidates(
        normalized,
        config_dir=config_dir,
    ):
        if is_model_directory(candidate):
            return str(candidate)

    return normalized
