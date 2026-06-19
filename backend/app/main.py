from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.api import api_router
from app.core.config import settings
from app.services.stock_updater import stock_update_service
import threading

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Update stock list in background thread
    t = threading.Thread(target=stock_update_service.update_stocks, daemon=True)
    t.start()
    yield
    # Shutdown: nothing to clean up

app = FastAPI(title=settings.PROJECT_NAME, lifespan=lifespan)

# CORS
origins = [
    "http://localhost:3000",
    "http://localhost:3001",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")

@app.get("/")
def read_root():
    return {"message": f"{settings.PROJECT_NAME} API is running"}

