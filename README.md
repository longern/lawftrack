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

## Tests

```bash
python3 -m unittest discover -s tests
```
