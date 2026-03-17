from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


def make_env(**extra: str) -> dict[str, str]:
    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT / "src")
    env.update(extra)
    return env


class CliTests(unittest.TestCase):
    def test_module_invocation(self) -> None:
        result = subprocess.run(
            [sys.executable, "-m", "lawftune"],
            cwd=ROOT,
            env=make_env(),
            capture_output=True,
            text=True,
            check=False,
        )

        self.assertEqual(result.returncode, 0)
        self.assertIn("lawftune CLI is ready.", result.stdout)

    def test_version_flag(self) -> None:
        result = subprocess.run(
            [sys.executable, "-m", "lawftune", "--version"],
            cwd=ROOT,
            env=make_env(),
            capture_output=True,
            text=True,
            check=False,
        )

        self.assertEqual(result.returncode, 0)
        self.assertIn("lawftune 0.1.0", result.stdout)

    def test_install_wizard_uses_defaults(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            result = subprocess.run(
                [sys.executable, "-m", "lawftune", "install"],
                cwd=ROOT,
                env=make_env(LAWFTUNE_HOME=temp_dir),
                input="\n\n",
                capture_output=True,
                text=True,
                check=False,
            )

            self.assertEqual(result.returncode, 0)
            self.assertIn("Configuration saved to", result.stdout)

            config_path = Path(temp_dir) / "config.json"
            self.assertTrue(config_path.exists())
            self.assertEqual(
                json.loads(config_path.read_text(encoding="utf-8")),
                {
                    "vllm_endpoint": "http://localhost:8000",
                    "api_key": "",
                },
            )

    def test_install_wizard_accepts_custom_values(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            result = subprocess.run(
                [sys.executable, "-m", "lawftune", "install"],
                cwd=ROOT,
                env=make_env(LAWFTUNE_HOME=temp_dir),
                input="http://127.0.0.1:9000\nsecret-key\n",
                capture_output=True,
                text=True,
                check=False,
            )

            self.assertEqual(result.returncode, 0)

            config_path = Path(temp_dir) / "config.json"
            self.assertEqual(
                json.loads(config_path.read_text(encoding="utf-8")),
                {
                    "vllm_endpoint": "http://127.0.0.1:9000",
                    "api_key": "secret-key",
                },
            )


if __name__ == "__main__":
    unittest.main()
