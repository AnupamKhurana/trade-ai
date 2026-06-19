import yfinance as yf

def test_ticker(symbol):
    print(f"Testing {symbol}...")
    ticker = yf.Ticker(symbol)
    try:
        hist = ticker.history(period="1d")
        print(f"History (Empty={hist.empty}):")
        print(hist)
        if not hist.empty:
            print(f"Price: {hist['Close'].iloc[-1]}")
    except Exception as e:
        print(f"Error: {e}")

test_ticker("TCS.NS")
test_ticker("BAJFINANCE.NS")
