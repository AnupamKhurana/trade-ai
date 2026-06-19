from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from app.services.market_data import market_service
from app.services.sentiment import sentiment_service
from app.services.prediction import prediction_service
from app.services.news import news_service
import csv
import io

router = APIRouter()

@router.get("/quote/{symbol}")
def get_quote(symbol: str, exchange: str = "NSE"):
    data = market_service.get_current_price(symbol, exchange=exchange)
    if not data:
        raise HTTPException(status_code=404, detail="Stock not found")
    return data

@router.get("/history/{symbol}")
def get_history(symbol: str, period: str = "1mo", interval: str = "1d", exchange: str = "NSE"):
    data = market_service.get_historical_data(symbol, period=period, interval=interval, exchange=exchange)
    return data

@router.get("/sentiment/{symbol}")
def get_sentiment(symbol: str, exchange: str = "NSE"):
    return sentiment_service.analyze_sentiment(symbol, exchange)

@router.get("/predict/{symbol}")
def get_prediction(symbol: str, exchange: str = "NSE"):
    return prediction_service.predict(symbol, exchange)

@router.get("/news/{symbol}")
def get_news(symbol: str, exchange: str = "NSE"):
    """Dedicated news endpoint for a stock symbol, augmented by LLM."""
    return news_service.get_augmented_news(symbol, exchange)

@router.get("/export/{symbol}")
def export_csv(symbol: str, period: str = "3mo", exchange: str = "NSE"):
    """Export historical data as CSV."""
    data = market_service.get_historical_data(symbol, period=period, exchange=exchange)
    if not data:
        raise HTTPException(status_code=404, detail="No data found")
    
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=data[0].keys())
    writer.writeheader()
    writer.writerows(data)
    
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={symbol}_{period}.csv"}
    )
