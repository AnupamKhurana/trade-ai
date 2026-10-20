"""
NSE data provider — quotes and daily history via jugaad-data, corporate
events (filings, actions, board meetings) via nse (NseIndiaApi).

These scrape NSE's public website, so every call is best-effort: on any
failure they return None / [] and callers fall back to yfinance.
"""
import threading
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional

import pandas as pd

from app.core.cache import cache

NSE_QUOTE_TTL = 60          # 1 minute
NSE_HISTORY_TTL = 300       # 5 minutes
NSE_EVENTS_TTL = 1800       # 30 minutes

# Cookie/download dir for the nse and bse clients (untracked, like backend/data)
EXCHANGE_CACHE_DIR = Path(__file__).parent.parent.parent / "data" / "exchange_cache"

# Chart periods -> calendar days of daily history to request
PERIOD_DAYS = {
    "1mo": 31,
    "3mo": 92,
    "6mo": 183,
    "1y": 366,
    "2y": 731,
}


def _num(value) -> Optional[float]:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _parse_nse_date(value: str) -> Optional[str]:
    """'17-Oct-2026 19:32:52' or '21-Oct-2026' -> ISO string."""
    if not value or value == "-":
        return None
    for fmt in ("%d-%b-%Y %H:%M:%S", "%d-%b-%Y"):
        try:
            return datetime.strptime(value.strip(), fmt).isoformat()
        except ValueError:
            continue
    return None


