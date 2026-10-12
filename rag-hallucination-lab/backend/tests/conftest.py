"""Shared test fixtures.

The developer's real ``.env`` may set ``MOCK_MODE=false``. Tests choose the
provider explicitly via ``settings.llm_provider`` (see the individual tests), so
the ambient ``MOCK_MODE`` value is neutralised for the shared ``settings``
singleton to keep results deterministic. The ``MOCK_MODE`` semantics themselves
are covered directly in ``test_config.py`` using isolated ``Settings`` instances.
"""

from __future__ import annotations

import pytest

from app.core.config import settings


@pytest.fixture(autouse=True)
def _neutralize_ambient_mock_mode(monkeypatch):
    monkeypatch.setattr(settings, "mock_mode", None, raising=False)
    yield
