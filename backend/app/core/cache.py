"""Thread-safe in-memory TTL cache for API responses."""
import threading
import time
from typing import Any, Optional

class TTLCache:
    """Simple thread-safe cache with per-key TTL expiration."""
    
    def __init__(self):
        self._store: dict[str, tuple[Any, float]] = {}
        self._lock = threading.Lock()
    
    def get(self, key: str) -> Optional[Any]:
        """Get a value if it exists and hasn't expired."""
        with self._lock:
            if key in self._store:
                value, expiry = self._store[key]
                if time.time() < expiry:
                    return value
                else:
                    del self._store[key]
        return None
    
    def set(self, key: str, value: Any, ttl_seconds: int = 300):
        """Set a value with a TTL in seconds."""
        with self._lock:
            self._store[key] = (value, time.time() + ttl_seconds)
    
    def delete(self, key: str):
        """Remove a key from cache."""
        with self._lock:
            self._store.pop(key, None)
    
    def clear(self):
        """Clear all cached data."""
        with self._lock:
            self._store.clear()
    
    def cleanup(self):
        """Remove all expired entries."""
        with self._lock:
            now = time.time()
            expired = [k for k, (_, exp) in self._store.items() if now >= exp]
            for k in expired:
                del self._store[k]

# Global cache instances with different TTLs
# Usage: cache.get("quote:RELIANCE") / cache.set("quote:RELIANCE", data, ttl_seconds=120)
cache = TTLCache()

# TTL Constants (seconds)
QUOTE_TTL = 120       # 2 minutes
HISTORY_TTL = 300     # 5 minutes  
SENTIMENT_TTL = 900   # 15 minutes
PREDICTION_TTL = 900  # 15 minutes
NEWS_TTL = 600        # 10 minutes
