import nselib
from nselib import capital_market
import json
import pandas as pd

def fetch_all_stocks():
    print("Fetching NSE Equity List...")
    try:
        # Fetch equity list using nselib
        data = capital_market.equity_list()
        
        # Convert to list of dicts
        # Expected columns: SYMBOL, NAME OF COMPANY, etc.
        stocks = []
        for index, row in data.iterrows():
            stocks.append({
                "symbol": row['SYMBOL'],
                "name": row['NAME OF COMPANY']
            })
            
        print(f"Fetched {len(stocks)} stocks.")
        
        # Save to JSON
        output_path = "../../frontend/src/lib/stocks.json"
        with open(output_path, "w") as f:
            json.dump(stocks, f, indent=2)
            
        print(f"Saved to {output_path}")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    fetch_all_stocks()
