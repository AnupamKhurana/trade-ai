from fastapi import APIRouter
from app.api.endpoints import market, advisor, watchlist, portfolio

api_router = APIRouter()
api_router.include_router(market.router, prefix="/market", tags=["market"])
api_router.include_router(advisor.router, prefix="/advisor", tags=["advisor"])
api_router.include_router(watchlist.router, prefix="/watchlist", tags=["watchlist"])
api_router.include_router(portfolio.router, prefix="/portfolio", tags=["portfolio"])

