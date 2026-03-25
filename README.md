# lawftrack

`lawftrack` is a local fine-tuning workspace for vLLM-compatible models.
It gives you:

- a simple installer and CLI
- a local gateway with an OpenAI-compatible `/v1` interface
- a browser UI for datasets, sample editing, and fine-tuning jobs

If you want to fine-tune a model without stitching together multiple tools by hand, this is the main use case.

## Quick Start

Install:

```bash
./install.sh
```

Or run the installer directly from GitHub:

```bash
curl -fsSL https://raw.githubusercontent.com/longern/lawftrack/main/install.sh | sh
```

Optional installer flags:

- `--headless`: install the backend without the packaged web UI
- `--skip-wizard`: finish installation without opening the setup wizard

After installation, run:

```bash
lawftrack wizard
```

The wizard will ask for:

- your vLLM endpoint, usually `http://localhost:8000/v1`
- your API key, if your backend requires one
- whether to install the gateway as a background service

Then start the local gateway:

```bash
lawftrack gateway
```

By default, it listens on `http://127.0.0.1:5293`.

## Typical Flow

For most users, the workflow is:

1. Connect a vLLM-compatible backend.
2. Import or create a dataset.
3. Edit samples in the browser UI.
4. Start a fine-tuning job.
5. Use the trained model through the local gateway.

## What You Can Do in the UI

- import datasets from `.yaml`, `.yml`, `.json`, and `.jsonl`
- create, edit, and delete samples
- edit assistant responses at token level
- manage uploaded training files
- launch and monitor fine-tuning jobs
- check local gateway and service status

## Common Commands

```bash
lawftrack --version
lawftrack wizard
lawftrack config
lawftrack update
lawftrack gateway
lawftrack gateway start
lawftrack gateway stop
lawftrack gateway status
```

You can also run it as a Python module:

```bash
python3 -m lawftrack
```

## Notes

- `lawftrack` stores its config in `~/.lawftrack/config.json`.
- `lawftrack update` upgrades the current installation.
- If you install the gateway as a service, you can keep it running in the background and open the UI in a browser when needed.

If your training output is a LoRA adapter, `lawftrack` can automatically try to load it into vLLM after a successful SFT job. For that to work, vLLM must be started with LoRA support enabled.

## For Developers

If you are developing `lawftrack` itself:

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -e .
python3 -m pip install ".[server]"
cd frontend
npm install
```

Run tests with:

```bash
python3 -m unittest discover -s tests
```
