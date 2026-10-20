from datetime import date, timedelta

import pytest

from app.services import bse_data
from app.services.bse_data import bse_data_service
from app.services.market_data import market_service
from app.services.nse_data import nse_data_service

SOON = (date.today() + timedelta(days=3)).strftime("%d %b %Y")
RECENT_EX = (date.today() - timedelta(days=5)).strftime("%Y%m%d")


class FakeBSE:
    def lookup(self, text):
        if text == "INFY":
            return {"company_name": "INFOSYS LTD", "symbol": "INFY", "isin": "INE009A01021", "bse_code": "500209"}
        if text == "NEARMISS":
            return {"company_name": "Other", "symbol": "NEARMISSX", "isin": "X", "bse_code": "1"}
        return None

    def quote(self, code):
        return {"PrevClose": 1161.6, "Open": 1150.0, "High": 1160.0, "Low": 1125.0, "LTP": 1130.0}

    def equityMetaInfo(self, code):
        return {"PE": "15.11", "PB": "5.65", "ROE": "36.67", "Sector": "Information Technology", "Industry": "Software"}

    def quoteWeeklyHL(self, code):
        return {"fifty2WeekHigh": 1727.85, "fifty2WeekLow": 980.3}

    def announcements(self, scripcode, from_date, to_date):
        return {"Table": [
            {"NEWS_DT": "2026-10-13T10:00:00.000", "CATEGORYNAME": "Company Update", "NEWSSUB": "Older", "ATTACHMENTNAME": "a.pdf"},
            {"NEWS_DT": "2026-10-19T15:41:22.607", "CATEGORYNAME": "Company Update", "NEWSSUB": "Results on Oct 23", "ATTACHMENTNAME": "b.pdf"},
        ]}

    def actions(self, scripcode):
        return [
            {"exdate": "20001025", "Purpose": "Interim Dividend - Rs. - 2.5000", "RD_Date": "10 Nov 2000"},
            {"exdate": RECENT_EX, "Purpose": "Dividend - Rs. - 23.0000", "RD_Date": ""},
        ]

    def resultCalendar(self, scripcode):
        return [{"meeting_date": SOON, "Long_Name": "Infosys Ltd"}, {"meeting_date": "01 Jan 2000"}]


@pytest.fixture
def fake_bse(monkeypatch):
    client = FakeBSE()
    monkeypatch.setattr(bse_data_service, "_call", lambda fn: fn(client))


def test_quote_is_normalized(fake_bse):
    q = bse_data_service.get_quote("infy")
    assert q["price"] == 1130.0
    assert q["change_percent"] == pytest.approx(-2.72)
    assert q["pe_ratio"] == pytest.approx(15.11)
    assert q["book_value"] == pytest.approx(200.0)
    assert q["roe"] == pytest.approx(0.3667)
    assert q["high_52"] == 1727.85


def test_lookup_rejects_other_symbols(fake_bse):
    assert bse_data_service.lookup("NEARMISS") is None
    assert bse_data_service.get_quote("UNKNOWN") is None


def test_events_keep_recent_actions_and_future_results(fake_bse):
    events = bse_data_service.get_events("INFY")

    assert [a["text"] for a in events["announcements"]] == ["Results on Oct 23", "Older"]
    assert events["announcements"][0]["url"].endswith("/AttachLive/b.pdf")
    assert [a["subject"] for a in events["corporate_actions"]] == ["Dividend - Rs. - 23.0000"]
    assert len(events["upcoming_results"]) == 1


def _no_yahoo_prices(monkeypatch):
    class FakeTicker:
        info = {}
        recommendations = None
        balance_sheet = None
        financials = None

        def history(self, period="1mo", interval="1d"):
            raise AssertionError("yfinance prices should not be used when an exchange answers")

    monkeypatch.setattr("app.services.market_data.yf.Ticker", lambda _: FakeTicker())
    monkeypatch.setattr(market_service, "_get_screener_metrics", lambda _: {})


def test_bse_stock_uses_bse(fake_bse, monkeypatch):
    _no_yahoo_prices(monkeypatch)
    quote = market_service.get_current_price("INFY", "BSE")
    assert quote["data_source"] == "BSE"
    assert quote["price"] == 1130.0


def test_nse_stock_falls_back_to_bse_when_nse_is_down(fake_bse, monkeypatch):
    _no_yahoo_prices(monkeypatch)
    monkeypatch.setattr(nse_data_service, "get_quote", lambda symbol: None)
    quote = market_service.get_current_price("INFY", "NSE")
    assert quote["data_source"] == "BSE"
    assert quote["book_value"] == pytest.approx(200.0)


def test_us_stock_never_queries_bse(monkeypatch):
    def fail(fn):
        raise AssertionError("BSE should not be called for US stocks")

    monkeypatch.setattr(bse_data_service, "_call", fail)
    assert not market_service._is_indian("AAPL", "US")
