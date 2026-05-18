from __future__ import annotations

import io
from datetime import datetime, timezone
from typing import Any

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook
from sqlmodel import Session

from app.mcp_runtime import ToolError
from app.models import CategoryKind, Movement, MovementSource
from app.services.classification import ClassificationError, resolve_movement_classification
from app.services.integrity import find_classification_mismatches
from tests.helpers import movement_payload, seed_category, seed_subcategory

pytestmark = pytest.mark.bdd


def test_classification_invariants_hold_across_create_and_reclassification(
    client: TestClient,
    category_tree: dict[str, dict[str, Any]],
    session: Session,
) -> None:
    # Given two category trees with their own subcategories.
    expense_category = category_tree["expenses"]
    grocery_subcategory = category_tree["groceries"]
    income_category = category_tree["income"]
    salary_subcategory = category_tree["salary"]

    # When a movement is created with a matching category/subcategory pair.
    created = client.post(
        "/api/movements",
        json=movement_payload(
            category_id=expense_category["id"],
            subcategory_id=grocery_subcategory["id"],
        ),
    )

    # Then the classification is accepted and serialized consistently.
    assert created.status_code == 201, created.text
    movement = created.json()
    assert movement["category_id"] == expense_category["id"]
    assert movement["subcategory_id"] == grocery_subcategory["id"]
    assert movement["category_kind"] == CategoryKind.EXPENSE.value

    # And an explicit mismatch is rejected both by the API and the service.
    mismatched = client.post(
        "/api/movements",
        json=movement_payload(
            category_id=expense_category["id"],
            subcategory_id=salary_subcategory["id"],
            business="Payroll",
        ),
    )
    assert mismatched.status_code == 400
    assert "subcategoría" in mismatched.json()["detail"].lower()
    with pytest.raises(ClassificationError):
        resolve_movement_classification(
            session,
            category_id=expense_category["id"],
            subcategory_id=salary_subcategory["id"],
        )

    # When the user selects only a new subcategory, the parent category is derived.
    reclassified = client.patch(
        f"/api/movements/{movement['id']}",
        json={"subcategory_id": salary_subcategory["id"]},
    )

    # Then the movement moves to the salary category without leaving a mismatch.
    assert reclassified.status_code == 200, reclassified.text
    assert reclassified.json()["category_id"] == income_category["id"]
    assert reclassified.json()["subcategory_id"] == salary_subcategory["id"]

    explicit_mismatch = client.patch(
        f"/api/movements/{movement['id']}",
        json={
            "category_id": expense_category["id"],
            "subcategory_id": salary_subcategory["id"],
        },
    )
    assert explicit_mismatch.status_code == 400


def test_movement_create_update_review_list_and_delete_flow(
    client: TestClient,
    category_tree: dict[str, dict[str, Any]],
) -> None:
    # Given a category-only movement.
    created = client.post(
        "/api/movements",
        json=movement_payload(category_id=category_tree["expenses"]["id"]),
    )
    assert created.status_code == 201, created.text
    movement = created.json()
    assert movement["reviewed"] is False
    assert movement["subcategory_id"] is None

    # When the user reviews and edits the movement.
    updated = client.patch(
        f"/api/movements/{movement['id']}",
        json={
            "reviewed": True,
            "amount": 19_990,
            "business": "Mercado Actualizado",
            "reason": "Compra semanal",
            "source": "BANK",
            "raw_description": None,
            "source_file": "bank.csv",
            "external_id": "bank-1",
            "source_row": "42",
            "date": "2026-05-03",
            "accounting_date": "2026-05-04",
            "subcategory_id": category_tree["transport"]["id"],
        },
    )

    # Then all editable fields are persisted and review state is visible in list.
    assert updated.status_code == 200, updated.text
    body = updated.json()
    assert body["reviewed"] is True
    assert body["amount"] == 19_990
    assert body["business"] == "Mercado Actualizado"
    assert body["source"] == "BANK"
    assert body["subcategory_id"] == category_tree["transport"]["id"]

    listed = client.get("/api/movements")
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()] == [movement["id"]]

    # When the movement is deleted, it is gone and cannot be edited again.
    deleted = client.delete(f"/api/movements/{movement['id']}")
    assert deleted.status_code == 200
    assert deleted.json() == {"ok": True}
    missing_update = client.patch(
        f"/api/movements/{movement['id']}",
        json={"reviewed": False},
    )
    assert missing_update.status_code == 404
    assert client.delete(f"/api/movements/{movement['id']}").status_code == 404


