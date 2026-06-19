import concurrent.futures
from typing import List

try:
    from ddgs import DDGS as _DDGS            # ddgs >= 9.x (new package name)
except ImportError:
    from duckduckgo_search import DDGS as _DDGS  # fallback


def parallel_web_search(queries: List[str]) -> str:
    """
    Perform a parallel web search using DuckDuckGo across multiple query variations
    and return the combined, deduplicated results as a formatted string.

    Args:
        queries: A list of up to 5 search query variations to look up simultaneously.
    """
    variations = queries[:5]

    def fetch(q: str):
        try:
            results = _DDGS().text(q, max_results=3)
            if not results:
                results = _DDGS().news(q, max_results=3)
            return q, results or []
        except Exception:
            return q, []

    all_results = []
    seen_urls: set = set()

    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        futures = {executor.submit(fetch, v): v for v in variations}
        for future in concurrent.futures.as_completed(futures):
            _, res = future.result()
            for r in res:
                url = r.get("href", r.get("url", ""))
                if url and url not in seen_urls:
                    seen_urls.add(url)
                    title = r.get("title", "")
                    snippet = r.get("body", r.get("snippet", ""))
                    all_results.append(f"Title: {title}\nURL: {url}\nSnippet: {snippet}")

    return "\n\n".join(all_results[:10]) if all_results else "No results found."


from duckduckgo_search import DDGS

class WebSearchService:
    def search(self, query: str, max_results: int = 5):
        try:
            with DDGS() as ddgs:
                # Force India region (English) for better stock news
                results = list(ddgs.text(query, region='in-en', max_results=max_results))
                print(f"DEBUG: Web Search for '{query}' returned {len(results)} results.")
                return results
        except Exception as e:
            print(f"Error searching web: {e}")
            return []

    def search_news(self, query: str, max_results: int = 5):
        try:
            with DDGS() as ddgs:
                # Use news-specific search from DuckDuckGo
                # We can also append trusted sites to the query if needed, but ddgs.news is usually better
                results = list(ddgs.news(query, region='in-en', max_results=max_results))
                print(f"DEBUG: News Search for '{query}' returned {len(results)} results.")
                return results
        except Exception as e:
            print(f"Error searching news: {e}")
            return []

    def search_google_news_rss(self, query: str, max_results: int = 10):
        import urllib.request
        import xml.etree.ElementTree as ET
        import urllib.parse
        import re
        
        results = []
        try:
            encoded_query = urllib.parse.quote(query)
            url = f"https://news.google.com/rss/search?q={encoded_query}&hl=en-IN&gl=IN&ceid=IN:en"
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=5) as response:
                xml_data = response.read()
            root = ET.fromstring(xml_data)
            for item in root.findall('.//item')[:max_results]:
                title = item.find('title')
                link = item.find('link')
                pub_date = item.find('pubDate')
                
                title_text = title.text if title is not None else ""
                link_text = link.text if link is not None else ""
                
                desc = item.find('description')
                desc_text = ""
                if desc is not None and desc.text:
                    desc_text = re.sub(r'<[^>]+>', '', desc.text)
                    if len(desc_text) > 200:
                        desc_text = desc_text[:200] + "..."
                
                if title_text and link_text:
                    results.append({
                        "title": title_text,
                        "body": desc_text,
                        "href": link_text,
                        "date": pub_date.text if pub_date is not None else None
                    })
            print(f"DEBUG: Google News RSS for '{query}' returned {len(results)} results.")
        except Exception as e:
            print(f"Error fetching Google News RSS: {e}")
        return results

    def get_formatted_search_results(self, query: str) -> str:
        results = self.search(query)
        if not results:
            return "No web search results found."
        
        formatted = f"Web Search Results for '{query}':\n\n"
        for i, res in enumerate(results, 1):
            formatted += f"{i}. {res['title']}\n   Source: {res['href']}\n   Snippet: {res['body']}\n\n"
        return formatted

web_search_service = WebSearchService()

