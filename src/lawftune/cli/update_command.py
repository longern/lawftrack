from __future__ import annotations

import argparse


def run_update_command(args: argparse.Namespace) -> int:
    from lawftune.update import run_update

    return run_update(args.source, dry_run=args.dry_run, assume_yes=args.yes)
