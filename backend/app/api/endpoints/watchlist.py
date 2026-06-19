import os
import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "data")
WATCHLIST_FILE = os.path.join(DATA_DIR, "watchlist.json")

def load_watchlist() -> list:
    if not os.path.exists(WATCHLIST_FILE):
        return []
    try:
        with open(WATCHLIST_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return []

def save_watchlist(data: list):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(WATCHLIST_FILE, "w") as f:
        json.dump(data, f, indent=2)

class WatchlistItem(BaseModel):
    symbol: str
    exchange: str = "NSE"

@router.get("")
def get_watchlist():
    items = load_watchlist()
    from app.services.market_data import market_service
    results = []
    for item in items:
        sym = item.get("symbol")
        exch = item.get("exchange", "NSE")
        try:
            quote = market_service.get_current_price(sym, exch)
            results.append({
                "symbol": sym,
                "exchange": exch,
                "price": quote.get("price"),
                "change": quote.get("change"),
                "change_percent": quote.get("change_percent"),
                "company_name": quote.get("company_name")
            })
        except Exception:
            results.append({
                "symbol": sym,
                "exchange": exch,
                "price": None,
                "change": None,
                "change_percent": None,
                "company_name": sym
            })
    return results

@router.post("")
def add_to_watchlist(item: WatchlistItem):
    items = load_watchlist()
    if any(s["symbol"].upper() == item.symbol.upper() and s.get("exchange", "NSE").upper() == item.exchange.upper() for s in items):
        return {"status": "success", "message": "Already in watchlist"}
    
    items.append({"symbol": item.symbol.upper(), "exchange": item.exchange.upper()})
    save_watchlist(items)
    return {"status": "success", "message": f"Added {item.symbol} to watchlist"}

@router.delete("/{symbol}")
def remove_from_watchlist(symbol: str, exchange: str = "NSE"):
    items = load_watchlist()
    filtered = [s for s in items if not (s["symbol"].upper() == symbol.upper() and s.get("exchange", "NSE").upper() == exchange.upper())]
    if len(filtered) == len(items):
        raise HTTPException(status_code=404, detail="Symbol not found in watchlist")
    save_watchlist(filtered)
    return {"status": "success", "message": f"Removed {symbol} from watchlist"}
