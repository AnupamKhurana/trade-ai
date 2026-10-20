"""
LLM Engine — wraps the local llama.cpp /v1 OpenAI-compatible API.

Two modes:
  chat()         — blocking, one-shot request (used by prediction & sentiment)
  stream_chat()  — async SSE streaming generator (used by the agentic advisor)
"""
import json
import asyncio
import requests
import aiohttp
from typing import AsyncGenerator, List, Dict, Any, Optional
from app.core.config import settings


class LLMUnavailableError(RuntimeError):
    """The LLM server is unreachable or returned an error."""


class LLMEngine:
    _instance = None

    def __init__(self):
        print(f"Initialized LLM Engine pointing to {settings.LLAMA_API_URL}")
        self.api_url = f"{settings.LLAMA_API_URL}/chat/completions"
        self.llm = True  # compatibility flag

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    # ------------------------------------------------------------------ #
    # Blocking one-shot request (prediction / sentiment)                   #
    # ------------------------------------------------------------------ #
    def chat(self, messages, max_tokens=-1, temperature=0.7):  # -1 = unlimited for local llama.cpp
        """
        Blocking one-shot completion. Raises LLMUnavailableError when the
        server can't be reached or returns an error, so callers never mistake
        an outage for a real answer (and never cache one).
        """
        payload = {
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        print("\n--- [BLOCKING CHAT REQUEST] ---")
        print(f"PAYLOAD: {json.dumps(payload, indent=2)}")
        try:
            response = requests.post(self.api_url, json=payload, timeout=300)
            response.raise_for_status()
            res_json = response.json()
        except requests.exceptions.ConnectionError as e:
            print("ERROR: Connection to Llama Server failed.")
            raise LLMUnavailableError(
                f"Could not connect to the local LLM server at {settings.LLAMA_API_URL}. Is it running?"
            ) from e
        except Exception as e:
            print(f"LLM API Error: {e}")
            raise LLMUnavailableError(f"Error interacting with AI: {e}") from e
        print(f"RESPONSE: {json.dumps(res_json, indent=2)}")
        return res_json

    # ------------------------------------------------------------------ #
    # Async SSE streaming generator (agentic advisor loop)                 #
    # ------------------------------------------------------------------ #
    async def stream_chat(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None,
        temperature: float = 0.7,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Async generator that streams a llama.cpp chat/completions response.

        Yields dicts of one of these shapes:
          {"type": "content",   "text": "..."}        — streamed output token(s)
          {"type": "thinking",  "text": "..."}        — reasoning_content token(s)
          {"type": "tool_call", "calls": [...]}        — list of completed tool call objects
          {"type": "done",      "content": "...",
                                "thinking": "...",
                                "tool_calls": [...]}  — final summary when stream ends
        """
        payload: Dict[str, Any] = {
            "messages": messages,
            "stream": True,
            "temperature": temperature,
            "max_tokens": -1,  # unlimited for local model
        }
        if tools:
            payload["tools"] = tools

        url = self.api_url

        # State tracking
        collected_content = ""
        collected_thinking = ""
        accumulated_tool_calls: Dict[int, Dict] = {}
        in_think = False
        buffer = ""

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    url,
                    json=payload,
                    headers={"Content-Type": "application/json"},
                    timeout=aiohttp.ClientTimeout(total=600),
                ) as resp:
                    async for raw_line in resp.content:
                        line = raw_line.decode("utf-8").strip()
                        if not line:
                            continue
                        if not line.startswith("data: "):
                            continue
                        data_str = line[6:]
                        if data_str == "[DONE]":
                            break

                        try:
                            chunk = json.loads(data_str)
                            # Log the delta structure if it contains content, reasoning, or tool calls
                            choices = chunk.get("choices", [])
                            if choices:
                                delta = choices[0].get("delta", {})
                                if "content" in delta or "reasoning_content" in delta or "tool_calls" in delta:
                                    print(f"[LLM STREAM CHUNK] {json.dumps(delta)}")
                        except json.JSONDecodeError:
                            continue

                        choices = chunk.get("choices", [])
                        if not choices:
                            continue
                        delta = choices[0].get("delta", {})

                        # ---- Tool call accumulation ----
                        if "tool_calls" in delta:
                            for tc in delta["tool_calls"]:
                                idx = tc.get("index", 0)
                                if idx not in accumulated_tool_calls:
                                    accumulated_tool_calls[idx] = {
                                        "id": tc.get("id"),
                                        "type": "function",
                                        "function": {"name": tc.get("function", {}).get("name", ""), "arguments": ""},
                                    }
                                if tc.get("id"):
                                    accumulated_tool_calls[idx]["id"] = tc["id"]
                                if tc.get("function", {}).get("name"):
                                    accumulated_tool_calls[idx]["function"]["name"] = tc["function"]["name"]
                                accumulated_tool_calls[idx]["function"]["arguments"] += tc.get("function", {}).get("arguments", "")

                        # ---- reasoning_content (thinking model) ----
                        reasoning = delta.get("reasoning_content")
                        if reasoning:
                            if not in_think:
                                in_think = True
                            collected_thinking += reasoning
                            yield {"type": "thinking", "text": reasoning}

                        # ---- Standard content ----
                        content_chunk = delta.get("content")
                        if content_chunk:
                            if in_think:
                                # Model transitioned from thinking → output
                                in_think = False
                            buffer += content_chunk

                            # Handle inline <think> tags (some models emit them in content)
                            while True:
                                if not in_think and "<think>" in buffer:
                                    idx_t = buffer.find("<think>")
                                    out_part = buffer[:idx_t]
                                    if out_part:
                                        collected_content += out_part
                                        yield {"type": "content", "text": out_part}
                                    in_think = True
                                    buffer = buffer[idx_t + 7:]
                                elif in_think and "</think>" in buffer:
                                    idx_t = buffer.find("</think>")
                                    thinking_part = buffer[:idx_t]
                                    collected_thinking += thinking_part
                                    yield {"type": "thinking", "text": thinking_part}
                                    in_think = False
                                    buffer = buffer[idx_t + 8:]
                                else:
                                    break

                            # Flush safe portion (hold back potential partial tags)
                            safe_len = len(buffer)
                            for i in range(1, 8):
                                tag = "<think>" if not in_think else "</think>"
                                if tag.startswith(buffer[-i:]) if len(buffer) >= i else False:
                                    safe_len = len(buffer) - i
                                    break

                            if safe_len > 0:
                                text_out = buffer[:safe_len]
                                buffer = buffer[safe_len:]
                                if in_think:
                                    collected_thinking += text_out
                                    yield {"type": "thinking", "text": text_out}
                                else:
                                    collected_content += text_out
                                    yield {"type": "content", "text": text_out}

        except asyncio.CancelledError:
            pass
        except Exception as e:
            yield {"type": "content", "text": f"\n[Stream error: {e}]"}

        # Flush remaining buffer
        if buffer:
            if in_think:
                collected_thinking += buffer
                yield {"type": "thinking", "text": buffer}
            else:
                collected_content += buffer
                yield {"type": "content", "text": buffer}

        # Parse completed tool calls
        parsed_tool_calls = []
        for idx in sorted(accumulated_tool_calls.keys()):
            tc = accumulated_tool_calls[idx]
            try:
                tc["function"]["arguments"] = json.loads(tc["function"]["arguments"])
            except (json.JSONDecodeError, TypeError):
                pass
            parsed_tool_calls.append(tc)

        yield {
            "type": "done",
            "content": collected_content,
            "thinking": collected_thinking,
            "tool_calls": parsed_tool_calls,
        }


# Global singleton
def get_llm() -> LLMEngine:
    return LLMEngine.get_instance()
