from __future__ import annotations

import io
import json
from typing import Any

import pytest
from fastapi import UploadFile
from fastapi.testclient import TestClient
from sqlmodel import Session

from app.models import MovementSource
from tests.helpers import movement_payload

pytestmark = pytest.mark.bdd


def test_assistant_routes_cover_unavailable_not_found_and_error_branches(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.forger_desktop import ForgerDesktopRuntimeError, ForgerDesktopRuntimeUnavailable
    from app.routes import assistant

    # Given the desktop runtime reports hard status errors.
    monkeypatch.setattr(
        assistant,
        "get_agent_task_status",
        lambda: (_ for _ in ()).throw(ForgerDesktopRuntimeError("status failed")),
    )
    status = client.get("/api/assistant/status")
    assert status.status_code == 503
    assert status.json()["detail"] == "status failed"

    # And starting an assistant task can fail because the runtime is unavailable.
    monkeypatch.setattr(
        assistant,
        "start_agent_task",
        lambda **_kwargs: (_ for _ in ()).throw(
            ForgerDesktopRuntimeUnavailable("missing")
        ),
    )
    unavailable_start = client.post(
        "/api/assistant/tasks/budget-recommendation",
        json={"expectedIncome": "1000", "month": "5", "year": "2026", "locale": "es"},
    )
    assert unavailable_start.status_code == 503

    # When task lookup returns unavailable, runtime error, or no task.
    monkeypatch.setattr(
        assistant,
        "get_agent_task",
        lambda _run_id: (_ for _ in ()).throw(ForgerDesktopRuntimeUnavailable("missing")),
    )
    assert client.get("/api/assistant/tasks/run-1").status_code == 503
    monkeypatch.setattr(
        assistant,
        "get_agent_task",
        lambda _run_id: (_ for _ in ()).throw(ForgerDesktopRuntimeError("boom")),
    )
    assert client.get("/api/assistant/tasks/run-1").status_code == 502
    monkeypatch.setattr(assistant, "get_agent_task", lambda _run_id: None)
    assert client.get("/api/assistant/tasks/run-1").status_code == 404

    # Then cancel maps runtime unavailable and runtime errors explicitly too.
    monkeypatch.setattr(
        assistant,
        "cancel_agent_task",
        lambda _run_id: (_ for _ in ()).throw(ForgerDesktopRuntimeUnavailable("missing")),
    )
    assert client.post("/api/assistant/tasks/run-1/cancel").status_code == 503
    monkeypatch.setattr(
        assistant,
        "cancel_agent_task",
        lambda _run_id: (_ for _ in ()).throw(ForgerDesktopRuntimeError("boom")),
    )
    assert client.post("/api/assistant/tasks/run-1/cancel").status_code == 502


def test_assistant_movement_import_validates_inputs_and_preprocesses_documents(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.routes import assistant

    captured: dict[str, Any] = {}

    def capture_task(**kwargs: Any) -> dict[str, Any]:
        captured.update(kwargs)
        return {
            "runId": "run-import",
            "appId": "finance-os",
            "templateId": kwargs["template_id"],
            "status": "queued",
            "createdAt": "2026-05-17T00:00:00.000Z",
            "updatedAt": "2026-05-17T00:00:00.000Z",
            "progressLog": [],
        }

    monkeypatch.setattr(assistant, "start_agent_task", capture_task)

    # Given unsupported task parameters, the browser-safe endpoint rejects them early.
    bad_template = client.post(
        "/api/assistant/tasks/movement-import",
        data={"template_id": "unsupported"},
        files={"files": ("statement.csv", b"date,amount\n2026-05-01,100\n", "text/csv")},
    )
    assert bad_template.status_code == 400
    bad_locale = client.post(
        "/api/assistant/tasks/movement-import",
        data={"locale": "x" * 17},
        files={"files": ("statement.csv", b"date,amount\n2026-05-01,100\n", "text/csv")},
    )
    assert bad_locale.status_code == 400

    # Direct app calls cover the browser branch where the request has no files.
    async def call_without_files() -> None:
        await assistant.start_movement_import_task(
            files=[],
            template_id=assistant.DEFAULT_MOVEMENT_IMPORT_TEMPLATE,
            user_note="",
            locale="es",
        )

    with pytest.raises(assistant.HTTPException) as no_files:
        import anyio

        anyio.run(call_without_files)
    assert no_files.value.status_code == 400

    # When local preprocessing fails, the assistant still receives a warning payload.
    monkeypatch.setattr(
        assistant,
        "preprocess_document",
        lambda **_kwargs: (_ for _ in ()).throw(RuntimeError("extract failed")),
    )
    response = client.post(
        "/api/assistant/tasks/movement-import",
        files={"files": ("statement.csv", b"date,amount\n2026-05-01,100\n", "text/csv")},
    )

    # Then the runtime task contains the original file and a preprocess_error entry.
    assert response.status_code == 200, response.text
    documents = json.loads(
        captured["arguments"]["preprocessedDocuments"]["value"]
    )
    assert documents[0]["kind"] == "preprocess_error"
    assert documents[0]["warning"] == "extract failed"
    assert captured["arguments"]["statement"][0]["name"] == "statement.csv"

    # And total-size limits are enforced across multiple accepted files.
    monkeypatch.setattr(assistant, "MAX_FILE_BYTES", 100)
    monkeypatch.setattr(assistant, "MAX_TOTAL_BYTES", 12)
    too_large = client.post(
        "/api/assistant/tasks/movement-import",
        files=[
            ("files", ("one.csv", b"date,amount\n1", "text/csv")),
            ("files", ("two.csv", b"date,amount\n2", "text/csv")),
        ],
    )
    assert too_large.status_code == 413


def test_assistant_preprocessed_document_argument_truncates_or_rejects_large_payloads(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.routes import assistant

    # Given extracted text exceeds the assistant argument budget.
    monkeypatch.setattr(assistant, "MAX_PREPROCESSED_DOCUMENTS_CHARS", 260)
    payload = assistant._preprocessed_documents_argument(  # noqa: SLF001
        [
            {
                "filename": "statement.csv",
                "content_type": "text/csv",
                "kind": "csv",
                "text": "x" * 1_000,
                "row_count": 1,
                "page_count": None,
                "warning": "existing warning.",
            }
        ]
    )
    document = json.loads(payload)[0]
    assert len(payload) <= assistant.MAX_PREPROCESSED_DOCUMENTS_CHARS
    assert "shortened" in document["warning"]

    assert assistant._truncate_for_argument("abc", 0) == ""  # noqa: SLF001
    assert assistant._truncate_for_argument("abc", 10) == "abc"  # noqa: SLF001
    assert assistant._truncate_for_argument("abcdef", 3) == "abc"  # noqa: SLF001
    assert assistant._truncate_for_argument("x" * 100, 80).endswith(  # noqa: SLF001
        "[Truncated to fit the assistant task limit.]"
    )

    monkeypatch.setattr(assistant, "MAX_PREPROCESSED_DOCUMENTS_CHARS", 40)
    with pytest.raises(assistant.HTTPException) as too_large:
        assistant._preprocessed_documents_argument(  # noqa: SLF001
            [{"filename": "x" * 200, "text": "y" * 200}]
        )
    assert too_large.value.status_code == 413

    monkeypatch.setattr(assistant, "MAX_PREPROCESSED_DOCUMENTS_CHARS", 1_000)
    assistant._preprocessed_documents_argument(  # noqa: SLF001
        [
            {"filename": "a" * 350, "text": "x" * 800},
            {"filename": "b" * 350, "text": "y" * 800},
        ]
    )
    monkeypatch.setattr(assistant, "MAX_PREPROCESSED_DOCUMENTS_CHARS", 1_800)
    with pytest.raises(assistant.HTTPException):
        assistant._preprocessed_documents_argument(  # noqa: SLF001
            [
                {"filename": "a" * 800, "text": "x" * 800},
                {"filename": "b" * 800, "text": "y" * 800},
            ]
        )
    monkeypatch.setattr(assistant, "MAX_PREPROCESSED_DOCUMENTS_CHARS", 100)
    with pytest.raises(assistant.HTTPException):
        assistant._preprocessed_documents_argument(  # noqa: SLF001
            [{"filename": "c" * 200, "text": None}]
        )


def test_import_preprocess_document_and_local_extract_error_branches(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    category_tree: dict[str, dict[str, Any]],
) -> None:
    assert category_tree["expenses"]["id"]

    # Given local preprocessing requests, text files and validation errors are explicit.
    csv_response = client.post(
        "/api/imports/preprocess-document",
        files={"file": ("statement.csv", b"date,amount\n2026-05-01,100\n", "text/csv")},
    )
    assert csv_response.status_code == 200
    assert csv_response.json()["kind"] == "csv"
    assert csv_response.json()["row_count"] == 1

    unsupported_binary = client.post(
        "/api/imports/preprocess-document",
        files={"file": ("photo.png", b"\x89PNG", "image/png")},
    )
    assert unsupported_binary.status_code == 200
    assert unsupported_binary.json()["kind"] == "unsupported_binary"

    assert client.post(
        "/api/imports/preprocess-document",
        files={"file": ("empty.csv", b"", "text/csv")},
    ).status_code == 400
    assert client.post(
        "/api/imports/preprocess-document",
        files={"file": ("bad.csv", b"\xff", "text/csv")},
    ).status_code == 400

    from app.routes import imports

    monkeypatch.setattr(
        imports,
        "preprocess_document",
        lambda **_kwargs: (_ for _ in ()).throw(RuntimeError("cannot extract")),
    )
    preprocess_failed = client.post(
        "/api/imports/preprocess-document",
        files={"file": ("statement.pdf", b"%PDF", "application/pdf")},
    )
    assert preprocess_failed.status_code == 422
    assert "cannot extract" in preprocess_failed.json()["detail"]

    # And local import extraction rejects decode, empty workbook, and unsupported files.
    bad_csv = client.post(
        "/api/imports/movements-extract",
        files={"file": ("statement.csv", b"\xff", "text/csv")},
    )
    assert bad_csv.status_code == 400

    empty_xlsx = client.post(
        "/api/imports/movements-extract",
        files={
            "file": (
                "empty.xlsx",
                _xlsx_bytes([[]]),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    assert empty_xlsx.status_code == 400

    monkeypatch.setattr(imports, "xls_to_csv", lambda _raw: "")
    empty_xls = client.post(
        "/api/imports/movements-extract",
        files={"file": ("empty.xls", b"legacy workbook", "application/vnd.ms-excel")},
    )
    assert empty_xls.status_code == 400

    monkeypatch.setattr(
        imports,
        "xls_to_csv",
        lambda _raw: (_ for _ in ()).throw(RuntimeError("not a workbook")),
    )
    invalid_xls = client.post(
        "/api/imports/movements-extract",
        files={"file": ("statement.xls", b"not-xls", "application/vnd.ms-excel")},
    )
    assert invalid_xls.status_code == 400
    assert ".xls" in invalid_xls.json()["detail"]

    invalid_csv = client.post(
        "/api/imports/movements-csv",
        files={"file": ("statement.csv", b"\xff", "text/csv")},
    )
    assert invalid_csv.status_code == 400

    with pytest.raises(imports.HTTPException) as missing_name:
        import anyio
        from sqlmodel import Session

        from app.database import engine

        async def direct_call() -> None:
            with Session(engine) as direct_session:
                await imports.import_movements_csv(
                    file=UploadFile(file=io.BytesIO(b"date,amount\n2026-05-01,100\n")),
                    session=direct_session,
                )

        anyio.run(direct_call)
    assert missing_name.value.status_code == 400

    imported_csv = client.post(
        "/api/imports/movements-csv",
        files={
            "file": (
                "statement.csv",
                b"date,amount,business\n2026-05-01,100,Feria\n",
                "text/csv",
            )
        },
    )
    assert imported_csv.status_code == 200
    assert imported_csv.json()["inserted"] == 1
    empty_extract = client.post(
        "/api/imports/movements-extract",
        files={"file": ("statement.csv", b"", "text/csv")},
    )
    assert empty_extract.status_code == 400


def test_movement_summary_and_classification_memory_branches(
    client: TestClient,
    category_tree: dict[str, dict[str, Any]],
    session: Session,
) -> None:
    # Given no movements or reviewed history, summary and memory application are empty.
    empty_summary = client.get("/api/summary")
    assert empty_summary.status_code == 200
    assert empty_summary.json() == {
        "total": 0,
        "reviewed": 0,
        "sources": {"bank": 0, "credit_card": 0, "manual": 0},
    }
    no_memory = client.post("/api/movements/apply-classification-memory")
    assert no_memory.status_code == 200
    assert no_memory.json() == {"updated": 0}

    # When a reviewed movement teaches a business classification.
    reviewed = client.post(
        "/api/movements",
        json=movement_payload(
            category_id=category_tree["expenses"]["id"],
            subcategory_id=category_tree["groceries"]["id"],
            business="Cafe Uno",
            reviewed=True,
        ),
    )
    candidate = client.post(
        "/api/movements",
        json=movement_payload(
            category_id=category_tree["income"]["id"],
            subcategory_id=category_tree["salary"]["id"],
            business="Cafe Uno",
            amount=9_000,
        ),
    )
    other_source = client.post(
        "/api/movements",
        json=movement_payload(
            category_id=category_tree["expenses"]["id"],
            business="Transferencia",
            amount=2_000,
        )
        | {"source": MovementSource.BANK.value},
    )
    assert reviewed.status_code == 201
    assert candidate.status_code == 201
    assert other_source.status_code == 201

    # Then pending matches are suggested without marking them reviewed.
    applied = client.post("/api/movements/apply-classification-memory")
    assert applied.status_code == 200
    assert applied.json() == {"updated": 1}
    movements = {item["id"]: item for item in client.get("/api/movements").json()}
    updated_candidate = movements[candidate.json()["id"]]
    assert updated_candidate["category_id"] == category_tree["expenses"]["id"]
    assert updated_candidate["subcategory_id"] == category_tree["groceries"]["id"]
    assert updated_candidate["reviewed"] is False

    repeated = client.post("/api/movements/apply-classification-memory")
    assert repeated.status_code == 200
    assert repeated.json() == {"updated": 0}

    summary = client.get("/api/summary").json()
    assert summary["total"] == 3
    assert summary["reviewed"] == 1
    assert summary["sources"] == {"bank": 1, "credit_card": 0, "manual": 2}

    # And stale memory entries are ignored instead of breaking bulk suggestions.
    _update_movement_category_without_foreign_keys(
        session,
        movement_id=reviewed.json()["id"],
        category_id=category_tree["income"]["id"],
    )
    session.expire_all()
    assert client.post("/api/movements/apply-classification-memory").json() == {
        "updated": 0
    }


def test_category_migration_and_move_routes_cover_validation_edges(
    client: TestClient,
    category_tree: dict[str, dict[str, Any]],
    session: Session,
) -> None:
    expenses = category_tree["expenses"]
    income = category_tree["income"]
    groceries = category_tree["groceries"]
    salary = category_tree["salary"]

    # Given category migration requests with invalid destinations.
    assert client.post(
        f"/api/categories/{expenses['id']}/migrate-movements",
        json={"target_category_id": ""},
    ).status_code == 400
    assert client.post(
        f"/api/categories/{expenses['id']}/migrate-movements",
        json={"target_category_id": expenses["id"]},
    ).status_code == 400
    assert client.post(
        "/api/categories/missing/migrate-movements",
        json={"target_category_id": income["id"]},
    ).status_code == 404
    assert client.post(
        f"/api/categories/{expenses['id']}/migrate-movements",
        json={"target_category_id": "missing"},
    ).status_code == 404
    assert client.post(
        f"/api/categories/{expenses['id']}/migrate-movements",
        json={
            "target_category_id": income["id"],
            "target_subcategory_id": groceries["id"],
        },
    ).status_code == 400
    assert client.post(
        f"/api/categories/{expenses['id']}/migrate-movements",
        json={
            "target_category_id": income["id"],
            "target_subcategory_id": "missing-subcategory",
        },
    ).status_code == 404

    # And subcategory movement routes validate source, target and destination.
    assert client.post(
        "/api/subcategories/missing/move-movements",
        json={"target_category_id": expenses["id"]},
    ).status_code == 404
    assert client.post(
        f"/api/subcategories/{groceries['id']}/move-movements",
        json={"target_subcategory_id": groceries["id"]},
    ).status_code == 400
    assert client.post(
        f"/api/subcategories/{groceries['id']}/move-movements",
        json={},
    ).status_code == 400
    assert client.post(
        f"/api/subcategories/{groceries['id']}/move-movements",
        json={"target_subcategory_id": "missing"},
    ).status_code == 404

    # Then moving to another subcategory derives its parent category.
    movement = client.post(
        "/api/movements",
        json=movement_payload(
            category_id=expenses["id"],
            subcategory_id=groceries["id"],
        ),
    )
    assert movement.status_code == 201
    moved = client.post(
        f"/api/subcategories/{groceries['id']}/move-movements",
        json={"target_subcategory_id": salary["id"]},
    )
    assert moved.status_code == 200
    session.expire_all()
    updated = client.get("/api/movements").json()[0]
    assert updated["category_id"] == income["id"]
    assert updated["subcategory_id"] == salary["id"]


def test_category_and_budget_routes_cover_remaining_validation_edges(
    client: TestClient,
    category_tree: dict[str, dict[str, Any]],
    session: Session,
) -> None:
    expenses = category_tree["expenses"]
    groceries = category_tree["groceries"]

    assert (
        client.post("/api/categories", json={"name": " ", "kind": "EXPENSE"}).status_code
        == 400
    )
    assert client.patch("/api/categories/missing", json={"name": "Nuevo"}).status_code == 404
    assert client.patch(f"/api/categories/{expenses['id']}", json={}).status_code == 200
    duplicate_expense = client.post(
        "/api/categories",
        json={"name": "Otro gasto", "kind": "EXPENSE"},
    ).json()
    assert client.patch(
        f"/api/categories/{duplicate_expense['id']}",
        json={"name": expenses["name"]},
    ).status_code == 409
    assert client.delete("/api/categories/missing").status_code == 404

    solo = client.post("/api/categories", json={"name": "Solo", "kind": "EXPENSE"}).json()

    assert (
        client.post(
            "/api/subcategories",
            json={"name": " ", "category_id": solo["id"]},
        ).status_code
        == 400
    )
    assert client.patch("/api/subcategories/missing", json={"name": "Nuevo"}).status_code == 404
    assert (
        client.patch(
            f"/api/subcategories/{groceries['id']}",
            json={"name": " "},
        ).status_code
        == 400
    )
    assert client.patch(f"/api/subcategories/{groceries['id']}", json={}).status_code == 200
    assert (
        client.patch(
            f"/api/subcategories/{category_tree['transport']['id']}",
            json={"name": groceries["name"]},
        ).status_code
        == 409
    )
    assert client.delete("/api/subcategories/missing").status_code == 404

    budget = client.post("/api/budgets", json={"month": 8, "year": 2026}).json()
    category_row = client.post(
        f"/api/budgets/{budget['id']}/category-budgets",
        json={"category_id": solo["id"], "amount": 10_000},
    ).json()
    subcategory_row = client.post(
        f"/api/budgets/{budget['id']}/subcategory-budgets",
        json={"subcategory_id": groceries["id"], "amount": 5_000},
    ).json()

    assert (
        client.patch(f"/api/budgets/{budget['id']}", json={"year": 2027}).json()["year"]
        == 2027
    )
    assert (
        client.patch(f"/api/category-budgets/{category_row['id']}", json={}).json()[
            "amount"
        ]
        == 10_000
    )
    assert (
        client.patch(f"/api/subcategory-budgets/{subcategory_row['id']}", json={}).json()[
            "amount"
        ]
        == 5_000
    )

    _delete_category_without_foreign_keys(session, solo["id"])
    serialized = client.get(f"/api/budgets/{budget['id']}")
    assert serialized.status_code == 200
    assert serialized.json()["category_budgets"] == []

    _delete_category_without_foreign_keys(session, expenses["id"])
    assert client.post(
        f"/api/budgets/{budget['id']}/subcategory-budgets",
        json={"subcategory_id": groceries["id"], "amount": 123},
    ).status_code == 404
    assert client.patch(
        f"/api/subcategory-budgets/{subcategory_row['id']}",
        json={"subcategory_id": groceries["id"]},
    ).status_code == 404

    _insert_orphan_budget_rows(session, budget["id"])
    orphan_serialized = client.get(f"/api/budgets/{budget['id']}").json()
    assert orphan_serialized["category_budgets"] == []
    assert orphan_serialized["subcategory_budgets"] == []


def test_deleting_the_only_category_is_blocked(client: TestClient) -> None:
    solo = client.post("/api/categories", json={"name": "Solo", "kind": "EXPENSE"}).json()
    blocked = client.delete(f"/api/categories/{solo['id']}")
    assert blocked.status_code == 400


def test_movement_update_and_settings_noop_edges(
    client: TestClient,
    category_tree: dict[str, dict[str, Any]],
) -> None:
    created = client.post(
        "/api/movements",
        json=movement_payload(
            category_id=category_tree["expenses"]["id"],
            subcategory_id=category_tree["groceries"]["id"],
        ),
    ).json()

    cleared = client.patch(
        f"/api/movements/{created['id']}",
        json={"clear_subcategory": True},
    )
    assert cleared.status_code == 200
    assert cleared.json()["subcategory_id"] is None
    reviewed_only = client.patch(f"/api/movements/{created['id']}", json={"reviewed": True})
    assert reviewed_only.status_code == 200
    assert reviewed_only.json()["reviewed"] is True

    invalid = client.patch(
        f"/api/movements/{created['id']}",
        json={"category_id": "missing-category"},
    )
    assert invalid.status_code == 400

    assert client.patch("/api/settings", json={}).status_code == 200


def _xlsx_bytes(rows: list[list[str]]) -> bytes:
    import io

    from openpyxl import Workbook

    workbook = Workbook()
    sheet = workbook.active
    for row in rows:
        sheet.append(row)
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def _delete_category_without_foreign_keys(session: Session, category_id: str) -> None:
    from app.database import engine

    session.commit()
    raw_connection = engine.raw_connection()
    try:
        cursor = raw_connection.cursor()
        cursor.execute("PRAGMA foreign_keys = OFF")
        cursor.execute("DELETE FROM category WHERE id = ?", (category_id,))
        raw_connection.commit()
    finally:
        raw_connection.close()
    session.expire_all()


def _insert_orphan_budget_rows(session: Session, budget_id: str) -> None:
    from app.database import engine

    session.commit()
    raw_connection = engine.raw_connection()
    try:
        cursor = raw_connection.cursor()
        cursor.execute("PRAGMA foreign_keys = OFF")
        cursor.execute(
            """
            INSERT INTO category_budget
              (id, budget_id, category_id, amount_cents, created_at, updated_at)
            VALUES
              (
                'orphan-category-row',
                ?,
                'missing-category',
                1,
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
              )
            """,
            (budget_id,),
        )
        cursor.execute(
            """
            INSERT INTO subcategory_budget
              (id, budget_id, subcategory_id, amount_cents, created_at, updated_at)
            VALUES
              (
                'orphan-subcategory-row',
                ?,
                'missing-subcategory',
                1,
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
              )
            """,
            (budget_id,),
        )
        raw_connection.commit()
    finally:
        raw_connection.close()
    session.expire_all()


def _update_movement_category_without_foreign_keys(
    session: Session,
    *,
    movement_id: str,
    category_id: str,
) -> None:
    from app.database import engine

    session.commit()
    raw_connection = engine.raw_connection()
    try:
        cursor = raw_connection.cursor()
        cursor.execute("PRAGMA foreign_keys = OFF")
        cursor.execute(
            "UPDATE movement SET category_id = ? WHERE id = ?",
            (category_id, movement_id),
        )
        raw_connection.commit()
    finally:
        raw_connection.close()
    session.expire_all()
