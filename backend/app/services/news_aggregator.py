import os
import csv
import yfinance as yf
import dateutil.parser
from datetime import datetime, timezone
from app.core.cache import cache
from app.services.web_search import web_search_service

RAW_NEWS_TTL = 300  # Cache raw news for 5 minutes

class NewsAggregator:
    def get_raw_news(self, symbol: str, exchange: str = "NSE") -> list:
        cache_key = f"raw_news:{symbol}:{exchange}"
        cached = cache.get(cache_key)
        if cached:
            print(f"DEBUG: Returning cached raw news for {symbol}")
            return cached

        print(f"DEBUG: Performing fresh raw news fetch for {symbol}")
        results = []
        seen_urls = set()

        def add_results(news_list):
            for item in news_list:
                url = item.get("href") or item.get("url")
                if url and url not in seen_urls:
                    seen_urls.add(url)
                    results.append(item)

        # 0. Exchange filings — the most price-relevant "news" for NSE stocks
        if exchange.upper() in ("NSE", "BSE"):
            if exchange.upper() == "NSE":
                from app.services.nse_data import nse_data_service as exchange_data
            else:
                from app.services.bse_data import bse_data_service as exchange_data
            filings = exchange_data.get_announcements(symbol, days=14, limit=5)
            add_results([
                {
                    "title": f"{symbol.upper()} filing: {f['subject']}",
                    "body": f["text"],
                    "href": f["url"],
                    "date": f["date"],
                    "source": exchange.upper(),
                }
                for f in filings
                if f.get("url")
            ])

        # 1. Fetch from yfinance
        try:
            from app.services.market_data import market_service
            ticker_symbol = market_service._get_ticker(symbol, exchange)
            ticker = yf.Ticker(ticker_symbol)
            yf_news = ticker.news
            if yf_news:
                yf_list = []
                for item in yf_news:
                    content = item.get("content")
                    if isinstance(content, dict):
                        title = content.get("title")
                        body = content.get("summary") or content.get("description", "")
                        click_through = content.get("clickThroughUrl")
                        canonical = content.get("canonicalUrl")
                        href = (click_through.get("url") if isinstance(click_through, dict) else None) or \
                               (canonical.get("url") if isinstance(canonical, dict) else None) or ""
                        date_val = content.get("pubDate")
                    else:
                        title = item.get("title")
                        body = item.get("summary") or item.get("description", "")
                        href = item.get("link") or ""
                        date_val = item.get("pubDate")

                    if not date_val:
                        pub_time = item.get("providerPublishTime")
                        if pub_time:
                            try:
                                date_val = datetime.fromtimestamp(int(pub_time)).isoformat()
                            except Exception:
                                pass

                    if title:
                        yf_list.append({
                            "title": title,
                            "body": body,
                            "href": href,
                            "date": date_val
                        })
                add_results(yf_list)
        except Exception as e:
            print(f"Error fetching yfinance news: {e}")

        # Lookup company name for better search matching
        company_name = None
        try:
            csv_path = os.path.join(os.getcwd(), 'downloads', 'EQUITY_L.csv')
            if os.path.exists(csv_path):
                with open(csv_path, mode='r', encoding='utf-8') as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        if row['SYMBOL'] == symbol:
                            company_name = row['NAME OF COMPANY']
                            break
        except Exception as e:
            print(f"DEBUG: CSV Lookup failed: {e}")

        if not company_name:
            from app.services.market_data import market_service
            try:
                market_info = market_service.get_current_price(symbol, exchange)
                company_name = market_info.get("name") if market_info else symbol
            except Exception:
                company_name = symbol

        # B. Google News RSS
        if len(results) < 8:
            query_str = f"{company_name} stock news" if company_name and company_name != symbol else f"{symbol} stock market india"
            rss_results = web_search_service.search_google_news_rss(query_str, max_results=8)
            add_results(rss_results)

        # C. DuckDuckGo News
        if len(results) < 12:
            trusted_sites = "(site:moneycontrol.com OR site:economictimes.indiatimes.com OR site:livemint.com OR site:business-standard.com OR site:financialexpress.com OR site:cnbctv18.com OR site:ndtvprofit.com)"
            search_query = f"{company_name or symbol} stock news {trusted_sites}"
            ddg_news = web_search_service.search_news(search_query, max_results=8)
            if ddg_news:
                ddg_list = []
                for r in ddg_news:
                    ddg_list.append({
                        "title": r.get("title", ""),
                        "body": r.get("body", ""),
                        "href": r.get("href", r.get("url", "")),
                        "date": r.get("date")
                    })
                add_results(ddg_list)

        # Sort news by date (latest first)
        def get_timestamp(item):
            d_str = item.get("date")
            if not d_str:
                return datetime.min.replace(tzinfo=timezone.utc)
            try:
                dt = dateutil.parser.parse(d_str)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return dt
            except Exception:
                return datetime.min.replace(tzinfo=timezone.utc)
        
        results.sort(key=get_timestamp, reverse=True)

        cache.set(cache_key, results, RAW_NEWS_TTL)
        return results

news_aggregator = NewsAggregator()
