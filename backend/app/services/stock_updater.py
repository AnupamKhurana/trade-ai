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
        # Path to frontend stocks.json
        self.output_path = Path(__file__).parent.parent.parent.parent / "frontend" / "src" / "lib" / "stocks.json"
        
        # Path to downloads folder
        self.downloads_dir = Path(__file__).parent.parent.parent / "downloads"
        self.downloads_dir.mkdir(exist_ok=True)

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

    def _is_updated_today(self):
        # Must have both JSON and CSV
        csv_path = self.downloads_dir / "EQUITY_L.csv"
        
        if not self.output_path.exists() or not csv_path.exists():
            return False
            
        mtime = datetime.datetime.fromtimestamp(self.output_path.stat().st_mtime)
        today = datetime.datetime.now()
        
        return mtime.date() == today.date()

stock_update_service = StockUpdateService()
