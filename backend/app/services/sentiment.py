from app.services.web_search import web_search_service
from app.core.llm import get_llm
from app.core.cache import cache, SENTIMENT_TTL
import json

class SentimentService:
    def analyze_sentiment(self, symbol: str, exchange: str = "NSE"):
        cache_key = f"sentiment:{symbol}:{exchange}"
        cached = cache.get(cache_key)
        if cached:
            cached["source"] = "cache"
            return cached

        # 1. Get News
        from app.services.news_aggregator import news_aggregator
        results = news_aggregator.get_raw_news(symbol, exchange)

        if not results:
            print(f"DEBUG: No news found for {symbol}")
            return {"score": 0, "summary": "No news found.", "news": []}

        # 2. Prepare context (Optimized: limit to top 8 items, truncate body to 150 chars to save prefill tokens)
        headlines_input = []
        for res in results[:8]:
            body_snippet = (res.get('body') or '')[:150]
            headlines_input.append(f"- Title: {res['title']}\n  Snippet: {body_snippet}")
        headlines = "\n".join(headlines_input)
        
        # 3. Prompt LLM (Optimized for fast inference and raw JSON generation)
        prompt = f"""Evaluate news sentiment for {symbol}.
Headlines:
{headlines}

Return JSON only in this exact format:
{{
  "score": float (-1.0 to 1.0),
  "summary": "One-sentence overview of sentiment impact."
}}"""
        
        llm = get_llm()
        if not llm.llm:
             return {"score": 0, "summary": "LLM not loaded. Cannot analyze sentiment.", "news": results}

        try:
            response = llm.chat(
                messages=[
                    {"role": "system", "content": "You are a financial sentiment analyzer. Output only JSON."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=-1,
                temperature=0.1
            )
            content = response['choices'][0]['message']['content']
            
            # Clean and extract JSON robustly
            cleaned_content = content.strip()
            if "```json" in cleaned_content:
                cleaned_content = cleaned_content.split("```json")[1].split("```")[0]
            elif "```" in cleaned_content:
                cleaned_content = cleaned_content.split("```")[1].split("```")[0]
            
            # Find JSON boundaries
            start = cleaned_content.find('{')
            end = cleaned_content.rfind('}')
            if start != -1 and end != -1:
                cleaned_content = cleaned_content[start:end+1]

            result = None
            try:
                result = json.loads(cleaned_content)
            except json.JSONDecodeError:
                # Fallback: attempt basic single quote correction
                try:
                    import re
                    corrected = re.sub(r"'\s*(\w+)\s*'\s*:", r'"\1":', cleaned_content)
                    corrected = re.sub(r":\s*'\s*([^']*)\s*'", r': "\1"', corrected)
                    result = json.loads(corrected)
                except Exception:
                    pass

            if not result:
                # Regex fallback extraction of fields
                import re
                score = 0.0
                summary = "Neutral market sentiment."
                
                score_match = re.search(r'"score"\s*:\s*(-?\d+\.?\d*)', cleaned_content)
                if not score_match:
                    score_match = re.search(r"'score'\s*:\s*(-?\d+\.?\d*)", cleaned_content)
                if score_match:
                    try:
                        score = float(score_match.group(1))
                    except ValueError:
                        pass
                
                summary_match = re.search(r'"summary"\s*:\s*"([^"]+)"', cleaned_content)
                if not summary_match:
                    summary_match = re.search(r"'summary'\s*:\s*'([^']+)'", cleaned_content)
                if summary_match:
                    summary = summary_match.group(1)

                result = {"score": score, "summary": summary}

            result["news"] = results
            cache.set(cache_key, result, SENTIMENT_TTL)
            return result
        except Exception as e:
            print(f"Error in sentiment analysis: {e}")
            return {"score": 0, "summary": "Error analyzing sentiment.", "details": str(e), "news": results or []}

sentiment_service = SentimentService()
