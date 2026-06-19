from app.services.market_data import market_service
from app.core.llm import get_llm
from app.core.cache import cache, PREDICTION_TTL
import numpy as np

class PredictionService:
    def predict(self, symbol: str, exchange: str = "NSE"):
        cache_key = f"prediction:{symbol}:{exchange}"
        cached = cache.get(cache_key)
        # Only return cached result if it has a real AI analysis
        if cached and cached.get("ai_analysis"):
            return cached

        # 1. Get Historical Data
        data = market_service.get_historical_data(symbol, period="3mo", exchange=exchange)
        if not data:
            return {"error": "No data found"}
            
        latest = data[-1]
        
        # 2. Simple Linear Trend (Manual linear regression on last 10 days close)
        closes = [d['Close'] for d in data[-10:]]
        x = np.arange(len(closes))
        y = np.array(closes)
        A = np.vstack([x, np.ones(len(x))]).T
        m, c = np.linalg.lstsq(A, y, rcond=None)[0]
        
        next_day_prediction = m * len(closes) + c
        trend_direction = "UP" if m > 0 else "DOWN"
        
        # 3. LLM Contextual Analysis
        # Determine RSI zone for clearer context
        rsi_val = latest['RSI']
        if rsi_val < 30:
            rsi_zone = "oversold territory"
        elif rsi_val > 70:
            rsi_zone = "overbought territory"
        else:
            rsi_zone = "neutral zone"

        price_vs_sma = "above" if latest['Close'] > latest['SMA_20'] else "below"
        price_vs_sma50 = "above" if latest['Close'] > latest['SMA_50'] else "below"

        technicals = f"""
        Current Price: {latest['Close']:.2f}
        RSI (14): {rsi_val:.2f} ({rsi_zone})
        MACD: {latest['MACD']:.2f} (Signal Line: {latest['Signal_Line']:.2f})
        SMA 20: {latest['SMA_20']:.2f} (Price is {price_vs_sma} SMA 20)
        SMA 50: {latest['SMA_50']:.2f} (Price is {price_vs_sma50} SMA 50)
        Linear Trend Slope: {m:.2f} (Direction: {trend_direction})
        """

        prompt = f"""Analyze technical indicators for {symbol} and produce a structured markdown report using the exact format below.

Technical Indicators:
{technicals}

Format (use exactly these headers, max 1 sentence per section):
### Signal Overview
One sentence summarizing the overall technical posture (bullish/bearish/neutral) and confidence.

### Momentum
One sentence interpreting RSI and MACD (divergences or confirmations).

### Trend & Moving Averages
One sentence on price vs SMA 20/50 and the linear trend slope.

### Key Risk
One sentence on the primary technical risk or opportunity.

Rules:
- Use **bold** for every numeric value you mention.
- Keep each section strictly to 1 sentence.
- Output ONLY the formatted markdown. No preamble, no sign-off."""

        llm = get_llm()
        ai_analysis = "LLM not loaded."
        if llm.llm:
            try:
                response = llm.chat(
                    messages=[
                        {"role": "system", "content": "You are a concise, structured technical analyst. You always respond in clean markdown with the exact sections requested by the user."},
                        {"role": "user", "content": prompt}
                    ],
                    max_tokens=-1  # Unlimited — local model has no token cost
                )
                msg = response['choices'][0]['message']
                content = (msg.get('content') or '').strip()
                # Fallback: some thinking models put the final answer in reasoning_content
                # Only use it if it actually contains our expected markdown headers
                if not content:
                    rc = (msg.get('reasoning_content') or '')
                    if '### Signal Overview' in rc:
                        # Extract just the markdown section (after the last thinking block)
                        idx = rc.rfind('### Signal Overview')
                        content = rc[idx:].strip()
                ai_analysis = content
            except Exception as e:
                ai_analysis = f"Error in AI analysis: {e}"

        result = {
            "symbol": symbol,
            "current_price": latest['Close'],
            "predicted_next_day": round(next_day_prediction, 2),
            "trend": trend_direction,
            "ai_analysis": ai_analysis
        }
        # Only cache if AI analysis was successfully generated
        if ai_analysis and ai_analysis not in ("LLM not loaded.",) and not ai_analysis.startswith("Error"):
            cache.set(cache_key, result, PREDICTION_TTL)
        return result

prediction_service = PredictionService()
