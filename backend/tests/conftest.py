import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.cache import cache  # noqa: E402


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture(autouse=True)
def no_nse_network(monkeypatch):
    """Tests never reach NSE; individual tests install fakes where needed."""
    from app.services import nse_data

    def offline(*args, **kwargs):
        raise ConnectionError("NSE disabled in tests")

    monkeypatch.setattr(nse_data.nse_data_service, "_live_client", offline)
    monkeypatch.setattr(nse_data.nse_data_service, "_fin_client", offline)
    monkeypatch.setattr("jugaad_data.nse.stock_df", offline)
