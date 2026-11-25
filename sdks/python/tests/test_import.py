"""Smoke tests for the atif package skeleton."""

import atif


def test_import_and_version() -> None:
    """Verify that the package imports cleanly and exposes a version string."""
    assert isinstance(atif.__version__, str)
    assert atif.__version__ == "2.0.0.dev0"
