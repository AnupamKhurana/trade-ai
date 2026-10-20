"""
Market-wide data from NSE: index levels, FII/DII activity and bulk/block deals.

Indices come from jugaad-data, deals and FII/DII from the nse library
(bulk deals fall back to jugaad-data's daily bulk.csv). All keyless; every
call is best-effort and returns empty data on failure.
"""
import csv
import io
from datetime import date, datetime, timedelta
from typing import Optional

from app.core.cache import cache
from app.services.nse_data import nse_data_service

INDICES_TTL = 60            # 1 minute
FII_DII_TTL = 900           # 15 minutes (published once a day after close)
DEALS_TTL = 900

# Shown as headline cards, in this order, when NSE reports them
HEADLINE_INDICES = ["NIFTY 50", "NIFTY BANK", "NIFTY NEXT 50", "NIFTY MIDCAP 100", "NIFTY IT", "INDIA VIX"]


def _num(value) -> Optional[float]:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _nse_date(value: str) -> Optional[str]:
    """'19-Oct-2026' / '19-OCT-2026' -> '2026-10-19'."""
    try:
        return datetime.strptime(value.strip().title(), "%d-%b-%Y").date().isoformat()
    except (ValueError, AttributeError):
        return None


class MarketOverviewService:
    def get_overview(self) -> dict:
        """Market status, index levels and advance/decline counts."""
        cached = cache.get("market_overview")
        if cached:
            return cached

        try:
            live = nse_data_service._live_client()
            raw = live.all_indices()
        except Exception as e:
            print(f"Warning: NSE indices failed: {e}")
            return {"status": None, "indices": [], "headline": [], "breadth": None}

        indices = []
        for r in raw.get("data", []):
            last, prev = _num(r.get("last")), _num(r.get("previousClose"))
            if last is None:
                continue
            indices.append({
                "name": r.get("indexSymbol") or r.get("index"),
                "group": (r.get("key") or "").title(),
                "last": last,
                "change": _num(r.get("variation")),
                "change_percent": _num(r.get("percentChange")),
                "previous_close": prev,
                "open": _num(r.get("open")),
                "high": _num(r.get("high")),
                "low": _num(r.get("low")),
                "year_high": _num(r.get("yearHigh")),
                "year_low": _num(r.get("yearLow")),
                "pe": _num(r.get("pe")),
                "pb": _num(r.get("pb")),
                "dividend_yield": _num(r.get("dy")),
                "change_30d_percent": _num(r.get("perChange30d")),
                "change_1y_percent": _num(r.get("perChange365d")),
            })

        by_name = {i["name"]: i for i in indices}
        headline = [by_name[n] for n in HEADLINE_INDICES if n in by_name]

        status = None
        try:
            for m in live.market_status().get("marketState", []):
                if m.get("market") == "Capital Market":
                    status = {"open": m.get("marketStatus") == "Open", "message": m.get("marketStatusMessage"),
                              "as_of": m.get("tradeDate")}
        except Exception as e:
            print(f"Warning: NSE market status failed: {e}")

        breadth = None
        if raw.get("advances") is not None:
            breadth = {"advances": int(_num(raw.get("advances")) or 0), "declines": int(_num(raw.get("declines")) or 0),
                       "unchanged": int(_num(raw.get("unchanged")) or 0)}

        result = {"status": status, "indices": indices, "headline": headline, "breadth": breadth}
        if indices:
            cache.set("market_overview", result, INDICES_TTL)
        return result

    def get_fii_dii(self) -> list:
        """Latest-session buy/sell/net (₹ crore) for FII/FPI and DII."""
        cached = cache.get("fii_dii")
        if cached is not None:
            return cached
        try:
            raw = nse_data_service._nse_client()._transport.request("https://www.nseindia.com/api/fiidiiTradeReact").json()
        except Exception as e:
            print(f"Warning: NSE FII/DII failed: {e}")
            return []
        rows = [
            {
                "category": r.get("category"),
                "date": _nse_date(r.get("date")),
                "buy": _num(r.get("buyValue")),
                "sell": _num(r.get("sellValue")),
                "net": _num(r.get("netValue")),
            }
            for r in raw if isinstance(r, dict)
        ]
        cache.set("fii_dii", rows, FII_DII_TTL)
        return rows

    def get_deals(self, days: int = 7, symbol: Optional[str] = None) -> list:
        """Bulk and block deals, newest first (history report plus the latest daily file)."""
        days = max(1, min(days, 30))
        cache_key = f"deals:{days}"
        deals = cache.get(cache_key)
        if deals is None:
            deals = self._fetch_deals(days)
            if deals:
                cache.set(cache_key, deals, DEALS_TTL)
        if symbol:
            deals = [d for d in deals if d["symbol"] == symbol.upper()]
        return deals

    def _fetch_deals(self, days: int) -> list:
        today = date.today()
        deals = []
        try:
            client = nse_data_service._nse_client()
            for kind in ("bulk_deals", "block_deals"):
                try:
                    rows = client.bulk_deals(kind, from_date=today - timedelta(days=days), to_date=today)
                except RuntimeError:
                    continue  # NSE raises when a report is empty for the range
                for r in rows:
                    deals.append({
                        "date": _nse_date(r.get("BD_DT_DATE")),
                        "type": "Bulk" if kind == "bulk_deals" else "Block",
                        "symbol": r.get("BD_SYMBOL"),
                        "name": r.get("BD_SCRIP_NAME"),
                        "client": r.get("BD_CLIENT_NAME"),
                        "side": r.get("BD_BUY_SELL"),
                        "quantity": _num(r.get("BD_QTY_TRD")),
                        "price": _num(r.get("BD_TP_WATP")),
                    })
        except Exception as e:
            print(f"Warning: NSE deals failed: {e}")

        # NSE's history report lags the latest session by a few days, while
        # the daily bulk.csv is current, so merge the two (deduplicated).
        def key(d):
            return (d["date"], d["type"], d["symbol"], d["client"], d["side"], d["quantity"], d["price"])

        seen = {key(d) for d in deals}
        cutoff = (today - timedelta(days=days)).isoformat()
        for d in self._fetch_daily_bulk_csv():
            if key(d) not in seen and (d["date"] or "") >= cutoff:
                seen.add(key(d))
                deals.append(d)
        deals.sort(key=lambda d: (d["date"] or "", d["symbol"] or ""), reverse=True)
        return deals

    def _fetch_daily_bulk_csv(self) -> list:
        """Latest session's bulk deals from NSE's daily archive file (jugaad-data)."""
        try:
            from jugaad_data.nse import NSEArchives
            text = NSEArchives().bulk_deals_raw()
        except Exception as e:
            print(f"Warning: NSE bulk.csv failed: {e}")
            return []
        return [
            {
                "date": _nse_date(r.get("Date")),
                "type": "Bulk",
                "symbol": (r.get("Symbol") or "").strip(),
                "name": (r.get("Security Name") or "").strip(),
                "client": (r.get("Client Name") or "").strip(),
                "side": (r.get("Buy/Sell") or "").strip(),
                "quantity": _num(r.get("Quantity Traded")),
                "price": _num(r.get("Trade Price / Wght. Avg. Price")),
            }
            for r in csv.DictReader(io.StringIO(text))
        ]


market_overview_service = MarketOverviewService()
