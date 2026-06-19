from duckduckgo_search import DDGS

def test_search():
    query = "TCS stock news india market sentiment"
    print(f"Searching for: {query}")
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=5))
            print(f"Found {len(results)} results.")
            for res in results:
                print(f"- {res.get('title')}: {res.get('href')}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_search()
