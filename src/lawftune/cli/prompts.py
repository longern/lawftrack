from __future__ import annotations


def prompt_value(label: str, default: str) -> str:
    default_text = f" [{default}]" if default else ""
    value = input(f"{label}{default_text}: ").strip()
    return default if value == "" else value


def prompt_yes_no(label: str, default: bool = False) -> bool:
    default_hint = "Y/n" if default else "y/N"
    value = input(f"{label} [{default_hint}]: ").strip().lower()
    if value == "":
        return default
    return value in {"y", "yes"}
