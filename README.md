# lawftune

A minimal Python CLI project scaffold that uses `setuptools` for reliable installation in offline-friendly environments.

## Local Development

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -e .
```

After installation, you can run:

```bash
lawftune
lawftune --version
lawftune install
lawftune gateway
lawftune gateway install
```

You can also launch it as a module:

```bash
python3 -m lawftune
```

## Installation Wizard

Running `lawftune install` starts an interactive setup flow for vLLM configuration. The configuration is saved to `~/.lawftune/config.json` by default.

- `vLLM endpoint` defaults to `http://localhost:8000`
- `API key` defaults to an empty value

You can also provide the values directly:

```bash
lawftune install --endpoint http://localhost:8000 --api-key ""
```

## Gateway

Run the gateway in the foreground with:

```bash
lawftune gateway
```

By default, the gateway starts on `127.0.0.1:5293` and reads configuration from `~/.lawftune/config.json`.

Available endpoints:

- `GET /` returns a basic gateway status payload
- `GET /healthz` returns a health check payload
- `GET /config` returns the configured vLLM endpoint and whether an API key is set

If you need to install server dependencies explicitly:

```bash
python3 -m pip install ".[server]"
```

## Managed Gateway

Use `lawftune gateway` for both foreground execution and OS-managed background control.

```bash
lawftune gateway install
lawftune gateway start
lawftune gateway stop
lawftune gateway restart
lawftune gateway status
lawftune gateway uninstall
```

Platform backends:

- macOS uses a user `launchd` agent
- Linux uses a user `systemd` service
- Windows uses a Task Scheduler task

You can define the gateway host, port, and config directory during installation:

```bash
lawftune gateway install --host 127.0.0.1 --port 5293
```

## Tests

```bash
python3 -m unittest discover -s tests
```
