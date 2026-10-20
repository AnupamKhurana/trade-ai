import pandas as pd
import pytest

from app.services import nse_data
from app.services.market_data import market_service
from app.services.nse_data import nse_data_service

RAW_QUOTE = {
    "metaData": {"companyName": "Tata Consultancy Services Limited", "isinCode": "INE467B01029",
                 "previousClose": 2465.0, "closePrice": 2460.9, "open": 2470, "dayHigh": 2480, "dayLow": 2450},
    "tradeInfo": {"lastPrice": 2460.9, "totalTradedVolume": 8676373, "deliveryToTradedQuantity": 57.0,
                  "totalMarketCap": 8903751573046.2},
    "priceInfo": {"yearHigh": 3350.0, "yearLow": 2000.0},
    "secInfo": {"sector": "Information Technology", "basicIndustry": "Computers - Software & Consulting",
                "pdSymbolPe": "17.17", "pdSectorPe": "25.1"},
    "lastUpdateTime": "19-Oct-2026 16:00:00",
}


class FakeLive:
    def stock_quote(self, symbol):
        return RAW_QUOTE


class FakeNse:
    def announcements(self, symbol, from_date, to_date):
        return [
            {"symbol": "TCS", "an_dt": "16-Oct-2026 16:29:00", "desc": "Investor Meet", "attchmntText": "Schedule", "attchmntFile": "https://x/a.pdf"},
            {"symbol": "TCS", "an_dt": "19-Oct-2026 11:30:07", "desc": "Updates", "attchmntText": "Press release", "attchmntFile": "https://x/b.pdf"},
            {"symbol": "TCSOTHER", "an_dt": "19-Oct-2026 11:30:07", "desc": "Other", "attchmntText": "", "attchmntFile": None},
        ]

    def actions(self, symbol, from_date, to_date):
        return [{"symbol": "TCS", "subject": "Interim Dividend - Rs 12 Per Share", "exDate": "14-Oct-2026", "recDate": "14-Oct-2026"}]

    def board_meetings(self, symbol, from_date, to_date):
        # NSE lists the same meeting twice
        return [
            {"bm_symbol": "TCS", "bm_date": "23-Oct-2026", "bm_desc": "Results and dividend"},
            {"bm_symbol": "TCS", "bm_date": "23-Oct-2026", "bm_desc": "Board Meeting Intimation"},
        ]


@pytest.fixture
def fake_nse(monkeypatch):
    monkeypatch.setattr(nse_data_service, "_live_client", lambda: FakeLive())
    monkeypatch.setattr(nse_data_service, "_nse_client", lambda: FakeNse())


def test_quote_is_normalized(fake_nse):
    q = nse_data_service.get_quote("tcs")
    assert q["price"] == 2460.9
    assert q["change"] == pytest.approx(-4.1)
    assert q["change_percent"] == pytest.approx(-0.17)
    assert q["pe_ratio"] == pytest.approx(17.17)
    assert q["delivery_percent"] == 57.0


def test_quote_returns_none_when_nse_is_down():
    assert nse_data_service.get_quote("TCS") is None


def test_market_quote_prefers_nse_and_falls_back_to_yahoo(fake_nse, monkeypatch):
    class FakeTicker:
        info = {}
        recommendations = None
        balance_sheet = None
        financials = None

        def history(self, period="1mo", interval="1d"):
            raise AssertionError("yfinance prices should not be used when NSE answers")

    monkeypatch.setattr("app.services.market_data.yf.Ticker", lambda _: FakeTicker())
    monkeypatch.setattr(market_service, "_get_screener_metrics", lambda _: {"pe_ratio": 99.0, "roe": 0.3})

    quote = market_service.get_current_price("TCS", "NSE")

    assert quote["data_source"] == "NSE"
    assert quote["price"] == 2460.9
    assert quote["previous_close"] == 2465.0
    assert quote["name"] == "Tata Consultancy Services Limited"
    assert quote["pe_ratio"] == pytest.approx(17.17)  # exchange value beats Screener
    assert quote["roe"] == 0.3  # Screener still fills what NSE doesn't report


def test_bse_symbols_skip_nse():
    assert not market_service._is_nse("TCS.BO", "NSE")
    assert not market_service._is_nse("TCS", "BSE")
    assert market_service._is_nse("TCS.NS", "US")


def test_daily_history_matches_yfinance_shape(monkeypatch):
    raw = pd.DataFrame({
        # NSE returns IST midnight as UTC (18:30 the previous day), newest first
        "DATE": pd.to_datetime(["2026-10-18 18:30", "2026-10-15 18:30"]),
        "OPEN": [2470.0, 2350.0], "HIGH": [2480.0, 2470.0], "LOW": [2450.0, 2340.0],
        "CLOSE": [2460.9, 2465.0], "VOLUME": [8676373, 12166634], "DELIVERY %": [57.0, 40.0],
    })
    monkeypatch.setattr("jugaad_data.nse.stock_df", lambda *a, **k: raw)

    df = nse_data_service.get_daily_history("TCS", "1mo")

    assert list(df.index.strftime("%Y-%m-%d")) == ["2026-10-16", "2026-10-19"]
    assert list(df.columns[:5]) == ["Open", "High", "Low", "Close", "Volume"]
    assert df["Close"].iloc[-1] == 2460.9


def test_unsupported_period_uses_fallback():
    assert nse_data_service.get_daily_history("TCS", "5d") is None


def test_events_are_filtered_to_symbol_sorted_and_deduplicated(fake_nse):
    events = nse_data_service.get_events("TCS")

    assert [a["subject"] for a in events["announcements"]] == ["Updates", "Investor Meet"]
    assert events["corporate_actions"] == [
        {"subject": "Interim Dividend - Rs 12 Per Share", "ex_date": "2026-10-14T00:00:00", "record_date": "2026-10-14T00:00:00"}
    ]
    assert events["upcoming_results"] == [
        {"date": "2026-10-23T00:00:00", "purpose": "Board Meeting", "description": "Results and dividend"}
    ]


def test_events_are_empty_when_nse_is_down():
    assert nse_data_service.get_events("TCS") == {
        "symbol": "TCS", "upcoming_results": [], "corporate_actions": [], "announcements": []
    }
