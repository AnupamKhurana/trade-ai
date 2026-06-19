from app.services.web_search import web_search_service
from app.core.llm import get_llm
from app.core.cache import cache, NEWS_TTL
import json
import os
import csv

class NewsService:
    def get_augmented_news(self, symbol: str, exchange: str = "NSE") -> dict:
        cache_key = f"augmented_news:{symbol}:{exchange}"
        cached = cache.get(cache_key)
        if cached:
            return cached

        from app.services.news_aggregator import news_aggregator
        results = news_aggregator.get_raw_news(symbol, exchange)

        if not results:
            return {"symbol": symbol, "articles": [], "sources": []}

        # Collect unique sources
        sources = []
        seen_urls = set()
        for r in results:
            url = r.get("href")
            if url and url not in seen_urls:
                seen_urls.add(url)
                sources.append({
                    "title": r.get("title", ""),
                    "url": url
                })

        # 2. Use LLM to compile and augment these news articles (Optimized: process 6 instead of 10 items, truncate summaries to 150 chars to save prefill tokens)
        headlines_input = []
        for i, r in enumerate(results[:6]):
            date_str = r.get("date") or "N/A"
            body_snippet = (r.get("body") or "")[:150]
            headlines_input.append(f"Art [{i}]: T: {r['title']} | S: {body_snippet} | L: {r['href']} | D: {date_str}")
        
        prompt = f"""Compile the top 4 most stock-impacting news items for {symbol} from these raw summaries.
Raw articles:
{"\n".join(headlines_input)}

Return JSON only in this exact format:
{{
  "articles": [
    {{
      "title": "Concise professional title",
      "body": "One-sentence high-impact summary of stock significance.",
      "href": "original Link",
      "date": "original Date"
    }}
  ]
}}"""
        llm = get_llm()
        if not llm.llm:
            return {"symbol": symbol, "articles": results, "sources": sources}

        try:
            response = llm.chat(
                messages=[
                    {"role": "system", "content": "You are a professional financial news editor. Output only JSON."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=-1,
                temperature=0.1
            )
            content = response['choices'][0]['message']['content'].strip()
            
            # Clean JSON markdown blocks
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]
            
            start = content.find('{')
            end = content.rfind('}')
            if start != -1 and end != -1:
                content = content[start:end+1]

            data = json.loads(content)
            compiled_articles = data.get("articles", [])
            
            # Validate output, fallback if empty
            if not compiled_articles:
                compiled_articles = results[:5]
                
            final_response = {"symbol": symbol, "articles": compiled_articles, "sources": sources}
            cache.set(cache_key, final_response, NEWS_TTL)
            return final_response

        except Exception as e:
            print(f"Error compiling news with LLM: {e}")
            return {"symbol": symbol, "articles": results[:5], "sources": sources}

news_service = NewsService()
