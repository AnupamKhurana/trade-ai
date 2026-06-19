from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List
from app.core.llm import get_llm
from app.services.agent_engine import run_agent_stream
import json

router = APIRouter()


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[Message]
    use_search: bool = False
    context_symbol: str | None = None
    context_exchange: str = "NSE"


# ------------------------------------------------------------------ #
# Streaming endpoint — powered by the agentic engine                   #
# ------------------------------------------------------------------ #
@router.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    """
    Streaming chat endpoint using Server-Sent Events.

    The agent engine handles:
      • System prompt / harness construction
      • Tool schema generation and dispatch
      • Parallel web search via DuckDuckGo
      • Live stock data via get_stock_data tool
      • Agentic loop (tool call → result → next turn)

    SSE event shapes sent to the client:
      data: {"token": "..."}                          — streamed content token
      data: {"tool_call": {"name": "...", "args": {}}} — tool being invoked
      data: {"tool_result": {"name": "...", "preview": "..."}} — tool result preview
      data: {"done": true}                             — stream finished
      data: {"error": "..."}                           — error
    """
    user_messages = [{"role": m.role, "content": m.content} for m in request.messages]

    async def event_generator():
        try:
            async for sse_chunk in run_agent_stream(
                user_messages=user_messages,
                symbol=request.context_symbol,
                exchange=request.context_exchange,
            ):
                yield sse_chunk
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ------------------------------------------------------------------ #
# Non-streaming endpoint (kept for compatibility)                       #
# ------------------------------------------------------------------ #
@router.post("/chat")
async def chat(request: ChatRequest):
    """Non-streaming fallback — collects the full agent response."""
    user_messages = [{"role": m.role, "content": m.content} for m in request.messages]
    full_response = ""

    try:
        async for sse_chunk in run_agent_stream(
            user_messages=user_messages,
            symbol=request.context_symbol,
            exchange=request.context_exchange,
        ):
            # Parse SSE lines and collect content tokens only
            if sse_chunk.startswith("data: "):
                try:
                    payload = json.loads(sse_chunk[6:])
                    if "token" in payload:
                        full_response += payload["token"]
                except json.JSONDecodeError:
                    pass

        return {"role": "assistant", "content": full_response}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI Service Error: {str(e)}")
