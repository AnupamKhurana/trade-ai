from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "TradeAI Terminal"
    # MODEL_PATH is no longer needed for internal loading, but we can keep it optional or remove
    LLAMA_API_URL: str = "http://localhost:8080/v1" # User running local llama.cpp server
    
    class Config:
        env_file = ".env"

settings = Settings()