class NSEDataService:
    def __init__(self):
        self._live = None
        self._nse = None
        self._lock = threading.Lock()

    # Clients are created lazily so importing the app never hits the network.
    def _live_client(self):
        with self._lock:
            if self._live is None:
                from jugaad_data.nse import NSELive
                self._live = NSELive()
            return self._live

    def _nse_client(self):
        with self._lock:
            if self._nse is None:
                from nse import NSE
                EXCHANGE_CACHE_DIR.mkdir(parents=True, exist_ok=True)
                self._nse = NSE(download_folder=EXCHANGE_CACHE_DIR)
            return self._nse

    # ------------------------------------------------------------------ #
    # Quotes                                                               #
    # ------------------------------------------------------------------ #
    def get_quote(self, symbol: str) -> Optional[dict]:
        """Live NSE equity quote, normalized. None if NSE is unreachable."""
        symbol = symbol.upper()
        cache_key = f"nse_quote:{symbol}"
        cached = cache.get(cache_key)
        if cached:
            return cached

        try:
            raw = self._live_client().stock_quote(symbol)
        except Exception as e:
            print(f"Warning: NSE quote failed for {symbol}: {e}")
            return None

        meta = raw.get("metaData") or {}
        trade = raw.get("tradeInfo") or {}
        price_info = raw.get("priceInfo") or {}
        sec = raw.get("secInfo") or {}

        price = _num(trade.get("lastPrice")) or _num(meta.get("closePrice"))
        previous_close = _num(meta.get("previousClose"))
        if price is None or previous_close is None:
            return None

        quote = {
            "price": round(price, 2),
            "previous_close": round(previous_close, 2),
            "change": round(price - previous_close, 2),
            "change_percent": round((price - previous_close) / previous_close * 100, 2) if previous_close else 0.0,
            "open": _num(meta.get("open")),
            "day_high": _num(meta.get("dayHigh")),
            "day_low": _num(meta.get("dayLow")),
            "high_52": _num(price_info.get("yearHigh")),
            "low_52": _num(price_info.get("yearLow")),
            "name": meta.get("companyName"),
            "isin": meta.get("isinCode"),
            "sector": sec.get("sector"),
            "industry": sec.get("basicIndustry"),
            "pe_ratio": _num(sec.get("pdSymbolPe")),
            "sector_pe": _num(sec.get("pdSectorPe")),
            "volume": _num(trade.get("totalTradedVolume")),
            "delivery_percent": _num(trade.get("deliveryToTradedQuantity")),
            "market_cap": _num(trade.get("totalMarketCap")),
            "last_update": raw.get("lastUpdateTime"),
        }
        cache.set(cache_key, quote, NSE_QUOTE_TTL)
        return quote

    # ------------------------------------------------------------------ #
    # Daily history                                                        #
    # ------------------------------------------------------------------ #
    def get_daily_history(self, symbol: str, period: str) -> Optional[pd.DataFrame]:
        """
        Daily OHLCV from NSE in the same shape yfinance returns (Date index,
        Open/High/Low/Close/Volume columns), plus Delivery_Percent.
        None if the period isn't supported or NSE is unreachable.
        """
        days = PERIOD_DAYS.get(period)
        if days is None:
            return None

        symbol = symbol.upper()
        cache_key = f"nse_history:{symbol}:{period}"
        cached = cache.get(cache_key)
        if cached is not None:
            return cached.copy()

        try:
            from jugaad_data.nse import stock_df
            to_date = date.today()
            raw = stock_df(symbol, to_date - timedelta(days=days), to_date)
        except Exception as e:
            print(f"Warning: NSE history failed for {symbol}: {e}")
            return None
        if raw is None or raw.empty:
            return None

        df = pd.DataFrame({
            # jugaad-data returns IST midnight expressed in UTC (18:30 the
            # previous day); rounding to the nearest day recovers the date.
            "Date": pd.to_datetime(raw["DATE"]).dt.round("D"),
            "Open": raw["OPEN"].astype(float),
            "High": raw["HIGH"].astype(float),
            "Low": raw["LOW"].astype(float),
            "Close": raw["CLOSE"].astype(float),
            "Volume": raw["VOLUME"].astype(float),
            "Delivery_Percent": pd.to_numeric(raw["DELIVERY %"], errors="coerce"),
        })
        df = df.drop_duplicates("Date").sort_values("Date").set_index("Date")
        cache.set(cache_key, df, NSE_HISTORY_TTL)
        return df.copy()

    # ------------------------------------------------------------------ #
    # Corporate events                                                     #
    # ------------------------------------------------------------------ #
    def _cached_events(self, cache_key: str, fetch) -> list:
        cached = cache.get(cache_key)
        if cached is not None:
            return cached
        try:
            rows = fetch(self._nse_client()) or []
        except Exception as e:
            print(f"Warning: NSE {cache_key} failed: {e}")
            return []
        cache.set(cache_key, rows, NSE_EVENTS_TTL)
        return rows

    def get_announcements(self, symbol: str, days: int = 30, limit: int = 15) -> list:
        """Recent exchange filings for one company, newest first."""
        symbol = symbol.upper()
        today = date.today()
        raw = self._cached_events(
            f"nse_announcements:{symbol}:{days}",
            lambda c: c.announcements(symbol=symbol, from_date=today - timedelta(days=days), to_date=today),
        )
        items = [
            {
                "date": _parse_nse_date(a.get("an_dt")),
                "subject": (a.get("desc") or "").strip(),
                "text": (a.get("attchmntText") or "").strip(),
                "url": a.get("attchmntFile"),
            }
            for a in raw
            if (a.get("symbol") or "").upper() == symbol
        ]
        items.sort(key=lambda x: x["date"] or "", reverse=True)
        return items[:limit]

    def get_corporate_actions(self, symbol: str) -> list:
        """Dividends, splits, bonuses etc. with ex-dates from 30 days ago to 90 days ahead."""
        symbol = symbol.upper()
        today = date.today()
        raw = self._cached_events(
            f"nse_actions:{symbol}",
            lambda c: c.actions(symbol=symbol, from_date=today - timedelta(days=30), to_date=today + timedelta(days=90)),
        )
        actions = [
            {
                "subject": r.get("subject"),
                "ex_date": _parse_nse_date(r.get("exDate")),
                "record_date": _parse_nse_date(r.get("recDate")),
            }
            for r in raw
            if (r.get("symbol") or "").upper() == symbol
        ]
        actions.sort(key=lambda x: x["ex_date"] or "", reverse=True)
        return actions

    def get_upcoming_results(self, symbol: str) -> list:
        """Board meetings in the next 90 days (usually results and dividends)."""
        symbol = symbol.upper()
        today = date.today()
        raw = self._cached_events(
            f"nse_board_meetings:{symbol}",
            lambda c: c.board_meetings(symbol=symbol, from_date=today, to_date=today + timedelta(days=90)),
        )
        meetings = [
            {
                "date": _parse_nse_date(r.get("bm_date")),
                "purpose": "Board Meeting",
                "description": r.get("bm_desc"),
            }
            for r in raw
            if (r.get("bm_symbol") or "").upper() == symbol
        ]
        # NSE often lists the same meeting twice (intimation + agenda); keep one per date
        unique = {}
        for m in sorted(meetings, key=lambda x: x["date"] or ""):
            unique.setdefault(m["date"], m)
        return list(unique.values())

    def get_events(self, symbol: str) -> dict:
        return {
            "symbol": symbol.upper(),
            "upcoming_results": self.get_upcoming_results(symbol),
            "corporate_actions": self.get_corporate_actions(symbol),
            "announcements": self.get_announcements(symbol),
        }


nse_data_service = NSEDataService()
