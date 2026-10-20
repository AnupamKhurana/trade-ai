from app.services import web_search


def test_search_falls_back_to_google_news_when_duckduckgo_fails(monkeypatch):
    class RateLimited:
        def __init__(self, timeout=None):
            pass

        def text(self, *args, **kwargs):
            raise RuntimeError("202 Ratelimit")

        news = text

    monkeypatch.setattr(web_search, "DDGS", RateLimited)
    monkeypatch.setattr(
        web_search.web_search_service,
        "search_google_news_rss",
        lambda q, max_results=10: [{"title": f"{q} headline", "body": "b", "href": f"https://news/{q}", "date": None}],
    )

    out = web_search.parallel_web_search(["SBIN results"])

    assert "SBIN results headline" in out


def test_search_requests_use_a_timeout(monkeypatch):
    seen = []

    class Recorder:
        def __init__(self, timeout=None):
            seen.append(timeout)

        def news(self, *args, **kwargs):
            return []

    monkeypatch.setattr(web_search, "DDGS", Recorder)
    web_search.web_search_service.search_news("SBIN")

    assert seen == [web_search.SEARCH_TIMEOUT]
