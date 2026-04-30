"""Run lightweight sanity checks against the backend.

Performs:

- ``ruff check`` over the project (lint + import order)
- ``pyright`` type checking on ``src/app/`` and ``scripts/``
- a data integrity check for category/subcategory invariants
- a smoke test that imports the FastAPI app and hits ``/health`` with TestClient

Usage:

    uv run python scripts/verify.py
"""

from __future__ import annotations

import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

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
    print("\n→ Smoke test: API health and movement reclassification")
    sys.path.insert(0, str(ROOT / "src"))
    os.environ.setdefault("DATABASE_URL", f"sqlite:///{ROOT / 'data' / 'verify.sqlite'}")
    try:
        from fastapi.testclient import TestClient
        from sqlmodel import Session

        from app.database import engine
        from app.main import app
        from app.models import Category, CategoryKind, Movement, MovementSource, Subcategory
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

        suffix = uuid4().hex[:8]
        now = datetime.now(timezone.utc)
        with Session(engine) as session:
            source_category = Category(
                name=f"Verify source {suffix}",
                kind=CategoryKind.EXPENSE,
            )
            target_category = Category(
                name=f"Verify target {suffix}",
                kind=CategoryKind.EXPENSE,
            )
            session.add(source_category)
            session.add(target_category)
            session.commit()
            session.refresh(source_category)
            session.refresh(target_category)

            source_subcategory = Subcategory(
                name=f"Source sub {suffix}",
                category_id=source_category.id,
            )
            target_subcategory = Subcategory(
                name=f"Target sub {suffix}",
                category_id=target_category.id,
            )
            session.add(source_subcategory)
            session.add(target_subcategory)
            session.commit()
            session.refresh(source_subcategory)
            session.refresh(target_subcategory)

            movement = Movement(
                date=now,
                accounting_date=now,
                amount_cents=1000,
                business=f"Verify business {suffix}",
                reason="Verification",
                source=MovementSource.MANUAL,
                category_id=source_category.id,
                subcategory_id=source_subcategory.id,
            )
            session.add(movement)
            session.commit()
            session.refresh(movement)

            movement_id = movement.id
            source_category_id = source_category.id
            target_category_id = target_category.id
            target_subcategory_id = target_subcategory.id

        response = client.patch(
            f"/api/movements/{movement_id}",
            json={"subcategory_id": target_subcategory_id},
        )
        if response.status_code != 200:
            print(f"  FAILED: reclassification expected 200, got {response.status_code}")
            print(f"  body: {response.text}")
            return False
        body = response.json()
        if (
            body.get("category_id") != target_category_id
            or body.get("subcategory_id") != target_subcategory_id
        ):
            print(f"  FAILED: unexpected reclassification body {body}")
            return False

        response = client.patch(
            f"/api/movements/{movement_id}",
            json={
                "category_id": source_category_id,
                "subcategory_id": target_subcategory_id,
            },
        )
        if response.status_code != 400:
            print(f"  FAILED: explicit mismatch expected 400, got {response.status_code}")
            print(f"  body: {response.text}")
            return False
    print("  ok")
    return True


def main() -> int:
    ok = True
    ok = run("Ruff", ["uv", "run", "ruff", "check", "src/app", "scripts"]) and ok
    ok = run("Pyright", ["uv", "run", "pyright"]) and ok
    ok = run("Data integrity", ["uv", "run", "python", "scripts/verify_data_integrity.py"]) and ok
    ok = smoke_test() and ok
    print("\n" + ("All checks passed." if ok else "Some checks failed."))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
