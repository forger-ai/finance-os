from pathlib import Path


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    body = (root / "AGENTS.md").read_text(encoding="utf-8")

    required = [
        "Finance OS is a Forger app",
        "## User-Visible Capabilities",
        "### Load Financial Movements",
        "### Correct Classifications",
        "### Manage Categories, Subcategories, And Budgets",
        "## Capabilities Not To Assume",
        "Use structured app tools before scripts",
        "skills/load-movements",
        "skills/stack-database-extension",
        "Do not present scripts, commands, paths, internal tools, or implementation details",
    ]

    missing = [entry for entry in required if entry not in body]
    if missing:
        raise SystemExit(f"AGENTS.md contract is missing: {', '.join(missing)}")


if __name__ == "__main__":
    main()
