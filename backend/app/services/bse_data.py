"""
BSE data provider — quotes, valuation ratios and corporate events straight
from BSE via the community library bse (BseIndiaApi).

It scrapes BSE's public website, so every call is best-effort: on any failure
it returns None / [] and callers fall back to the next source.
"""
import threading
from datetime import date, datetime, timedelta
from typing import Optional

from app.core.cache import cache
from app.services.nse_data import EXCHANGE_CACHE_DIR

BSE_QUOTE_TTL = 60          # 1 minute
BSE_EVENTS_TTL = 1800       # 30 minutes
BSE_LOOKUP_TTL = 86400      # 1 day (symbol -> scrip code rarely changes)

ATTACHMENT_URL = "https://www.bseindia.com/xml-data/corpfiling/AttachLive/{}"


def _num(value) -> Optional[float]:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _parse_bse_date(value: str) -> Optional[str]:
    """'23 Oct 2026', '20261023' or '2026-10-19T15:41:22.607' -> ISO string."""
    if not value:
        return None
    value = value.strip()
    for fmt in ("%d %b %Y", "%Y%m%d", "%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(value, fmt).isoformat()
        except ValueError:
            continue
    return None


class BSEDataService:
    def __init__(self):
        self._client = None
        # The bse client shares one requests session; serialize access to it.
        self._lock = threading.Lock()

    def _call(self, fn):
        with self._lock:
            if self._client is None:
                from bse import BSE
                EXCHANGE_CACHE_DIR.mkdir(parents=True, exist_ok=True)
                self._client = BSE(download_folder=EXCHANGE_CACHE_DIR)
            return fn(self._client)

    def lookup(self, symbol: str) -> Optional[dict]:
        """{'bse_code', 'company_name', 'isin'} for a trading symbol, or None if not listed on BSE."""
        symbol = symbol.upper()
        cache_key = f"bse_lookup:{symbol}"
        cached = cache.get(cache_key)
        if cached is not None:
            return cached or None  # {} caches "not on BSE"

        try:
            found = self._call(lambda b: b.lookup(symbol))
        except Exception as e:
            print(f"Warning: BSE lookup failed for {symbol}: {e}")
            return None
        info = {}
        if found and (found.get("symbol") or "").upper() == symbol and found.get("bse_code"):
            info = {"bse_code": str(found["bse_code"]), "company_name": found.get("company_name"), "isin": found.get("isin")}
        cache.set(cache_key, info, BSE_LOOKUP_TTL)
        return info or None

    def get_quote(self, symbol: str) -> Optional[dict]:
        """Live BSE quote with ratios, normalized like NSEDataService.get_quote."""
        symbol = symbol.upper()
        cache_key = f"bse_quote:{symbol}"
        cached = cache.get(cache_key)
        if cached:
            return cached

        info = self.lookup(symbol)
        if not info:
            return None
        code = info["bse_code"]

        try:
            raw = self._call(lambda b: b.quote(code))
        except Exception as e:
            print(f"Warning: BSE quote failed for {symbol}: {e}")
            return None
        price = _num(raw.get("LTP"))
        previous_close = _num(raw.get("PrevClose"))
        if not price or not previous_close:
            return None

        # Ratios and 52-week range are nice-to-have; a failure here keeps the price.
        meta, weekly = {}, {}
        try:
            meta = self._call(lambda b: b.equityMetaInfo(code)) or {}
            weekly = self._call(lambda b: b.quoteWeeklyHL(code)) or {}
        except Exception as e:
            print(f"Warning: BSE meta info failed for {symbol}: {e}")

        pb = _num(meta.get("PB"))
        roe = _num(meta.get("ROE"))
        quote = {
            "price": round(price, 2),
            "previous_close": round(previous_close, 2),
            "change": round(price - previous_close, 2),
            "change_percent": round((price - previous_close) / previous_close * 100, 2),
            "open": _num(raw.get("Open")),
            "day_high": _num(raw.get("High")),
            "day_low": _num(raw.get("Low")),
            "high_52": _num(weekly.get("fifty2WeekHigh")),
            "low_52": _num(weekly.get("fifty2WeekLow")),
            "name": info.get("company_name"),
            "isin": info.get("isin") or meta.get("ISIN"),
            "sector": meta.get("Sector"),
            "industry": meta.get("Industry"),
            "pe_ratio": _num(meta.get("PE")),
            "book_value": round(price / pb, 2) if pb else None,
            "roe": roe / 100 if roe is not None else None,
            "bse_code": code,
        }
        cache.set(cache_key, quote, BSE_QUOTE_TTL)
        return quote

    # ------------------------------------------------------------------ #
    # Corporate events                                                     #
    # ------------------------------------------------------------------ #
    def _cached_events(self, cache_key: str, fetch):
        cached = cache.get(cache_key)
        if cached is not None:
            return cached
        try:
            data = self._call(fetch)
        except Exception as e:
            print(f"Warning: BSE {cache_key} failed: {e}")
            return None
        cache.set(cache_key, data, BSE_EVENTS_TTL)
        return data

    def get_announcements(self, symbol: str, days: int = 30, limit: int = 15) -> list:
        info = self.lookup(symbol)
        if not info:
            return []
        now = datetime.now()
        raw = self._cached_events(
            f"bse_announcements:{info['bse_code']}:{days}",
            lambda b: b.announcements(scripcode=info["bse_code"], from_date=now - timedelta(days=days), to_date=now),
        )
        rows = (raw or {}).get("Table", []) if isinstance(raw, dict) else (raw or [])
        items = [
            {
                "date": _parse_bse_date(a.get("NEWS_DT") or a.get("DT_TM")),
                "subject": (a.get("CATEGORYNAME") or "").strip(),
                "text": (a.get("NEWSSUB") or a.get("HEADLINE") or "").strip(),
                "url": ATTACHMENT_URL.format(a["ATTACHMENTNAME"]) if a.get("ATTACHMENTNAME") else a.get("NSURL"),
            }
            for a in rows
        ]
        items.sort(key=lambda x: x["date"] or "", reverse=True)
        return items[:limit]

    def get_corporate_actions(self, symbol: str) -> list:
        """Actions with ex-dates from 30 days ago to 90 days ahead (BSE returns full history)."""
        info = self.lookup(symbol)
        if not info:
            return []
        raw = self._cached_events(f"bse_actions:{info['bse_code']}", lambda b: b.actions(scripcode=info["bse_code"]))
        start = (date.today() - timedelta(days=30)).isoformat()
        end = (date.today() + timedelta(days=90)).isoformat()
        actions = []
        for r in raw or []:
            ex_date = _parse_bse_date(r.get("exdate") or r.get("Ex_date"))
            if ex_date and start <= ex_date[:10] <= end:
                actions.append({
                    "subject": (r.get("Purpose") or "").strip(),
                    "ex_date": ex_date,
                    "record_date": _parse_bse_date(r.get("RD_Date")),
                })
        actions.sort(key=lambda x: x["ex_date"], reverse=True)
        return actions

    def get_upcoming_results(self, symbol: str) -> list:
        info = self.lookup(symbol)
        if not info:
            return []
        raw = self._cached_events(f"bse_results:{info['bse_code']}", lambda b: b.resultCalendar(scripcode=info["bse_code"]))
        today = date.today().isoformat()
        results = [
            {"date": _parse_bse_date(r.get("meeting_date")), "purpose": "Results", "description": None}
            for r in raw or []
        ]
        return sorted((r for r in results if (r["date"] or "") >= today), key=lambda x: x["date"])

    def get_events(self, symbol: str) -> dict:
        return {
            "symbol": symbol.upper(),
            "upcoming_results": self.get_upcoming_results(symbol),
            "corporate_actions": self.get_corporate_actions(symbol),
            "announcements": self.get_announcements(symbol),
        }


bse_data_service = BSEDataService()
