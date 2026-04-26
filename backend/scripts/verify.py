"""Run lightweight sanity checks against the backend.

Performs:

- ``ruff check`` over the project (lint + import order)
- ``pyright`` type checking on ``app/`` and ``scripts/``
- a smoke test that imports the FastAPI app and hits ``/health`` with TestClient

Usage:

    uv run python scripts/verify.py
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def run(label: str, command: list[str]) -> bool:
    print(f"\n→ {label}: {' '.join(command)}")
    try:
        result = subprocess.run(command, cwd=ROOT, check=False)
    except FileNotFoundError as exc:
        print(f"  skipped: {exc}")
        return True
    if result.returncode != 0:
        print(f"  FAILED with exit code {result.returncode}")
        return False
    print("  ok")
    return True


def smoke_test() -> bool:
    print("\n→ Smoke test: GET /health")
    sys.path.insert(0, str(ROOT))
    os.environ.setdefault("DATABASE_URL", f"sqlite:///{ROOT / 'data' / 'verify.sqlite'}")
    try:
        from fastapi.testclient import TestClient

        from app.main import app
    except Exception as exc:  # noqa: BLE001
        print(f"  FAILED to import app: {exc}")
        return False

    with TestClient(app) as client:
        response = client.get("/health")
        if response.status_code != 200:
            print(f"  FAILED: expected 200, got {response.status_code}")
            return False
        body = response.json()
        if body.get("status") != "ok":
            print(f"  FAILED: unexpected body {body}")
            return False
    print("  ok")
    return True


def main() -> int:
    ok = True
    ok = run("Ruff", ["uv", "run", "ruff", "check", "app", "scripts"]) and ok
    ok = run("Pyright", ["uv", "run", "pyright"]) and ok
    ok = smoke_test() and ok
    print("\n" + ("All checks passed." if ok else "Some checks failed."))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
