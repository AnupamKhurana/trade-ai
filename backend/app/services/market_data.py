import yfinance as yf
import pandas as pd
import numpy as np
from app.core.cache import cache, QUOTE_TTL, HISTORY_TTL
from app.services.nse_data import nse_data_service
from app.services.bse_data import bse_data_service

class MarketDataService:
    def _get_ticker(self, symbol: str, exchange: str = "NSE") -> str:
        """Builds the yfinance ticker symbol based on exchange."""
        symbol = symbol.upper()
        # If user already provided a suffix, respect it
        if symbol.endswith(".NS") or symbol.endswith(".BO"):
            return symbol
        
        exchange = exchange.upper()
        if exchange == "BSE":
            return f"{symbol}.BO"
        elif exchange == "US":
            return symbol  # US stocks have no suffix
        else:
            # Default: NSE
            return f"{symbol}.NS"

    def _is_nse(self, symbol: str, exchange: str) -> bool:
        """True when the symbol trades on NSE (no explicit BSE suffix)."""
        if symbol.upper().endswith(".BO"):
            return False
        return symbol.upper().endswith(".NS") or exchange.upper() == "NSE"

    def _is_indian(self, symbol: str, exchange: str) -> bool:
        return symbol.upper().endswith((".NS", ".BO")) or exchange.upper() in ("NSE", "BSE")

    def _base_symbol(self, symbol: str) -> str:
        return symbol.upper().removesuffix(".NS").removesuffix(".BO")

    def _get_screener_metrics(self, symbol: str) -> dict:
        """Fetches key financial metrics from screener.in for Indian stocks."""
        clean_symbol = symbol.split(".")[0].upper()
        url = f"https://www.screener.in/company/{clean_symbol}/"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
        metrics = {}
        try:
            import requests
            from bs4 import BeautifulSoup
            response = requests.get(url, headers=headers, timeout=5)
            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')
                for li in soup.find_all('li', class_='flex flex-space-between'):
                    name_el = li.find('span', class_='name')
                    value_el = li.find('span', class_='number')
                    if name_el and value_el:
                        name = name_el.text.strip().lower()
                        val_str = value_el.text.strip().replace(",", "")
                        try:
                            val = float(val_str)
                        except ValueError:
                            val = val_str
                        
                        if "market cap" in name:
                            metrics["market_cap"] = val * 10000000
                        elif "current price" in name:
                            metrics["price"] = val
                        elif "pe" in name or "p/e" in name:
                            metrics["pe_ratio"] = val
                        elif "book value" in name:
                            metrics["book_value"] = val
                        elif "dividend yield" in name:
                            metrics["dividend_yield"] = val / 100.0 if isinstance(val, (int, float)) else val
                        elif "roce" in name:
                            metrics["roce"] = val / 100.0 if isinstance(val, (int, float)) else val
                        elif "roe" in name:
                            metrics["roe"] = val / 100.0 if isinstance(val, (int, float)) else val
        except Exception as e:
            print(f"Warning: Failed to fetch metrics from Screener.in for {clean_symbol}: {e}")
        return metrics

    def get_current_price(self, symbol: str, exchange: str = "NSE"):
        cache_key = f"quote:{symbol}:{exchange}"
        cached = cache.get(cache_key)
        if cached:
            return cached

        ticker_symbol = self._get_ticker(symbol, exchange)
        ticker = yf.Ticker(ticker_symbol)
        try:
            # Indian stocks: take price data straight from the exchange.
            # NSE first (for NSE stocks), then BSE if the stock is listed
            # there, then yfinance (delayed, sometimes missing small caps).
            exch_quote, data_source = None, None
            if self._is_nse(symbol, exchange):
                exch_quote = nse_data_service.get_quote(self._base_symbol(symbol))
                data_source = "NSE"
            if exch_quote is None and self._is_indian(symbol, exchange):
                exch_quote = bse_data_service.get_quote(self._base_symbol(symbol))
                data_source = "BSE"

            if exch_quote:
                current_price = exch_quote["price"]
                previous_close = exch_quote["previous_close"]
            else:
                # Fetch a few days so the day change can be measured against the
                # previous session's close, as brokers and exchanges report it.
                data = ticker.history(period="5d")
                if data.empty:
                    return None

                current_price = data["Close"].iloc[-1]
                if len(data) >= 2:
                    previous_close = data["Close"].iloc[-2]
                else:
                    previous_close = data["Open"].iloc[-1]
                data_source = "Yahoo Finance"
            
            # Default values
            long_name = symbol
            currency = "INR" if exchange != "US" else "USD"
            summary = ""
            market_cap = 0
            pe_ratio = 0
            book_value = 0
            dividend_yield = 0
            roe = 0
            roce = 0
            high_52 = 0
            low_52 = 0
            website = ""
            sector = ""
            industry = ""
            isin = ""
            analyst_ratings = {"strong_buy": 0, "buy": 0, "hold": 0, "sell": 0, "strong_sell": 0, "consensus": "N/A"}

            try:
                info = ticker.info
                long_name = info.get("longName", symbol)
                currency = info.get("currency", currency)
                summary = info.get("longBusinessSummary", "")
                market_cap = info.get("marketCap", 0)
                pe_ratio = info.get("trailingPE", 0)
                book_value = info.get("bookValue", 0)
                dividend_yield = info.get("dividendYield", 0)
                roe = info.get("returnOnEquity", 0)
                high_52 = info.get("fiftyTwoWeekHigh", 0)
                low_52 = info.get("fiftyTwoWeekLow", 0)
                website = info.get("website", "")
                sector = info.get("sector", "")
                industry = info.get("industry", "")
                isin = info.get("isin", "")

                # Calculate ROCE: EBIT / Capital Employed
                total_assets = info.get("totalAssets", 0)
                current_liabilities = info.get("totalCurrentLiabilities", 0) or info.get("currentLiabilities", 0)
                ebit = info.get("ebitda", 0) or info.get("ebit", 0)

                if not (total_assets and current_liabilities and ebit):
                    try:
                        bs = ticker.balance_sheet
                        fin = ticker.financials
                        if bs is not None and not bs.empty:
                            if not total_assets and "Total Assets" in bs.index:
                                val = bs.loc["Total Assets"].iloc[0]
                                if not pd.isna(val):
                                    total_assets = float(val)
                            if not current_liabilities and "Current Liabilities" in bs.index:
                                val = bs.loc["Current Liabilities"].iloc[0]
                                if not pd.isna(val):
                                    current_liabilities = float(val)
                        if fin is not None and not fin.empty:
                            if not ebit:
                                if "EBIT" in fin.index:
                                    val = fin.loc["EBIT"].iloc[0]
                                    if not pd.isna(val):
                                        ebit = float(val)
                                elif "EBITDA" in fin.index:
                                    val = fin.loc["EBITDA"].iloc[0]
                                    if not pd.isna(val):
                                        ebit = float(val)
                    except Exception as e:
                        print(f"Warning: Could not fetch balance sheet/financials for {symbol}: {e}")

                if total_assets and current_liabilities and ebit:
                    capital_employed = total_assets - current_liabilities
                    if capital_employed > 0:
                        roce = float(ebit / capital_employed)

            except Exception as e:
                print(f"Warning: Could not fetch info for {symbol}: {e}")

            # Overwrite/supplement with Screener.in metrics for Indian stocks
            if exchange in ("NSE", "BSE"):
                screener_data = self._get_screener_metrics(symbol)
                if screener_data:
                    if "roce" in screener_data:
                        roce = screener_data["roce"]
                    if "roe" in screener_data:
                        roe = screener_data["roe"]
                    if "pe_ratio" in screener_data:
                        pe_ratio = screener_data["pe_ratio"]
                    if "book_value" in screener_data:
                        book_value = screener_data["book_value"]
                    if "dividend_yield" in screener_data:
                        dividend_yield = screener_data["dividend_yield"]
                    if "market_cap" in screener_data:
                        market_cap = screener_data["market_cap"]

            # Exchange-reported values take precedence over Yahoo and Screener
            if exch_quote:
                long_name = exch_quote.get("name") or long_name
                sector = exch_quote.get("sector") or sector
                industry = exch_quote.get("industry") or industry
                isin = exch_quote.get("isin") or isin
                high_52 = exch_quote.get("high_52") or high_52
                low_52 = exch_quote.get("low_52") or low_52
                pe_ratio = exch_quote.get("pe_ratio") or pe_ratio
                market_cap = exch_quote.get("market_cap") or market_cap
                # BSE also reports these; use them only where nothing else did
                book_value = book_value or exch_quote.get("book_value") or 0
                roe = roe or exch_quote.get("roe") or 0

            # Fetch analyst recommendations
            try:
                recs = ticker.recommendations
                if recs is not None and not recs.empty:
                    latest = recs.iloc[-1] if len(recs) > 0 else None
                    if latest is not None:
                        strong_buy = int(latest.get("strongBuy", 0))
                        buy = int(latest.get("buy", 0))
                        hold = int(latest.get("hold", 0))
                        sell = int(latest.get("sell", 0))
                        strong_sell = int(latest.get("strongSell", 0))
                        
                        total = strong_buy + buy + hold + sell + strong_sell
                        if total > 0:
                            scores = {"Strong Buy": strong_buy, "Buy": buy, "Hold": hold, "Sell": sell, "Strong Sell": strong_sell}
                            consensus = max(scores, key=scores.get)
                        else:
                            consensus = "N/A"
                        
                        analyst_ratings = {
                            "strong_buy": strong_buy, "buy": buy, "hold": hold,
                            "sell": sell, "strong_sell": strong_sell, "consensus": consensus
                        }
            except Exception as e:
                print(f"Warning: Could not fetch recommendations for {symbol}: {e}")
            
            result = {
                "symbol": symbol,
                "ticker": ticker_symbol,
                "name": long_name,
                "price": round(current_price, 2),
                "change": round(current_price - previous_close, 2),
                "change_percent": round(((current_price - previous_close) / previous_close) * 100, 2),
                "previous_close": round(previous_close, 2),
                "currency": currency,
                "summary": summary,
                "market_cap": market_cap,
                "pe_ratio": pe_ratio,
                "book_value": book_value,
                "dividend_yield": dividend_yield,
                "roe": roe,
                "roce": roce,
                "high_52": high_52,
                "low_52": low_52,
                "website": website,
                "sector": sector,
                "industry": industry,
                "isin": isin,
                "analyst_ratings": analyst_ratings,
                "exchange": exchange,
                "volume": exch_quote.get("volume") if exch_quote else None,
                "delivery_percent": exch_quote.get("delivery_percent") if exch_quote else None,
                "sector_pe": exch_quote.get("sector_pe") if exch_quote else None,
                "data_source": data_source,
            }
            cache.set(cache_key, result, QUOTE_TTL)
            return result
        except Exception as e:
            print(f"Error fetching data for {symbol}: {e}")
            return None

    def get_historical_data(self, symbol: str, period: str = "1mo", interval: str = "1d", exchange: str = "NSE"):
        cache_key = f"history:{symbol}:{exchange}:{period}:{interval}"
        cached = cache.get(cache_key)
        if cached:
            return cached

        ticker_symbol = self._get_ticker(symbol, exchange)
        ticker = yf.Ticker(ticker_symbol)
        
        # For intraday intervals, yfinance limits the period
        # 1m: max 7 days, 5m: max 60 days, 15m: max 60 days
        if interval in ("1m", "2m", "5m", "15m", "30m", "60m", "90m"):
            if interval == "1m" and period not in ("1d", "5d", "7d"):
                period = "1d"
            elif interval in ("5m", "15m") and period not in ("1d", "5d", "1mo"):
                period = "5d"
        
        data = None
        if interval == "1d" and self._is_nse(symbol, exchange):
            data = nse_data_service.get_daily_history(self._base_symbol(symbol), period)
        if data is None or data.empty:
            data = ticker.history(period=period, interval=interval)
        
        if data.empty:
            return []
        
        # Calculate indicators on the fly
        data = self.calculate_indicators(data)
        
        data = data.reset_index()
        # Handle both Date and Datetime index names
        date_col = 'Datetime' if 'Datetime' in data.columns else 'Date'
        if interval in ("1m", "2m", "5m", "15m", "30m", "60m", "90m"):
            data['Date'] = data[date_col].dt.strftime('%Y-%m-%d %H:%M')
        else:
            data['Date'] = data[date_col].dt.strftime('%Y-%m-%d')
        
        if date_col != 'Date' and date_col in data.columns:
            data = data.drop(columns=[date_col])
        
        result = data.to_dict(orient="records")
        cache.set(cache_key, result, HISTORY_TTL)
        return result

    def calculate_indicators(self, data: pd.DataFrame):
        if data.empty:
            return data
            
        # RSI
        delta = data['Close'].diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
        rs = gain / loss
        data['RSI'] = 100 - (100 / (1 + rs))
        
        # SMA 20/50
        data['SMA_20'] = data['Close'].rolling(window=20).mean()
        data['SMA_50'] = data['Close'].rolling(window=50).mean()
        
        # MACD
        exp12 = data['Close'].ewm(span=12, adjust=False).mean()
        exp26 = data['Close'].ewm(span=26, adjust=False).mean()
        data['MACD'] = exp12 - exp26
        data['Signal_Line'] = data['MACD'].ewm(span=9, adjust=False).mean()
        data['MACD_Histogram'] = data['MACD'] - data['Signal_Line']

        # Bollinger Bands (bonus indicator)
        data['BB_Middle'] = data['Close'].rolling(window=20).mean()
        bb_std = data['Close'].rolling(window=20).std()
        data['BB_Upper'] = data['BB_Middle'] + (bb_std * 2)
        data['BB_Lower'] = data['BB_Middle'] - (bb_std * 2)

        return data.fillna(0)

market_service = MarketDataService()
