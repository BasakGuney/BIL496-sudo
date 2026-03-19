#!/usr/bin/env bash
set -euo pipefail

PY_BIN=${PY_BIN:-python3.11}

if ! command -v "$PY_BIN" >/dev/null 2>&1; then
  echo "Error: $PY_BIN not found. Install Python 3.10+ and retry." >&2
  exit 1
fi

"$PY_BIN" -m venv .venv
. .venv/bin/activate

if ! python -c "import tkinter" >/dev/null 2>&1; then
  echo "Warning: tkinter is not available in $PY_BIN." >&2
  echo "CLI probe will work, but Tk UI will not." >&2
  echo "To enable UI on macOS/Homebrew: brew install python-tk@3.11" >&2
fi

python -m pip install --upgrade pip
pip install -r requirements.txt

echo "Environment is ready. Activate with: source .venv/bin/activate"
