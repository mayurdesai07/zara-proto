#!/usr/bin/env bash
cd "$(dirname "$0")"
python3 -c "import flask" 2>/dev/null || python3 -m pip install --quiet flask 2>/dev/null || true
exec python3 app.py "$@"
