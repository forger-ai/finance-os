from __future__ import annotations

from collections.abc import Callable
from typing import Any

import pytest

from app.mcp_runtime import ToolError

pytestmark = pytest.mark.bdd


def test_mcp_category_subcategory_movement_and_import_lifecycle() -> None:
    from app import mcp_server as mcp

    assert mcp._dump({"plain": True}) == {"plain": True}  # noqa: SLF001

    # Given an assistant-managed category tree created through MCP tools.
    expenses = mcp.create_category({"name": "Gastos", "kind": "EXPENSE"})["category"]
    income = mcp.create_category({"name": "Ingresos", "kind": "INCOME"})["category"]
    groceries = mcp.create_subcategory(
        {"name": "Supermercado", "category_id": expenses["id"]}
    )["subcategory"]
    salary = mcp.create_subcategory({"name": "Sueldo", "category_id": income["id"]})[
        "subcategory"
    ]

    # When the assistant edits and lists categories.
    renamed = mcp.edit_category({"category_id": expenses["id"], "name": "Gastos base"})
    renamed_sub = mcp.edit_subcategory(
        {"subcategory_id": groceries["id"], "name": "Supermercado semanal"}
    )
    listed_categories = mcp.list_categories({})

    # Then category metadata stays available to future tools.
    assert renamed["category"]["name"] == "Gastos base"
    assert renamed_sub["subcategory"]["name"] == "Supermercado semanal"
    assert {category["id"] for category in listed_categories["categories"]} == {
        expenses["id"],
        income["id"],
    }

    # When movements are created, listed, edited, migrated and deleted through MCP.
    movement = mcp.create_movement(
        {
            "date": "2026-05-01",
            "amount": 12_500,
            "business": "Super Uno",
            "reason": "Compra semanal",
            "category_id": expenses["id"],
            "subcategory_id": groceries["id"],
            "source": "MANUAL",
        }
    )["movement"]
    listed = mcp.list_movements(
        {
            "limit": 50,
            "reviewed": False,
            "categoryId": expenses["id"],
            "subcategoryId": groceries["id"],
        }
    )
    edited = mcp.edit_movement(
        {
            "movement_id": movement["id"],
            "reviewed": True,
            "subcategory_id": salary["id"],
            "amount": 13_000,
            "raw_description": None,
            "source_file": "statement.csv",
            "external_id": "row-1",
        }
    )["movement"]

    # Then filters and classification derivation match the route contract.
    assert listed["limit"] == 50
    assert [item["id"] for item in listed["movements"]] == [movement["id"]]
    assert mcp.list_movements({"categoryId": "   ", "subcategoryId": "   "})[
        "limit"
    ] == 100
    assert edited["category_id"] == income["id"]
    assert edited["subcategory_id"] == salary["id"]
    assert edited["reviewed"] is True

    # And category/subcategory migration tools can move existing rows safely.
    target = mcp.create_category({"name": "No cobrable", "kind": "UNCHARGEABLE"})[
        "category"
    ]
    holding = mcp.create_subcategory(
        {"name": "Por revisar", "category_id": target["id"]}
    )["subcategory"]
    mcp.migrate_category_movements(
        {
            "category_id": income["id"],
            "target_category_id": target["id"],
            "target_subcategory_id": holding["id"],
        }
    )
    migrated = mcp.list_movements({"categoryId": target["id"]})["movements"][0]
    assert migrated["subcategory_id"] == holding["id"]

    mcp.migrate_subcategory_movements(
        {"subcategory_id": holding["id"], "target_category_id": expenses["id"]}
    )
    moved = mcp.list_movements({"categoryId": expenses["id"]})["movements"][0]
    assert moved["subcategory_id"] is None

    assert mcp.delete_movement({"movement_id": moved["id"]})["deletedMovementId"] == moved["id"]
    assert mcp.delete_subcategory({"subcategory_id": groceries["id"]})["result"] == {
        "ok": True
    }
    assert mcp.delete_category({"category_id": income["id"]})["result"] == {"ok": True}


def test_mcp_structured_and_csv_imports_report_failures_and_duplicates() -> None:
    from app import mcp_server as mcp

    # Given an ensured tree, structured imports can resolve names and row errors.
    tree = mcp.ensure_category_tree(
        {
            "categories": [
                {
                    "name": "Gastos",
                    "kind": "EXPENSE",
                    "subcategories": ["Comida"],
                }
            ]
        }
    )
    reused_tree = mcp.ensure_category_tree(
        {
            "categories": [
                {
                    "name": "Gastos",
                    "kind": "EXPENSE",
                    "subcategories": None,
                }
            ]
        }
    )
    assert reused_tree["created"]["categories"] == 0
    category = tree["categories"][0]
    subcategory = category["subcategories"][0]

    imported = mcp.import_movements(
        {
            "source_label": "assistant.json",
            "movements": [
                {
                    "date": "2026-05-01",
                    "amount": 10_000,
                    "business": "Cafe Uno",
                    "reason": "Cafe",
                    "category": "Gastos",
                    "subcategory": "Comida",
                    "source_row": "1",
                },
                {
                    "date": "",
                    "amount": 20_000,
                    "category_id": category["id"],
                },
            ],
        }
    )["import"]

    # Then valid rows are inserted and invalid rows stay row-scoped failures.
    assert imported["inserted"] == 1
    assert imported["failed"] == 1
    assert imported["rows"][1]["status"] == "failed"
    assert "Missing date" in imported["errors"][0]["error"]

    duplicate = mcp.import_movements(
        {
            "source_label": "assistant.json",
            "movements": [
                {
                    "date": "2026-05-01",
                    "amount": 10_000,
                    "business": "Cafe Uno",
                    "reason": "Cafe",
                    "category_id": category["id"],
                    "subcategory_id": subcategory["id"],
                    "source_row": "1",
                }
            ],
        }
    )["import"]
    assert duplicate["duplicate"] == 1
    assert duplicate["rows"][0]["status"] == "duplicate"

    csv_import = mcp.import_csv_text(
        {
            "file_label": "bank.csv",
            "csv_text": "fecha,monto,descripcion\n2026-05-02,5000,Feria\n",
        }
    )["import"]
    assert csv_import["inserted"] == 1
    assert csv_import["failed"] == 0


