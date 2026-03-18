from __future__ import annotations

import argparse
import json


def run_config_command(
    args: argparse.Namespace,
    *,
    get_config_dir,
    load_raw_config,
    get_config_value,
    set_config_value,
    parse_config_value,
) -> int:
    config_dir = args.config_dir.expanduser() if args.config_dir is not None else get_config_dir()

    if args.action == "show":
        print(json.dumps(load_raw_config(config_dir), indent=2))
        return 0

    if args.key is None:
        raise SystemExit("Config key path is required for this action.")

    if args.action == "get":
        try:
            value = get_config_value(args.key, config_dir)
        except KeyError as exc:
            raise SystemExit(f"Config key not found: {args.key}") from exc

        if isinstance(value, str):
            print(value)
        else:
            print(json.dumps(value))
        return 0

    if args.value is None:
        raise SystemExit("Config value is required for `config set`.")

    config_path = set_config_value(
        args.key,
        parse_config_value(args.value),
        config_dir,
    )
    print(f"Configuration saved to {config_path}")
    return 0
