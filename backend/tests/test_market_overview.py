import pytest

from app.services import market_overview
from app.services.market_overview import market_overview_service
from app.services.nse_data import nse_data_service


class FakeLive:
    def all_indices(self):
        return {
            "advances": "1644", "declines": "7854", "unchanged": "84",
            "data": [
                {"key": "BROAD MARKET INDICES", "indexSymbol": "NIFTY MIDCAP 100", "last": 58487.95, "variation": -650.0,
                 "percentChange": -1.09, "previousClose": 59137.95, "pe": "28.1"},
                {"key": "INDICES ELIGIBLE IN DERIVATIVES", "indexSymbol": "NIFTY 50", "last": 22888.95, "variation": -257.2,
                 "percentChange": -1.11, "previousClose": 23146.15, "pe": "19.33", "perChange365d": -11.43},
                {"key": "X", "indexSymbol": "BROKEN", "last": None},
            ],
        }

    def market_status(self):
        return {"marketState": [
            {"market": "Currency", "marketStatus": "Close"},
            {"market": "Capital Market", "marketStatus": "Close", "marketStatusMessage": "Market is Closed", "tradeDate": "19-Oct-2026 15:30"},
        ]}


class FakeTransport:
    def request(self, url):
        class R:
            def json(self):
                return [{"category": "FII/FPI", "date": "19-Oct-2026", "buyValue": "11240.64", "sellValue": "12389.28", "netValue": "-1148.64"}]
        return R()


class FakeNse:
    _transport = FakeTransport()

    def bulk_deals(self, kind, from_date, to_date):
        if kind == "block_deals":
            raise RuntimeError("No block_deals data")  # NSE raises on empty reports
        return [{"BD_DT_DATE": "15-OCT-2026", "BD_SYMBOL": "ABC", "BD_SCRIP_NAME": "ABC Ltd", "BD_CLIENT_NAME": "FUND A",
                 "BD_BUY_SELL": "BUY", "BD_QTY_TRD": 1000, "BD_TP_WATP": 10.5}]


@pytest.fixture
def fake_market(monkeypatch):
    monkeypatch.setattr(nse_data_service, "_live_client", lambda: FakeLive())
    monkeypatch.setattr(nse_data_service, "_nse_client", lambda: FakeNse())


def test_overview_orders_headline_indices_and_skips_bad_rows(fake_market):
    overview = market_overview_service.get_overview()

    assert [i["name"] for i in overview["indices"]] == ["NIFTY MIDCAP 100", "NIFTY 50"]
    assert [i["name"] for i in overview["headline"]] == ["NIFTY 50", "NIFTY MIDCAP 100"]
    assert overview["breadth"] == {"advances": 1644, "declines": 7854, "unchanged": 84}
    assert overview["status"] == {"open": False, "message": "Market is Closed", "as_of": "19-Oct-2026 15:30"}


def test_overview_is_empty_when_nse_is_down():
    assert market_overview_service.get_overview() == {"status": None, "indices": [], "headline": [], "breadth": None}


def test_fii_dii_is_normalized(fake_market):
    assert market_overview_service.get_fii_dii() == [
        {"category": "FII/FPI", "date": "2026-10-19", "buy": 11240.64, "sell": 12389.28, "net": -1148.64}
    ]


def test_fii_dii_is_empty_when_nse_is_down():
    assert market_overview_service.get_fii_dii() == []


def test_deals_merge_history_with_latest_daily_file_without_duplicates(fake_market, monkeypatch):
    from datetime import date

    today = date.today().isoformat()
    daily = [
        {"date": today, "type": "Bulk", "symbol": "XYZ", "name": "XYZ", "client": "FUND B", "side": "SELL", "quantity": 5.0, "price": 2.0},
        {"date": "2020-01-01", "type": "Bulk", "symbol": "OLD", "name": "OLD", "client": "C", "side": "BUY", "quantity": 1.0, "price": 1.0},
    ]
    monkeypatch.setattr(market_overview_service, "_fetch_daily_bulk_csv", lambda: daily + daily)

    deals = market_overview_service.get_deals(days=7)

    assert [d["symbol"] for d in deals] == ["XYZ", "ABC"] or {d["symbol"] for d in deals} == {"XYZ", "ABC"}
    assert len([d for d in deals if d["symbol"] == "XYZ"]) == 1  # deduplicated
    assert not any(d["symbol"] == "OLD" for d in deals)  # outside the window
    assert [d["symbol"] for d in market_overview_service.get_deals(days=7, symbol="abc")] == ["ABC"]


def test_daily_bulk_csv_is_parsed(monkeypatch):
    text = ("Date,Symbol,Security Name,Client Name,Buy/Sell,Quantity Traded,Trade Price / Wght. Avg. Price,Remarks\n"
            "19-OCT-2026,COMFINTE,Comfort Intech Ltd.,HJS SECURITIES PRIVATE LIMITED,BUY,1765231,9.22,-\n")

    class FakeArchives:
        def bulk_deals_raw(self):
            return text

    monkeypatch.setattr("jugaad_data.nse.NSEArchives", FakeArchives)

    assert market_overview_service._fetch_daily_bulk_csv() == [{
        "date": "2026-10-19", "type": "Bulk", "symbol": "COMFINTE", "name": "Comfort Intech Ltd.",
        "client": "HJS SECURITIES PRIVATE LIMITED", "side": "BUY", "quantity": 1765231.0, "price": 9.22,
    }]