def test_category_and_subcategory_api_enforces_names_counts_and_safe_deletes(
    client: TestClient,
) -> None:
    # Given categories and subcategories created through the public API.
    expense = client.post("/api/categories", json={"name": "  Gastos  ", "kind": "EXPENSE"})
    income = client.post("/api/categories", json={"name": "Ingresos", "kind": "INCOME"})
    assert expense.status_code == 201, expense.text
    assert income.status_code == 201, income.text
    expense_body = expense.json()
    assert expense_body["name"] == "Gastos"

    duplicate = client.post("/api/categories", json={"name": "Gastos", "kind": "EXPENSE"})
    assert duplicate.status_code == 409
    blank_update = client.patch(f"/api/categories/{expense_body['id']}", json={"name": " "})
    assert blank_update.status_code == 400

    food = client.post(
        "/api/subcategories",
        json={"name": "Comida", "category_id": expense_body["id"]},
    )
    assert food.status_code == 201, food.text
    duplicate_subcategory = client.post(
        "/api/subcategories",
        json={"name": "Comida", "category_id": expense_body["id"]},
    )
    assert duplicate_subcategory.status_code == 409
    missing_parent = client.post(
        "/api/subcategories",
        json={"name": "Fantasma", "category_id": "missing"},
    )
    assert missing_parent.status_code == 404

    movement = client.post(
        "/api/movements",
        json=movement_payload(
            category_id=expense_body["id"],
            subcategory_id=food.json()["id"],
        ),
    )
    assert movement.status_code == 201, movement.text

    listed = client.get("/api/categories")
    assert listed.status_code == 200
    category = next(item for item in listed.json() if item["id"] == expense_body["id"])
    assert category["movement_count"] == 1
    assert category["subcategories"][0]["movement_count"] == 1

    # Then destructive category changes are blocked until movements are moved away.
    assert client.delete(f"/api/subcategories/{food.json()['id']}").status_code == 400
    assert client.delete(f"/api/categories/{expense_body['id']}").status_code == 400

    move_to_income = client.post(
        f"/api/categories/{expense_body['id']}/migrate-movements",
        json={"target_category_id": income.json()["id"]},
    )
    assert move_to_income.status_code == 200, move_to_income.text
    assert client.delete(f"/api/subcategories/{food.json()['id']}").status_code == 200
    assert client.delete(f"/api/categories/{expense_body['id']}").status_code == 200


def test_settings_validation_is_shared_by_api_and_mcp(client: TestClient) -> None:
    # Given default local settings.
    response = client.get("/api/settings")
    assert response.status_code == 200
    assert response.json()["primary_currency_code"] == "CLP"
    assert response.json()["primary_currency_format"]["code"] == "CLP"

    # When a supported currency code is saved, normalization is applied.
    updated = client.patch("/api/settings", json={"primary_currency_code": "usd"})
    assert updated.status_code == 200, updated.text
    assert updated.json()["primary_currency_code"] == "USD"

    # Then unsupported settings fail through both the API and MCP tool.
    invalid = client.patch("/api/settings", json={"primary_currency_code": "XXX"})
    assert invalid.status_code == 400
    assert "no soportado" in invalid.json()["detail"]

    from app.mcp_server import get_settings, update_settings

    assert get_settings({})["settings"]["primary_currency_code"] == "USD"
    assert update_settings({"primary_currency_code": "CLP"})["settings"][
        "primary_currency_code"
    ] == "CLP"
    with pytest.raises(ToolError):
        update_settings({"primary_currency_code": "ZZZ"})


