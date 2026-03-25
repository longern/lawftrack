from __future__ import annotations

import sys
from dataclasses import dataclass


@dataclass(frozen=True)
class WizardBack:
    pass


BACK = WizardBack()


def prompt_text_step(
    *,
    label: str,
    default: str,
    help_text: str | None = None,
) -> str | WizardBack:
    if _can_use_prompt_toolkit():
        return _prompt_toolkit_text_step(
            label=label,
            default=default,
            help_text=help_text,
        )
    return _fallback_text_step(
        label=label,
        default=default,
        help_text=help_text,
    )


def prompt_select_step(
    *,
    message: str,
    choices: list[str],
    default_index: int = 0,
) -> int | WizardBack:
    if _can_use_prompt_toolkit():
        return _prompt_toolkit_select_step(
            message=message,
            choices=choices,
            default_index=default_index,
        )
    return _fallback_select_step(
        message=message,
        choices=choices,
        default_index=default_index,
    )


def _can_use_prompt_toolkit() -> bool:
    if not sys.stdin.isatty() or not sys.stdout.isatty():
        return False
    try:
        import prompt_toolkit  # noqa: F401
    except ModuleNotFoundError:
        return False
    return True


def _prompt_toolkit_text_step(
    *,
    label: str,
    default: str,
    help_text: str | None,
) -> str | WizardBack:
    from prompt_toolkit import prompt
    from prompt_toolkit.formatted_text import HTML
    from prompt_toolkit.key_binding import KeyBindings
    from prompt_toolkit.styles import Style

    bindings = KeyBindings()

    @bindings.add("escape")
    @bindings.add("c-b")
    def _back(event) -> None:
        event.app.exit(result=BACK)

    style = Style.from_dict(
        {
            "prompt": "#2563EB bold",
            "label": "bold",
            "hint": "#64748B",
            "default": "#2563EB",
        }
    )

    prompt_parts = [
        ("", "\n"),
        ("class:prompt", "◆  "),
        ("class:label", label),
    ]
    if default:
        prompt_parts.extend(
            [
                ("", " "),
                ("class:default", f"[{default}]"),
            ]
        )
    prompt_parts.extend(
        [
            ("", "\n"),
        ]
    )
    if help_text:
        prompt_parts.extend(
            [
                ("class:hint", f"│  {help_text}\n"),
            ]
        )
    prompt_parts.extend(
        [
            ("class:hint", "│  Esc/Ctrl-B: back\n"),
            ("", "└─ "),
        ]
    )

    value = prompt(
        prompt_parts,
        default=default,
        key_bindings=bindings,
        style=style,
    )
    if value is BACK:
        return BACK
    return value.strip()


def _prompt_toolkit_select_step(
    *,
    message: str,
    choices: list[str],
    default_index: int,
) -> int | WizardBack:
    from prompt_toolkit.application import Application
    from prompt_toolkit.formatted_text import StyleAndTextTuples
    from prompt_toolkit.key_binding import KeyBindings
    from prompt_toolkit.layout import Layout
    from prompt_toolkit.layout.containers import Window
    from prompt_toolkit.layout.controls import FormattedTextControl
    from prompt_toolkit.styles import Style

    selected_index = max(0, min(default_index, len(choices) - 1))

    def get_text() -> StyleAndTextTuples:
        fragments: StyleAndTextTuples = [
            ("", "\n"),
            ("class:prompt", "◆  "),
            ("", message),
            ("", "\n"),
            ("class:hint", "│  Use ↑/↓ to move, Enter to confirm, Esc/Ctrl-B to go back.\n"),
        ]
        for index, choice in enumerate(choices):
            marker = "●" if index == selected_index else "○"
            style_name = "class:selected" if index == selected_index else ""
            fragments.extend(
                [
                    ("class:hint", "│  "),
                    (style_name, f"{marker} {choice}"),
                    ("", "\n"),
                ]
            )
        return fragments

    bindings = KeyBindings()

    @bindings.add("up")
    @bindings.add("k")
    def _up(event) -> None:
        nonlocal selected_index
        selected_index = (selected_index - 1) % len(choices)
        event.app.invalidate()

    @bindings.add("down")
    @bindings.add("j")
    def _down(event) -> None:
        nonlocal selected_index
        selected_index = (selected_index + 1) % len(choices)
        event.app.invalidate()

    @bindings.add("enter")
    def _enter(event) -> None:
        event.app.exit(result=selected_index)

    @bindings.add("escape")
    @bindings.add("c-b")
    def _back(event) -> None:
        event.app.exit(result=BACK)

    style = Style.from_dict(
        {
            "prompt": "#2563EB bold",
            "hint": "#64748B",
            "selected": "#2563EB bold",
        }
    )

    control = FormattedTextControl(get_text, focusable=True)
    window = Window(content=control, always_hide_cursor=True)
    app = Application(
        layout=Layout(window),
        key_bindings=bindings,
        full_screen=False,
        style=style,
    )
    return app.run()


def _fallback_text_step(
    *,
    label: str,
    default: str,
    help_text: str | None,
) -> str | WizardBack:
    print()
    if help_text:
        print(help_text)
    default_text = f" [{default}]" if default else ""
    value = input(f"{label}{default_text}: ").strip()
    if value.lower() == "back":
        return BACK
    return default if value == "" else value


def _fallback_select_step(
    *,
    message: str,
    choices: list[str],
    default_index: int,
) -> int | WizardBack:
    print()
    print(message)
    for index, choice in enumerate(choices, start=1):
        marker = "*" if index - 1 == default_index else " "
        print(f"  {marker} {index}. {choice}")
    value = input("Select a number or type 'back': ").strip().lower()
    if value == "back":
        return BACK
    if value == "":
        return default_index
    if len(choices) == 2 and value in {"y", "yes"}:
        return 0
    if len(choices) == 2 and value in {"n", "no"}:
        return 1
    try:
        selected = int(value) - 1
    except ValueError:
        return default_index
    if 0 <= selected < len(choices):
        return selected
    return default_index
