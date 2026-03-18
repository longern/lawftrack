#!/usr/bin/env sh

set -eu

APP_NAME="lawftune"
OS_NAME="$(uname -s)"
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
DEFAULT_INSTALL_DIR="$HOME/.lawftune/runtime"
DEFAULT_BIN_DIR="$HOME/.local/bin"
INSTALL_DIR="$DEFAULT_INSTALL_DIR"
BIN_DIR="$DEFAULT_BIN_DIR"
NO_MODIFY_SHELL=0
ASSUME_YES=0
HEADLESS_MODE=0
SKIP_WIZARD=0


usage() {
  cat <<EOF
Usage: ./install.sh [options]

Install ${APP_NAME} for end users on macOS or Linux.

Options:
  --install-dir PATH   Runtime install directory (default: ${DEFAULT_INSTALL_DIR})
  --bin-dir PATH       Directory where the launcher script will be created (default: ${DEFAULT_BIN_DIR})
  --headless           Install without bundling the frontend UI
  --skip-wizard        Do not automatically run \`${APP_NAME} wizard\` after installation
  --no-modify-shell    Do not offer to update your shell rc file
  --yes                Accept non-destructive prompts automatically
  -h, --help           Show this help message
EOF
}


expand_path() {
  case "$1" in
    "~")
      printf '%s\n' "$HOME"
      ;;
    "~/"*)
      printf '%s/%s\n' "$HOME" "${1#~/}"
      ;;
    *)
      printf '%s\n' "$1"
      ;;
  esac
}


prompt_yes_no() {
  message="$1"
  default_answer="$2"

  if [ "$ASSUME_YES" -eq 1 ]; then
    return 0
  fi

  if [ "$default_answer" = "yes" ]; then
    suffix="Y/n"
  else
    suffix="y/N"
  fi

  printf '%s [%s]: ' "$message" "$suffix"
  read -r answer
  answer="$(printf '%s' "$answer" | tr '[:upper:]' '[:lower:]')"

  if [ -z "$answer" ]; then
    [ "$default_answer" = "yes" ]
    return
  fi

  [ "$answer" = "y" ] || [ "$answer" = "yes" ]
}


detect_rc_file() {
  shell_name="$(basename "${SHELL:-}")"
  case "$shell_name" in
    zsh)
      printf '%s\n' "$HOME/.zshrc"
      ;;
    bash)
      printf '%s\n' "$HOME/.bashrc"
      ;;
    *)
      printf '\n'
      ;;
  esac
}


ensure_supported_os() {
  case "$OS_NAME" in
    Darwin|Linux)
      ;;
    *)
      printf 'Unsupported platform: %s. install.sh supports macOS and Linux only.\n' "$OS_NAME" >&2
      exit 1
      ;;
  esac
}


ensure_python() {
  if ! command -v python3 >/dev/null 2>&1; then
    printf 'python3 is required but was not found in PATH.\n' >&2
    exit 1
  fi
}


ensure_frontend_tooling() {
  if [ "$HEADLESS_MODE" -eq 1 ]; then
    return
  fi
  if ! command -v npm >/dev/null 2>&1; then
    printf 'npm is required to build the frontend but was not found in PATH.\n' >&2
    exit 1
  fi
}


create_virtualenv() {
  install_dir="$1"
  venv_dir="${install_dir}/.venv"
  mkdir -p "$install_dir"
  python3 -m venv "$venv_dir"
  printf '%s\n' "$venv_dir"
}


install_package() {
  venv_dir="$1"
  python_bin="${venv_dir}/bin/python"
  package_ref="${SCRIPT_DIR}[server]"
  "$python_bin" -m pip install --upgrade "$package_ref"
}


build_frontend() {
  if [ "$HEADLESS_MODE" -eq 1 ]; then
    printf 'Skipping frontend build. The installed gateway will run without the packaged web UI.\n'
    clear_packaged_frontend
    return
  fi
  printf 'Installing frontend dependencies...\n'
  (
    cd "${SCRIPT_DIR}/frontend"
    npm install
    printf 'Building frontend assets...\n'
    npm run build
  )
}


clear_packaged_frontend() {
  packaged_dir="${SCRIPT_DIR}/src/lawftune/_frontend"
  mkdir -p "$packaged_dir"
  find "$packaged_dir" -mindepth 1 ! -name '.gitignore' -exec rm -rf {} +
}


create_launcher() {
  target="$1"
  bin_dir="$2"
  launcher_path="${bin_dir}/${APP_NAME}"

  mkdir -p "$bin_dir"
  cat >"$launcher_path" <<EOF
#!/usr/bin/env sh
exec "$target" "\$@"
EOF
  chmod 755 "$launcher_path"
  printf '%s\n' "$launcher_path"
}


ensure_bin_dir_on_path() {
  bin_dir="$1"

  case ":$PATH:" in
    *":$bin_dir:"*)
      return
      ;;
  esac

  if [ "$NO_MODIFY_SHELL" -eq 1 ]; then
    printf 'Add %s to your PATH to use `%s` directly.\n' "$bin_dir" "$APP_NAME"
    return
  fi

  rc_file="$(detect_rc_file)"
  if [ -z "$rc_file" ]; then
    printf 'Add %s to your PATH to use `%s` directly.\n' "$bin_dir" "$APP_NAME"
    return
  fi

  export_line="export PATH=\"${bin_dir}:\$PATH\""
  if [ -f "$rc_file" ] && grep -F "$export_line" "$rc_file" >/dev/null 2>&1; then
    return
  fi

  if prompt_yes_no "Add ${bin_dir} to PATH in $(basename "$rc_file")?" "yes"; then
    {
      printf '\n# Added by %s installer\n' "$APP_NAME"
      printf '%s\n' "$export_line"
    } >>"$rc_file"
    printf 'Updated %s. Open a new shell or run `source %s`.\n' "$rc_file" "$rc_file"
  else
    printf 'Add %s to your PATH manually to use `%s` directly.\n' "$bin_dir" "$APP_NAME"
  fi
}


while [ "$#" -gt 0 ]; do
  case "$1" in
    --install-dir)
      [ "$#" -ge 2 ] || {
        printf '%s requires a path value.\n' "$1" >&2
        exit 1
      }
      INSTALL_DIR="$2"
      shift 2
      ;;
    --bin-dir)
      [ "$#" -ge 2 ] || {
        printf '%s requires a path value.\n' "$1" >&2
        exit 1
      }
      BIN_DIR="$2"
      shift 2
      ;;
    --headless)
      HEADLESS_MODE=1
      shift
      ;;
    --skip-wizard)
      SKIP_WIZARD=1
      shift
      ;;
    --no-modify-shell)
      NO_MODIFY_SHELL=1
      shift
      ;;
    --yes)
      ASSUME_YES=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown option: %s\n\n' "$1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

ensure_supported_os
ensure_python
ensure_frontend_tooling

INSTALL_DIR="$(expand_path "$INSTALL_DIR")"
BIN_DIR="$(expand_path "$BIN_DIR")"

printf 'Installing %s into %s\n' "$APP_NAME" "$INSTALL_DIR"

build_frontend
VENV_DIR="$(create_virtualenv "$INSTALL_DIR")"
install_package "$VENV_DIR"
EXECUTABLE="${VENV_DIR}/bin/${APP_NAME}"
LAUNCHER_PATH="${BIN_DIR}/${APP_NAME}"
create_launcher "$EXECUTABLE" "$BIN_DIR" >/dev/null

ensure_bin_dir_on_path "$BIN_DIR"

printf 'Installed launcher at %s\n' "$LAUNCHER_PATH"
if command -v "$APP_NAME" >/dev/null 2>&1; then
  printf '`%s` is ready.\n' "$APP_NAME"
else
  printf 'If your current shell still cannot find `%s`, open a new terminal and try again.\n' "$APP_NAME"
fi

if [ "$SKIP_WIZARD" -eq 1 ]; then
  printf 'Skipping `%s wizard`. Run `%s wizard` later when you are ready.\n' "$APP_NAME" "$APP_NAME"
else
  printf 'Starting `%s wizard`...\n' "$APP_NAME"
  "$EXECUTABLE" wizard
fi
