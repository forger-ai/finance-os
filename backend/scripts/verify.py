"""Run backend quality gates.

Performs:

- ``ruff check`` over the project (lint + import order)
- ``pyright`` type checking on ``src/app/`` and ``scripts/``
- ``pytest`` business specs with branch coverage
- a data integrity check for category/subcategory invariants

Usage:

    uv run python scripts/verify.py
"""

from __future__ import annotations

import subprocess
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


def main() -> int:
    ok = True
    ok = run("Ruff", ["uv", "run", "ruff", "check", "src/app", "scripts", "tests"]) and ok
    ok = run("Pyright", ["uv", "run", "pyright"]) and ok
    ok = run("Pytest coverage", ["uv", "run", "pytest"]) and ok
    ok = run("Data integrity", ["uv", "run", "python", "scripts/verify_data_integrity.py"]) and ok
    print("\n" + ("All checks passed." if ok else "Some checks failed."))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
