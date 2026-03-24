from __future__ import annotations

import argparse
from pathlib import Path

from ..service import ServiceManagerError


def gateway_access_url(host: str, port: int) -> str:
    if host in {"0.0.0.0", "::", ""}:
        display_host = "localhost"
    else:
        display_host = host
    return f"http://{display_host}:{port}"


def run_gateway(args: argparse.Namespace, *, get_config_dir) -> int:
    try:
        import uvicorn
    except ModuleNotFoundError as exc:
        raise SystemExit(
            "FastAPI gateway dependencies are missing. Install them with "
            '`python3 -m pip install ".[server]"`.'
        ) from exc

    from ..server import create_app

    config_dir = args.config_dir.expanduser() if args.config_dir is not None else get_config_dir()
    app = create_app(config_dir)
    uvicorn.run(app, host=args.host, port=args.port)
    return 0


def run_gateway_command(
    args: argparse.Namespace,
    *,
    get_config_dir,
    get_service_manager,
    build_service_config,
) -> int:
    config_dir = args.config_dir.expanduser() if args.config_dir is not None else get_config_dir()
    manager = get_service_manager()

    try:
        if args.action == "run":
            return run_gateway(args, get_config_dir=get_config_dir)
        if args.action == "install":
            service_config = build_service_config(
                host=args.host,
                port=args.port,
                config_dir=config_dir,
            )
            print(manager.install(service_config))
            print(f"Gateway URL: {gateway_access_url(service_config.host, service_config.port)}")
            return 0

        action = getattr(manager, args.action)
        print(action())
        return 0
    except ServiceManagerError as exc:
        raise SystemExit(str(exc)) from exc