def test_mcp_budget_and_integrity_tools_cover_create_update_list_delete() -> None:
    from app import mcp_server as mcp

    # Given a category tree and an empty budget list.
    category = mcp.create_category({"name": "Gastos", "kind": "EXPENSE"})["category"]
    subcategory = mcp.create_subcategory(
        {"name": "Transporte", "category_id": category["id"]}
    )["subcategory"]
    assert mcp.list_budgets({})["budgets"] == []

    # When period and row budget tools are used end to end.
    budget = mcp.create_budget({"month": 5, "year": 2026})["budget"]
    edited_budget = mcp.edit_budget(
        {"budget_id": budget["id"], "month": 6, "year": 2026}
    )["budget"]
    category_row = mcp.create_category_budget(
        {
            "budget_id": budget["id"],
            "category_id": category["id"],
            "amount": 100_000,
        }
    )["categoryBudget"]
    edited_category_row = mcp.edit_category_budget(
        {"row_id": category_row["id"], "amount": 120_000}
    )["categoryBudget"]
    subcategory_row = mcp.create_subcategory_budget(
        {
            "budget_id": budget["id"],
            "subcategory_id": subcategory["id"],
            "amount": 50_000,
        }
    )["subcategoryBudget"]
    edited_subcategory_row = mcp.edit_subcategory_budget(
        {"row_id": subcategory_row["id"], "amount": 55_000}
    )["subcategoryBudget"]

    # Then list, edit and delete responses expose the same data shape as routes.
    listed = mcp.list_budgets({})["budgets"]
    assert edited_budget["label"] == "2026-06"
    assert edited_category_row["amount"] == 120_000
    assert edited_subcategory_row["amount"] == 55_000
    assert [item["id"] for item in listed] == [budget["id"]]
    assert mcp.verify_data_integrity({})["result"]["ok"] is True

    assert mcp.delete_category_budget({"row_id": category_row["id"]})["result"] == {
        "ok": True
    }
    assert mcp.delete_subcategory_budget({"row_id": subcategory_row["id"]})[
        "result"
    ] == {"ok": True}
    assert mcp.delete_budget({"budget_id": budget["id"]})["result"] == {"ok": True}
    assert mcp.list_budgets({})["budgets"] == []


def test_mcp_tool_error_paths_for_invalid_inputs() -> None:
    from app import mcp_server as mcp

    cases: list[tuple[Callable[[dict[str, Any]], Any], dict[str, Any], str]] = [
        (mcp.update_settings, {"primary_currency_code": None}, "invalid_input"),
        (mcp.ensure_category_tree, {"categories": "Gastos"}, "invalid_input"),
        (mcp.ensure_category_tree, {"categories": ["Gastos"]}, "invalid_input"),
        (
            mcp.ensure_category_tree,
            {"categories": [{"name": "Gastos", "kind": "BAD"}]},
            "invalid_input",
        ),
        (
            mcp.ensure_category_tree,
            {
                "categories": [
                    {
                        "name": "Gastos",
                        "kind": "EXPENSE",
                        "subcategories": "Comida",
                    }
                ]
            },
            "invalid_input",
        ),
        (mcp.import_csv_text, {"csv_text": " "}, "invalid_input"),
        (mcp.import_movements, {"movements": "bad"}, "invalid_input"),
        (mcp.edit_category, {"category_id": "cat", "name": " "}, "invalid_input"),
        (mcp.delete_category, {"category_id": " "}, "invalid_input"),
        (
            mcp.migrate_category_movements,
            {"category_id": "cat", "target_category_id": " "},
            "invalid_input",
        ),
        (
            mcp.migrate_subcategory_movements,
            {"subcategory_id": " "},
            "invalid_input",
        ),
        (mcp.delete_movement, {"movement_id": "missing"}, "not_found"),
    ]

    for handler, args, code in cases:
        with pytest.raises(ToolError) as exc_info:
            handler(args)
        assert exc_info.value.code == code

    with pytest.raises(ToolError) as exc_info:
        mcp.registry.call("missing_tool", {})
    assert exc_info.value.code == "unknown_tool"

