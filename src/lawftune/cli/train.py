from __future__ import annotations

import argparse


def run_train_command(args: argparse.Namespace) -> int:
    from lawftune.train.cli import run_train_worker

    args.config_dir = args.config_dir.expanduser()
    return run_train_worker(args)
