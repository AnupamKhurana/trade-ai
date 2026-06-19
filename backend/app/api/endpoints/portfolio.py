import os
import json
import uuid
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "data")
PORTFOLIO_FILE = os.path.join(DATA_DIR, "portfolio.json")

def load_portfolio() -> list:
    if not os.path.exists(PORTFOLIO_FILE):
        return []
    try:
        with open(PORTFOLIO_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return []

def save_portfolio(data: list):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(PORTFOLIO_FILE, "w") as f:
        json.dump(data, f, indent=2)

class HoldingItem(BaseModel):
    symbol: str
    exchange: str = "NSE"
    qty: float
    buy_price: float
    date: str | None = None

@router.get("")
def get_portfolio():
    holdings = load_portfolio()
    from app.services.market_data import market_service
    
    results = []
    total_invested = 0.0
    total_value = 0.0
    
    for item in holdings:
        h_id = item.get("id")
        sym = item.get("symbol")
        exch = item.get("exchange", "NSE")
        qty = item.get("qty", 0.0)
        buy_price = item.get("buy_price", 0.0)
        date = item.get("date")
        
        invested_value = qty * buy_price
        total_invested += invested_value
        
        current_price = None
        current_value = invested_value
        pnl = 0.0
        pnl_percent = 0.0
        
        try:
            quote = market_service.get_current_price(sym, exch)
            current_price = quote.get("price")
            if current_price is not None:
                current_value = qty * current_price
                pnl = current_value - invested_value
                pnl_percent = (pnl / invested_value * 100) if invested_value > 0 else 0.0
        except Exception:
            pass
            
        total_value += current_value
        
        results.append({
            "id": h_id,
            "symbol": sym,
            "exchange": exch,
            "qty": qty,
            "buy_price": buy_price,
            "date": date,
            "invested": invested_value,
            "current_price": current_price,
            "current_value": current_value,
            "pnl": pnl,
            "pnl_percent": pnl_percent
        })
        
    total_pnl = total_value - total_invested
    total_pnl_percent = (total_pnl / total_invested * 100) if total_invested > 0 else 0.0
    
    return {
        "holdings": results,
        "summary": {
            "total_invested": total_invested,
            "total_value": total_value,
            "total_pnl": total_pnl,
            "total_pnl_percent": total_pnl_percent
        }
    }

@router.post("")
def add_holding(holding: HoldingItem):
    holdings = load_portfolio()
    new_id = str(uuid.uuid4())
    
    new_holding = {
        "id": new_id,
        "symbol": holding.symbol.upper(),
        "exchange": holding.exchange.upper(),
        "qty": holding.qty,
        "buy_price": holding.buy_price,
        "date": holding.date
    }
    
    holdings.append(new_holding)
    save_portfolio(holdings)
    return {"status": "success", "message": "Holding added successfully", "holding": new_holding}

@router.delete("/{holding_id}")
def remove_holding(holding_id: str):
    holdings = load_portfolio()
    filtered = [h for h in holdings if h.get("id") != holding_id]
    if len(filtered) == len(holdings):
        raise HTTPException(status_code=404, detail="Holding not found")
    save_portfolio(filtered)
    return {"status": "success", "message": "Holding removed successfully"}
