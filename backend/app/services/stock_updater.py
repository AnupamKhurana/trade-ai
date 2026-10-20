import requests
import pandas as pd
import io
import json
import os
import datetime
from pathlib import Path

# NSE Direct CSV Link
NSE_EQUITY_URL = "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "Accept": "*/*",
    "Referer": "https://www.nseindia.com/"
}

class StockUpdateService:
    def __init__(self):
        # Written to the backend's untracked data dir and served via
        # /api/market/symbols. The frontend bundles a seed copy as a fallback,
        # so the daily refresh never touches tracked source files.
        self.output_path = Path(__file__).parent.parent.parent / "data" / "stocks.json"
        
        # Path to downloads folder
        self.downloads_dir = Path(__file__).parent.parent.parent / "downloads"
        self.downloads_dir.mkdir(exist_ok=True)
        self._stocks_cache: list | None = None
        self._stocks_mtime: float | None = None

    def update_stocks(self):
        print("Checking for Stock List Updates...")
        if self._is_updated_today():
            print("Stock list is up to date.")
            return

        try:
            print(f"Downloading Equities from {NSE_EQUITY_URL}...")
            response = requests.get(NSE_EQUITY_URL, headers=HEADERS, timeout=30)
            
            if response.status_code == 200:
                # Save CSV to downloads folder
                csv_path = self.downloads_dir / "EQUITY_L.csv"
                with open(csv_path, "wb") as f:
                    f.write(response.content)
                print(f"Saved CSV to {csv_path}")

                # Read from the saved file
                df = pd.read_csv(csv_path)
                
                stocks = []
                for _, row in df.iterrows():
                    stocks.append({
                        "symbol": row['SYMBOL'].strip(),
                        "name": row['NAME OF COMPANY'].strip()
                    })
                
                # Ensure directory exists
                self.output_path.parent.mkdir(parents=True, exist_ok=True)
                
                with open(self.output_path, "w") as f:
                    json.dump(stocks, f, indent=2)
                
                print(f"Successfully updated {len(stocks)} stocks to {self.output_path}")
            else:
                print(f"Failed to fetch NSE list. Status: {response.status_code}")

        except Exception as e:
            print(f"Error updating stock list: {e}")

    def get_stocks(self) -> list:
        """Return the latest downloaded NSE equity list, or [] if none yet."""
        if not self.output_path.exists():
            return []
        mtime = self.output_path.stat().st_mtime
        if self._stocks_cache is None or mtime != self._stocks_mtime:
            try:
                with open(self.output_path) as f:
                    self._stocks_cache = json.load(f)
                self._stocks_mtime = mtime
            except (OSError, json.JSONDecodeError) as e:
                print(f"Error reading stock list: {e}")
                return []
        return self._stocks_cache

    def _is_updated_today(self):
        # Must have both JSON and CSV
        csv_path = self.downloads_dir / "EQUITY_L.csv"
        
        if not self.output_path.exists() or not csv_path.exists():
            return False
            
        mtime = datetime.datetime.fromtimestamp(self.output_path.stat().st_mtime)
        today = datetime.datetime.now()
        
        return mtime.date() == today.date()

stock_update_service = StockUpdateService()