def test_imports_accept_recognized_csv_and_xlsx_and_reject_ambiguous_files(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    category_tree: dict[str, dict[str, Any]],
) -> None:
    from app.routes import imports

    assert category_tree["expenses"]["id"]
    csv_text = (
        "date,amount,business,reason,source,reviewed\n"
        "2026-05-01,123.45,Super Uno,Compra semanal,MANUAL,true\n"
    )

    # Given a recognizable CSV, the local importer loads one row.
    imported = client.post(
        "/api/imports/movements-extract",
        files={"file": ("movements.csv", csv_text.encode("utf-8"), "text/csv")},
    )
    assert imported.status_code == 200, imported.text
    assert imported.json()["inserted"] == 1
    assert imported.json()["failed"] == 0

    # And the same source row is reported as duplicate instead of failure.
    duplicate = client.post(
        "/api/imports/movements-extract",
        files={"file": ("movements.csv", csv_text.encode("utf-8"), "text/csv")},
    )
    assert duplicate.status_code == 200, duplicate.text
    assert duplicate.json()["duplicate"] == 1
    assert duplicate.json()["failed"] == 0

    # When the CSV does not expose date and amount semantics, it is rejected.
    ambiguous = client.post(
        "/api/imports/movements-extract",
        files={"file": ("notes.csv", b"foo,bar\none,two\n", "text/csv")},
    )
    assert ambiguous.status_code == 422

    # XLSX follows the same success and rejection branches.
    xlsx = _xlsx_bytes(
        [
            ["Fecha", "Monto", "Descripcion"],
            ["2026-05-02", "1200", "Panaderia"],
        ]
    )
    xlsx_import = client.post(
        "/api/imports/movements-extract",
        files={
            "file": (
                "statement.xlsx",
                xlsx,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    assert xlsx_import.status_code == 200, xlsx_import.text
    assert xlsx_import.json()["inserted"] == 1

    monkeypatch.setattr(
        imports,
        "xls_to_csv",
        lambda _raw: "Fecha,Monto,Descripcion\n2026-05-03,900,Farmacia\n",
    )
    xls_import = client.post(
        "/api/imports/movements-extract",
        files={
            "file": (
                "legacy-statement.xls",
                b"legacy workbook",
                "application/vnd.ms-excel",
            )
        },
    )
    assert xls_import.status_code == 200, xls_import.text
    assert xls_import.json()["inserted"] == 1

    invalid_xlsx = client.post(
        "/api/imports/movements-extract",
        files={
            "file": (
                "broken.xlsx",
                b"not a workbook",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    assert invalid_xlsx.status_code == 400
    unsupported = client.post(
        "/api/imports/movements-extract",
        files={"file": ("movements.txt", b"date amount", "text/plain")},
    )
    assert unsupported.status_code == 415


def test_assistant_routes_map_desktop_runtime_success_and_errors(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.forger_desktop import ForgerDesktopRuntimeError, ForgerDesktopRuntimeUnavailable
    from app.routes import assistant

    def task_body(template_id: str = "recommend_budget", **_kwargs: Any) -> dict[str, Any]:
        return {
            "runId": "bdd-run",
            "appId": "finance-os",
            "templateId": template_id,
            "status": "queued",
            "createdAt": "2026-05-17T00:00:00.000Z",
            "updatedAt": "2026-05-17T00:00:00.000Z",
            "progressLog": [],
        }

    monkeypatch.setattr(
        assistant,
        "get_agent_task_status",
        lambda: {"available": True, "connected": True},
    )
    status = client.get("/api/assistant/status")
    assert status.status_code == 200
    assert status.json()["connected"] is True

    monkeypatch.setattr(assistant, "start_agent_task", task_body)
    budget = client.post(
        "/api/assistant/tasks/budget-recommendation",
        json={"expectedIncome": "1000", "month": "5", "year": "2026", "locale": "es"},
    )
    assert budget.status_code == 200, budget.text
    assert budget.json()["runId"] == "bdd-run"

    monkeypatch.setattr(
        assistant,
        "get_agent_task",
        lambda _run_id: {**task_body(), "status": "completed", "resultText": "ok"},
    )
    assert client.get("/api/assistant/tasks/bdd-run").json()["status"] == "completed"
    monkeypatch.setattr(assistant, "cancel_agent_task", lambda _run_id: {"success": True})
    assert client.post("/api/assistant/tasks/bdd-run/cancel").json() == {"success": True}

    movement_import = client.post(
        "/api/assistant/tasks/movement-import",
        data={
            "template_id": "first_run_finance_os_import",
            "user_note": "Starter schema selected.",
            "locale": "es",
        },
        files={"files": ("statement.csv", b"date,amount\n2026-05-01,100\n", "text/csv")},
    )
    assert movement_import.status_code == 200, movement_import.text
    assert movement_import.json()["templateId"] == "first_run_finance_os_import"

    assert client.post(
        "/api/assistant/tasks/movement-import",
        files={"files": ("empty.csv", b"", "text/csv")},
    ).status_code == 400
    assert client.post(
        "/api/assistant/tasks/movement-import",
        files={"files": ("notes.txt", b"hello", "text/plain")},
    ).status_code == 415
    assert client.post(
        "/api/assistant/tasks/movement-import",
        data={"user_note": "x" * 2001},
        files={"files": ("statement.csv", b"date,amount\n1,2\n", "text/csv")},
    ).status_code == 413

    monkeypatch.setattr(assistant, "MAX_FILE_BYTES", 4)
    assert client.post(
        "/api/assistant/tasks/movement-import",
        files={"files": ("large.csv", b"date,amount\n1,2\n", "text/csv")},
    ).status_code == 413

    monkeypatch.setattr(
        assistant,
        "start_agent_task",
        lambda **_kwargs: (_ for _ in ()).throw(ForgerDesktopRuntimeError("runtime failed")),
    )
    runtime_failed = client.post(
        "/api/assistant/tasks/budget-recommendation",
        json={"expectedIncome": "1000", "month": "5", "year": "2026", "locale": "es"},
    )
    assert runtime_failed.status_code == 502

    monkeypatch.setattr(
        assistant,
        "get_agent_task_status",
        lambda: (_ for _ in ()).throw(ForgerDesktopRuntimeUnavailable("missing")),
    )
    unavailable_status = client.get("/api/assistant/status")
    assert unavailable_status.status_code == 200
    assert unavailable_status.json()["available"] is False


def test_mcp_tools_create_category_tree_import_movements_and_update_settings() -> None:
    from app.mcp_server import ensure_category_tree, get_settings, import_movements, update_settings

    # Given an assistant-normalized category tree.
    tree = ensure_category_tree(
        {
            "categories": [
                {
                    "name": "Gastos",
                    "kind": "EXPENSE",
                    "subcategories": ["Supermercado", "Supermercado", "Transporte"],
                }
            ]
        }
    )
    assert tree["success"] is True
    assert tree["created"] == {"categories": 1, "subcategories": 2}
    expense = tree["categories"][0]
    grocery = next(sub for sub in expense["subcategories"] if sub["name"] == "Supermercado")

    # When the same tree is ensured again, it is idempotent.
    repeated = ensure_category_tree(
        {
            "categories": [
                {
                    "name": "gastos",
                    "kind": "EXPENSE",
                    "subcategories": ["supermercado"],
                }
            ]
        }
    )
    assert repeated["created"] == {"categories": 0, "subcategories": 0}

    # Then structured imports preserve source traceability and duplicate semantics.
    imported = import_movements(
        {
            "source_label": "assistant.csv",
            "movements": [
                {
                    "date": "2026-05-01",
                    "amount": 13_500,
                    "business": "Super Uno",
                    "reason": "Compra semanal",
                    "source": "MANUAL",
                    "source_row": "1",
                    "category_id": expense["id"],
                    "subcategory_id": grocery["id"],
                    "reviewed": False,
                }
            ],
        }
    )
    assert imported["success"] is True
    assert imported["import"]["inserted"] == 1

    duplicate = import_movements(
        {
            "source_label": "assistant.csv",
            "movements": [
                {
                    "date": "2026-05-01",
                    "amount": 13_500,
                    "business": "Super Uno",
                    "reason": "Compra semanal",
                    "source": "MANUAL",
                    "source_row": "1",
                    "category_id": expense["id"],
                    "subcategory_id": grocery["id"],
                }
            ],
        }
    )
    assert duplicate["success"] is True
    assert duplicate["import"]["duplicate"] == 1

    assert get_settings({})["settings"]["primary_currency_code"] == "CLP"
    assert update_settings({"primary_currency_code": "USD"})["settings"][
        "primary_currency_code"
    ] == "USD"
    with pytest.raises(ToolError):
        ensure_category_tree({"categories": [{"name": "", "kind": "EXPENSE"}]})


def test_data_integrity_script_reports_clean_and_mismatched_classifications(
    session: Session,
    capsys: pytest.CaptureFixture[str],
) -> None:
    from scripts import verify_data_integrity

    # Given clean data, both the service and script report success.
    assert find_classification_mismatches(session) == []
    assert verify_data_integrity.main() == 0
    assert "Data integrity ok." in capsys.readouterr().out

    # When persisted data violates the classification invariant, the service can detect it.
    expense = seed_category(session, name="Gastos")
    income = seed_category(session, name="Ingresos", kind=CategoryKind.INCOME)
    salary = seed_subcategory(session, name="Sueldo", category=income)
    now = datetime.now(timezone.utc)
    session.add(
        Movement(
            date=now,
            accounting_date=now,
            amount_cents=100_000,
            business="Empresa",
            reason="Pago",
            source=MovementSource.MANUAL,
            category_id=expense.id,
            subcategory_id=salary.id,
        )
    )
    session.commit()

    mismatches = find_classification_mismatches(session)
    assert len(mismatches) == 1
    assert mismatches[0].expected_category_id == income.id

    # And the script path runs app DB initialization, which repairs the mismatch.
    assert verify_data_integrity.main() == 0
    assert "Data integrity ok." in capsys.readouterr().out
    session.expire_all()
    assert find_classification_mismatches(session) == []


def _xlsx_bytes(rows: list[list[str]]) -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    for row in rows:
        sheet.append(row)
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()
