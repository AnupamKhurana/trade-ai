import pandas as pd
import pytest

from app.services import market_data
from app.services.market_data import market_service


@pytest.mark.parametrize(
    "symbol, exchange, expected",
    [
        ("reliance", "NSE", "RELIANCE.NS"),
        ("RELIANCE", "BSE", "RELIANCE.BO"),
        ("aapl", "US", "AAPL"),
        ("TCS.BO", "NSE", "TCS.BO"),
        ("INFY", "unknown", "INFY.NS"),
    ],
)
def test_get_ticker(symbol, exchange, expected):
    assert market_service._get_ticker(symbol, exchange) == expected


def _closes(values):
    return pd.DataFrame({"Close": values}, dtype=float)


def test_sma_matches_rolling_mean():
    data = market_service.calculate_indicators(_closes(range(1, 61)))
    # SMA_20 on the last bar is the mean of 41..60
    assert data["SMA_20"].iloc[-1] == pytest.approx(50.5)
    assert data["SMA_50"].iloc[-1] == pytest.approx(35.5)


def test_rsi_is_100_for_steady_gains_and_0_for_steady_losses():
    up = market_service.calculate_indicators(_closes(range(1, 31)))
    down = market_service.calculate_indicators(_closes(range(30, 0, -1)))
    assert up["RSI"].iloc[-1] == pytest.approx(100)
    assert down["RSI"].iloc[-1] == pytest.approx(0)


class _FakeTicker:
    def __init__(self, history):
        self._history = history
        self.info = {"longName": "Fake Co", "currency": "INR"}
        self.recommendations = None
        self.balance_sheet = None
        self.financials = None

    def history(self, period="1mo", interval="1d"):
        return self._history


def test_day_change_is_measured_from_previous_close(monkeypatch):
    history = pd.DataFrame(
        {"Open": [100.0, 104.0], "Close": [102.0, 105.0]},
        index=pd.to_datetime(["2026-10-19", "2026-10-20"]),
    )
    monkeypatch.setattr(market_data.yf, "Ticker", lambda _: _FakeTicker(history))
    monkeypatch.setattr(market_service, "_get_screener_metrics", lambda _: {})

    quote = market_service.get_current_price("FAKE", "NSE")

    # 105 vs yesterday's 102 close, not vs today's 104 open
    assert quote["change"] == pytest.approx(3.0)
    assert quote["change_percent"] == pytest.approx(2.94)
    assert quote["previous_close"] == pytest.approx(102.0)
