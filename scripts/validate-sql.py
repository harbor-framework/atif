#!/usr/bin/env python3
"""Validate ATIF BigQuery warehouse SQL DDL using sqlglot.

Usage:
    uv run --with sqlglot python3 scripts/validate-sql.py spec/v2.0/schema/warehouse.sql
"""

from __future__ import annotations

import pathlib
import sys

try:
    import sqlglot
    from sqlglot import exp
except ImportError as exc:
    sys.stderr.write(
        "ERROR: sqlglot is required. Run with:\n"
        "  uv run --with sqlglot python3 scripts/validate-sql.py spec/v2.0/schema/warehouse.sql\n"
    )
    raise SystemExit(2) from exc

EXPECTED_TABLES = {
    "sessions",
    "trajectories",
    "steps",
    "actions",
    "extension_records",
    "blobs",
}


def validate_sql_file(path: pathlib.Path) -> int:
    if not path.is_file():
        sys.stderr.write(f"ERROR: SQL file not found: {path}\n")
        return 1

    sql_text = path.read_text(encoding="utf-8")
    try:
        statements = sqlglot.parse(sql_text, read="bigquery")
    except sqlglot.errors.ParseError as exc:
        sys.stderr.write(f"ERROR: Failed to parse {path} as BigQuery SQL:\n{exc}\n")
        return 1

    non_empty = [stmt for stmt in statements if stmt is not None]
    if not non_empty:
        sys.stderr.write(f"ERROR: No SQL statements found in {path}\n")
        return 1

    found_tables: set[str] = set()
    for stmt in non_empty:
        if isinstance(stmt, exp.Create):
            table = stmt.find(exp.Table)
            if table and table.name:
                found_tables.add(table.name)
        # Ensure round-trip generation in BigQuery dialect succeeds cleanly.
        rendered = stmt.sql(dialect="bigquery")
        if not rendered.strip():
            sys.stderr.write(f"ERROR: Empty rendered SQL for statement in {path}\n")
            return 1

    missing = EXPECTED_TABLES - found_tables
    if missing:
        sys.stderr.write(
            f"ERROR: Missing expected ATIF warehouse tables in {path}: {sorted(missing)}\n"
        )
        return 1

    print(
        f"OK: {path} parsed cleanly as BigQuery SQL "
        f"({len(non_empty)} statements, tables: {', '.join(sorted(found_tables))})."
    )
    return 0


def main(argv: list[str]) -> int:
    targets = argv[1:] or ["spec/v2.0/schema/warehouse.sql"]
    exit_code = 0
    for target in targets:
        rc = validate_sql_file(pathlib.Path(target))
        if rc != 0:
            exit_code = rc
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
