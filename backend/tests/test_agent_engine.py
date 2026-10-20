import asyncio
import json
import threading

from app.core.llm import get_llm
from app.services import agent_engine


def test_tools_run_off_the_event_loop_thread(monkeypatch):
    tool_threads = []

    def fake_tool(symbol: str, exchange: str) -> str:
        """Fake tool.

        Args:
            symbol: Ticker.
            exchange: Exchange.
        """
        tool_threads.append(threading.get_ident())
        return "ok"

    calls = {"n": 0}

    async def fake_stream_chat(messages, tools=None, temperature=0.7):
        calls["n"] += 1
        if calls["n"] == 1:
            tool_call = {"id": "1", "function": {"name": "get_stock_data", "arguments": {"symbol": "X", "exchange": "NSE"}}}
            yield {"type": "done", "content": "", "tool_calls": [tool_call]}
        else:
            yield {"type": "content", "text": "done"}
            yield {"type": "done", "content": "done", "tool_calls": []}

    monkeypatch.setitem(agent_engine.STOCK_TOOLS, "get_stock_data", fake_tool)
    monkeypatch.setattr(get_llm(), "stream_chat", fake_stream_chat)

    async def run():
        loop_thread = threading.get_ident()
        events = [e async for e in agent_engine.run_agent_stream([{"role": "user", "content": "hi"}], "X")]
        return loop_thread, events

    loop_thread, events = asyncio.run(run())

    assert tool_threads and tool_threads[0] != loop_thread
    payloads = [json.loads(e[6:]) for e in events]
    assert {"tool_result": {"name": "get_stock_data", "preview": "ok"}} in payloads
    assert payloads[-1] == {"done": True}
