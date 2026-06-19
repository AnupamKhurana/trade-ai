"""
Agent Engine — adapted from llm_chat project.

Provides a full agentic streaming loop for the AI Advisor:
  1. Sends messages + available tools to the LLM
  2. If the model calls a tool → executes it → feeds result back → loops
  3. Streams content tokens to the caller throughout

Tool registry is extensible: add any typed Python function to STOCK_TOOLS.
"""
import datetime
import json
from typing import AsyncGenerator, Dict, Any, List, Optional

from app.core.llm import get_llm
from app.core.tool_schema import tools_to_schemas
from app.services.web_search import parallel_web_search


# ------------------------------------------------------------------ #
# Tool: web search (parallel DuckDuckGo)                              #
# ------------------------------------------------------------------ #
def web_search(queries: List[str]) -> str:
    """
    Search the web in parallel using DuckDuckGo for up to 5 query variations.
    Use this when you need real-time information such as live stock prices,
    recent company news, earnings reports, analyst ratings, or any fact
    that requires up-to-date data from the internet.

    Args:
        queries: Up to 5 distinct search query variations to run simultaneously for best coverage.
    """
    return parallel_web_search(queries)


# ------------------------------------------------------------------ #
# Tool: get live stock data                                            #
# ------------------------------------------------------------------ #
def get_stock_data(symbol: str, exchange: str) -> str:
    """
    Fetch the latest technical indicators and price data for a stock symbol.
    Use this to get RSI, MACD, SMA 20, SMA 50, and current price.

    Args:
        symbol: The stock ticker symbol (e.g., YESBANK, RELIANCE, AAPL).
        exchange: The stock exchange (NSE, BSE, or US).
    """
    try:
        from app.services.market_data import market_service
        data = market_service.get_historical_data(symbol, period="1mo", exchange=exchange)
        if not data:
            return f"No data found for {symbol} on {exchange}."
        latest = data[-1]
        price = latest.get("Close", 0)
        rsi = latest.get("RSI", 0)
        macd = latest.get("MACD", 0)
        signal = latest.get("Signal_Line", 0)
        sma20 = latest.get("SMA_20", 0)
        sma50 = latest.get("SMA_50", 0)

        rsi_zone = "oversold" if rsi < 30 else ("overbought" if rsi > 70 else "neutral")
        trend = "above" if price > sma20 else "below"

        return (
            f"Live data for {symbol} ({exchange}):\n"
            f"  Current Price: {price:.2f}\n"
            f"  RSI (14): {rsi:.2f} [{rsi_zone}]\n"
            f"  MACD: {macd:.2f} | Signal Line: {signal:.2f}\n"
            f"  SMA 20: {sma20:.2f} | SMA 50: {sma50:.2f}\n"
            f"  Price is {trend} its 20-day moving average.\n"
        )
    except Exception as e:
        return f"Error fetching stock data for {symbol}: {e}"


# ------------------------------------------------------------------ #
# Tool registry — add new tools here                                  #
# ------------------------------------------------------------------ #
STOCK_TOOLS = {
    "web_search": web_search,
    "get_stock_data": get_stock_data,
}


# ------------------------------------------------------------------ #
# Agent harness system prompt                                          #
# ------------------------------------------------------------------ #
def get_agent_harness(symbol: Optional[str] = None, exchange: str = "NSE") -> str:
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    if not symbol:
        return (
            f"You are TradeAI, an advanced AI stock market analyst with access to real-time tools.\n"
            f"Current date/time: {now}\n\n"
            "No stock has been selected yet. Politely ask the user to search for and select a stock "
            "on the dashboard before you can provide detailed analysis.\n\n"
            "Core principles:\n"
            "1. ACCURACY: Never guess facts — use web_search or get_stock_data for real-time data.\n"
            "2. CONCISENESS: Give clear, structured, actionable insights.\n"
            "3. SAFETY: Do not provide buy/sell recommendations. Present facts and analysis only."
        )

    return (
        f"You are TradeAI, an advanced AI stock market analyst with access to real-time tools.\n"
        f"Current date/time: {now}\n"
        f"Active stock under analysis: **{symbol}** on **{exchange}**.\n\n"
        f"You have two tools available:\n"
        f"  • web_search — search the internet for live news, prices, analyst reports, earnings.\n"
        f"  • get_stock_data — fetch live technical indicators (RSI, MACD, SMA) for any stock.\n\n"
        f"Workflow:\n"
        f"  1. For any question requiring real-time or recent data, ALWAYS call a tool first.\n"
        f"  2. Synthesise tool results with your analysis before responding.\n"
        f"  3. Focus your analysis on {symbol}. Politely decline questions about unrelated stocks.\n\n"
        f"Core principles:\n"
        f"  • ACCURACY: Never hallucinate data — fetch it via tools.\n"
        f"  • CONCISENESS: Structured, markdown-formatted answers.\n"
        f"  • SAFETY: Present analysis only — no direct buy/sell recommendations."
    )


