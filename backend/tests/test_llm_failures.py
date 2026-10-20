import pytest
import requests

from app.core import llm as llm_module
from app.core.cache import cache
from app.core.llm import LLMUnavailableError, get_llm
from app.services import news_aggregator
from app.services.sentiment import sentiment_service

NEWS = [{"title": "Fake Co beats estimates", "body": "Strong quarter", "href": "https://example.com/a"}]


@pytest.fixture
def fake_news(monkeypatch):
    monkeypatch.setattr(news_aggregator.news_aggregator, "get_raw_news", lambda *a, **k: NEWS)


def test_chat_raises_when_server_is_down(monkeypatch):
    def refuse(*args, **kwargs):
        raise requests.exceptions.ConnectionError("refused")

    monkeypatch.setattr(llm_module.requests, "post", refuse)
    with pytest.raises(LLMUnavailableError):
        get_llm().chat([{"role": "user", "content": "hi"}])


def test_sentiment_outage_is_reported_and_not_cached(monkeypatch, fake_news):
    def down(*args, **kwargs):
        raise LLMUnavailableError("down")

    monkeypatch.setattr(get_llm(), "chat", down)
    result = sentiment_service.analyze_sentiment("FAKE")

    assert result["summary"].startswith("Error")
    assert cache.get("sentiment:FAKE:NSE") is None


def test_unparseable_sentiment_is_not_cached_as_neutral(monkeypatch, fake_news):
    reply = {"choices": [{"message": {"content": "I cannot help with that."}}]}
    monkeypatch.setattr(get_llm(), "chat", lambda *a, **k: reply)
    result = sentiment_service.analyze_sentiment("FAKE")

    assert result["summary"].startswith("Error")
    assert cache.get("sentiment:FAKE:NSE") is None


def test_valid_sentiment_is_cached_without_mutating_cache(monkeypatch, fake_news):
    reply = {"choices": [{"message": {"content": '{"score": 0.6, "summary": "Positive."}'}}]}
    monkeypatch.setattr(get_llm(), "chat", lambda *a, **k: reply)

    first = sentiment_service.analyze_sentiment("FAKE")
    second = sentiment_service.analyze_sentiment("FAKE")

    assert first["score"] == 0.6
    assert second["source"] == "cache"
    assert "source" not in cache.get("sentiment:FAKE:NSE")
