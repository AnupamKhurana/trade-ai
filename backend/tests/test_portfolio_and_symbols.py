import json

import pytest

from app.api.endpoints import portfolio
from app.services.market_data import market_service
from app.services.stock_updater import StockUpdateService


def test_portfolio_pnl(monkeypatch):
    holdings = [
        {"id": "a", "symbol": "AAA", "exchange": "NSE", "qty": 10, "buy_price": 100.0},
        {"id": "b", "symbol": "BBB", "exchange": "NSE", "qty": 5, "buy_price": 200.0},
    ]
    prices = {"AAA": 110.0, "BBB": 180.0}
    monkeypatch.setattr(portfolio, "load_portfolio", lambda: holdings)
    monkeypatch.setattr(market_service, "get_current_price", lambda sym, exch: {"price": prices[sym]})

    result = portfolio.get_portfolio()

    assert [h["pnl"] for h in result["holdings"]] == pytest.approx([100.0, -100.0])
    assert result["summary"]["total_invested"] == pytest.approx(2000.0)
    assert result["summary"]["total_value"] == pytest.approx(2000.0)
    assert result["summary"]["total_pnl_percent"] == pytest.approx(0.0)


def test_stock_list_is_read_from_backend_data_dir(tmp_path):
    service = StockUpdateService()
    assert "frontend" not in str(service.output_path)

    service.output_path = tmp_path / "stocks.json"
    assert service.get_stocks() == []

    service.output_path.write_text(json.dumps([{"symbol": "TCS", "name": "Tata Consultancy"}]))
    assert service.get_stocks() == [{"symbol": "TCS", "name": "Tata Consultancy"}]