# ------------------------------------------------------------------ #
# Agentic streaming loop                                               #
# ------------------------------------------------------------------ #
async def run_agent_stream(
    user_messages: List[Dict[str, Any]],
    symbol: Optional[str] = None,
    exchange: str = "NSE",
) -> AsyncGenerator[str, None]:
    """
    Async generator that drives the full agentic loop and yields SSE strings.

    Flow:
      1. Build system prompt + message history
      2. Call LLM with tools
      3. Stream content tokens → yield as SSE
      4. If LLM requested tool calls → execute them → append results → go to 2
      5. When LLM stops calling tools → yield done event
    """
    llm = get_llm()
    tool_funcs = list(STOCK_TOOLS.values())
    tool_schemas = tools_to_schemas(tool_funcs)

    # Build initial message list: system + conversation history
    system_msg = {"role": "system", "content": get_agent_harness(symbol, exchange)}
    messages: List[Dict[str, Any]] = [system_msg]

    # Append user-provided messages (skip any leading assistant message)
    first_user_seen = False
    for m in user_messages:
        if not first_user_seen and m.get("role") == "assistant":
            continue
        first_user_seen = True
        messages.append({"role": m["role"], "content": m["content"]})

    max_iterations = 6  # guard against infinite tool loops
    iteration = 0

    while iteration < max_iterations:
        iteration += 1
        collected_content = ""
        tool_calls_this_round: List[Dict] = []

        print(f"\n--- [AGENT ITERATION {iteration}] ---")
        print("MESSAGES SENT TO LLM:")
        print(json.dumps(messages, indent=2))
        if tool_schemas:
            print("TOOLS AVAILABLE:")
            print(json.dumps(tool_schemas, indent=2))

        # Stream one LLM turn
        async for event in llm.stream_chat(messages, tools=tool_schemas):
            etype = event["type"]

            if etype == "content":
                token = event["text"]
                collected_content += token
                yield f"data: {json.dumps({'token': token})}\n\n"

            elif etype == "thinking":
                # Don't send thinking tokens to frontend; silently discard
                pass

            elif etype == "done":
                collected_content = event.get("content", collected_content)
                tool_calls_this_round = event.get("tool_calls", [])

        print(f"ASSISTANT MESSAGE GENERATED:\n{collected_content}")
        if tool_calls_this_round:
            print(f"TOOL CALLS DETECTED: {json.dumps(tool_calls_this_round, indent=2)}")

        # Append assistant turn to history (strip reasoning from stored content)
        assistant_msg: Dict[str, Any] = {
            "role": "assistant",
            "content": collected_content,
        }
        if tool_calls_this_round:
            assistant_msg["tool_calls"] = tool_calls_this_round
        messages.append(assistant_msg)

        # If no tool calls, the model is done
        if not tool_calls_this_round:
            break

        # Execute each tool call and append results
        for tc in tool_calls_this_round:
            func_name = tc.get("function", {}).get("name", "")
            func_args = tc.get("function", {}).get("arguments", {})
            tool_id = tc.get("id", func_name)

            # Notify frontend a tool is running
            yield f"data: {json.dumps({'tool_call': {'name': func_name, 'args': func_args}})}\n\n"

            print(f"EXECUTING TOOL: {func_name} with args: {func_args}")

            tool_func = STOCK_TOOLS.get(func_name)
            if tool_func:
                try:
                    if isinstance(func_args, str):
                        func_args = json.loads(func_args)
                    result = tool_func(**func_args)
                except Exception as e:
                    result = f"Tool error: {e}"
            else:
                result = f"Unknown tool: {func_name}"

            print(f"TOOL RESULT: {result}")

            # Append tool result to history
            messages.append({
                "role": "tool",
                "tool_call_id": tool_id,
                "name": func_name,
                "content": str(result),
            })

            yield f"data: {json.dumps({'tool_result': {'name': func_name, 'preview': str(result)[:200]}})}\n\n"

    yield f"data: {json.dumps({'done': True})}\n\n"
