import requests
import pandas as pd
import io

URL = "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "Accept": "*/*",
    "Referer": "https://www.nseindia.com/"
}

def test_fetch():
    try:
        print(f"Fetching {URL}...")
        response = requests.get(URL, headers=HEADERS, timeout=10)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            df = pd.read_csv(io.StringIO(response.content.decode('utf-8')))
            print("Columns:", df.columns.tolist())
            print(f"Rows: {len(df)}")
            print(df.head())
        else:
            print("Failed to fetch.")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_fetch()
