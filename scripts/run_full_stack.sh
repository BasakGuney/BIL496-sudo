#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PY_API_DIR="$ROOT_DIR/project/server/src/services/analysis/python_api"
PY_VENV_DIR="$PY_API_DIR/.venv"
PYTHON_BIN_DEFAULT="${PYTHON_BIN:-$PY_VENV_DIR/bin/python3}"
SERVER_DIR="$ROOT_DIR/project/server"
CLIENT_DIR="$ROOT_DIR/project/client"
LOG_DIR="$ROOT_DIR/.run-logs"
INSTALL_ONLY="${INSTALL_ONLY:-0}"
SKIP_CLIENT="${SKIP_CLIENT:-0}"
SKIP_SERVER="${SKIP_SERVER:-0}"
SKIP_PY_API="${SKIP_PY_API:-0}"
ALLOW_VISION_FALLBACK="${ALLOW_VISION_FALLBACK:-0}"

mkdir -p "$LOG_DIR"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[ERROR] Required command not found: $1" >&2
    exit 1
  fi
}

require_cmd python3
require_cmd npm

if [ ! -d "$PY_VENV_DIR" ]; then
  echo "[setup] Creating Python virtual environment at $PY_VENV_DIR"
  python3 -m venv "$PY_VENV_DIR"
fi

if [ ! -x "$PYTHON_BIN_DEFAULT" ]; then
  echo "[ERROR] Python interpreter not found at $PYTHON_BIN_DEFAULT" >&2
  exit 1
fi

PIP_BIN="$PY_VENV_DIR/bin/pip"

echo "[setup] Installing Python dependencies"
"$PIP_BIN" install --upgrade pip >/dev/null
"$PIP_BIN" install -r "$PY_API_DIR/requirements.txt"

echo "[setup] Verifying vision runtime (MediaPipe + OpenCV)"
VISION_HEALTH="$("$PYTHON_BIN_DEFAULT" "$PY_API_DIR/frame_face_analyzer.py" <<'EOF'
{"mode":"health"}
EOF
)"
echo "$VISION_HEALTH"
if ! printf '%s' "$VISION_HEALTH" | grep -q '"source": "mediapipe"'; then
  if [ "$ALLOW_VISION_FALLBACK" = "1" ]; then
    echo "[warn] MediaPipe is not active. Continuing with OpenCV fallback because ALLOW_VISION_FALLBACK=1."
  else
    echo "[ERROR] MediaPipe is not active in the configured Python environment." >&2
    echo "        Re-run with a supported Python version for mediapipe, or set ALLOW_VISION_FALLBACK=1 to continue with OpenCV." >&2
    exit 1
  fi
fi

echo "[setup] Installing server npm dependencies"
npm --prefix "$SERVER_DIR" install

echo "[setup] Installing client npm dependencies"
npm --prefix "$CLIENT_DIR" install

if [ "$INSTALL_ONLY" = "1" ]; then
  echo "[done] Dependencies are installed. Export this if needed:"
  echo "       PYTHON_BIN=$PYTHON_BIN_DEFAULT"
  exit 0
fi

PIDS=()
cleanup() {
  local exit_code=$?
  for pid in "${PIDS[@]:-}"; do
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" >/dev/null 2>&1 || true
      wait "$pid" >/dev/null 2>&1 || true
    fi
  done
  exit "$exit_code"
}
trap cleanup EXIT INT TERM

if [ "$SKIP_PY_API" != "1" ]; then
  echo "[run] Starting Python analysis API on http://localhost:8000"
  (
    cd "$PY_API_DIR"
    exec "$PYTHON_BIN_DEFAULT" api.py
  ) >"$LOG_DIR/python-api.log" 2>&1 &
  PIDS+=("$!")
fi

if [ "$SKIP_SERVER" != "1" ]; then
  echo "[run] Starting Node backend with PYTHON_BIN=$PYTHON_BIN_DEFAULT"
  (
    cd "$SERVER_DIR"
    export PYTHON_BIN="$PYTHON_BIN_DEFAULT"
    exec npm run dev
  ) >"$LOG_DIR/server.log" 2>&1 &
  PIDS+=("$!")
fi

if [ "$SKIP_CLIENT" != "1" ]; then
  echo "[run] Starting Vite client on http://localhost:5173"
  (
    cd "$CLIENT_DIR"
    exec npm run dev -- --host 0.0.0.0
  ) >"$LOG_DIR/client.log" 2>&1 &
  PIDS+=("$!")
fi

cat <<EOF
[ready] Processes started.
  Python API log : $LOG_DIR/python-api.log
  Server log     : $LOG_DIR/server.log
  Client log     : $LOG_DIR/client.log

Useful environment flags:
  INSTALL_ONLY=1  -> install deps only, do not start services
  SKIP_PY_API=1   -> do not start Python analysis API
  SKIP_SERVER=1   -> do not start Node backend
  SKIP_CLIENT=1   -> do not start Vite client
  ALLOW_VISION_FALLBACK=1 -> continue even if MediaPipe health check falls back to OpenCV

Press Ctrl+C to stop everything started by this script.
EOF

wait
