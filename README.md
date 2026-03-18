# lawftune

`lawftune` is a Python CLI that stores vLLM connection settings locally and runs a local gateway service.

## Quick Start

For end users, use the installer:

```bash
./install.sh
```

If you want to skip packaging the browser UI:

```bash
./install.sh --headless
```

If you want to finish installation without launching the setup wizard immediately:

```bash
./install.sh --skip-wizard
```

That installer will:

- build the Vite frontend bundle
- create an isolated virtualenv under `~/.lawftune/runtime`
- install `lawftune` and the gateway dependencies
- create a `lawftune` launcher script
- offer to add the launcher directory to your shell `PATH`
- automatically start the `lawftune wizard` setup flow unless `--skip-wizard` is used

When `--headless` is used, the gateway API is still installed, but the packaged web UI is omitted.

For developers, install the project in editable mode:

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -e .
python3 -m pip install ".[server]"
```

Initialize frontend dependencies:

```bash
cd frontend
npm install
```

Run the setup wizard:

```bash
lawftune wizard
```

The wizard will:

- ask for the vLLM endpoint, default `http://localhost:8000/v1`
- ask for the API key, default empty
- save the config to `~/.lawftune/config.json`
- ask whether the gateway should also be installed as a system service

Start the gateway in the foreground:

```bash
lawftune gateway
```

The default bind address is `127.0.0.1:5293`.

## Common Commands

```bash
lawftune --version
lawftune wizard
lawftune update
lawftune gateway
lawftune gateway status
lawftune gateway start
lawftune gateway stop
```

You can also launch the package as a module:

```bash
python3 -m lawftune
```

## Gateway

`lawftune gateway` runs the local FastAPI gateway and loads config from `~/.lawftune/config.json` by default.
The browser UI is served from the standalone [frontend/](/Users/longsiyu/workspace/lawftune/frontend) workspace so it can evolve separately from the Python backend.

For frontend development:

```bash
cd frontend
npm run dev
```

For a production build served by the Python gateway:

```bash
cd frontend
npm run build
```

That build outputs packaged assets into [src/lawftune/_frontend](/Users/longsiyu/workspace/lawftune/src/lawftune/_frontend).

Available endpoints:

- `GET /` serves the local gateway UI
- `GET /status` returns a basic gateway status payload
- `GET /healthz` returns a health check payload
- `GET /config` returns the configured vLLM endpoint and whether an API key is set

You can override runtime options when starting it in the foreground:

```bash
lawftune gateway --host 127.0.0.1 --port 5293
```

## Updates

`lawftune update` upgrades the current installation using the same Python runtime that is running the CLI.

```bash
lawftune update
lawftune update /path/to/lawftune
lawftune update https://github.com/your-org/lawftune.git
lawftune update --dry-run
```

When no source is provided, `lawftune` tries to reuse the current installation source. If that cannot be detected, it falls back to `lawftune[server]`.

## System Service

The gateway can also be managed as a user-level system service:

```bash
lawftune gateway install
lawftune gateway start
lawftune gateway stop
lawftune gateway restart
lawftune gateway status
lawftune gateway uninstall
```

Supported backends:

- macOS: `launchd` user agent
- Linux: `systemd --user`
- Windows: Task Scheduler task

You can define the gateway host, port, and config directory during installation:

```bash
lawftune gateway install --host 127.0.0.1 --port 5293
```

After successful service installation, `lawftune` prints the local gateway URL so users can open it directly.

## Tests

```bash
python3 -m unittest discover -s tests
```
