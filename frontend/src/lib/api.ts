const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

export interface WatchlistResponse {
    symbol: string;
    exchange: string;
    price: number | null;
    change: number | null;
    change_percent: number | null;
    company_name: string;
}

export interface PortfolioResponse {
    holdings: {
        id: string;
        symbol: string;
        exchange: string;
        qty: number;
        buy_price: number;
        date: string | null;
        invested: number;
        current_price: number | null;
        current_value: number;
        pnl: number;
        pnl_percent: number;
    }[];
    summary: {
        total_invested: number;
        total_value: number;
        total_pnl: number;
        total_pnl_percent: number;
    };
}

export const api = {
    async getQuote(symbol: string, exchange: string = "NSE") {
        const res = await fetch(`${API_URL}/market/quote/${symbol}?exchange=${exchange}`);
        if (!res.ok) throw new Error("Failed to fetch quote");
        return res.json();
    },

    async getHistory(symbol: string, period: string = "1mo", interval: string = "1d", exchange: string = "NSE") {
        const res = await fetch(`${API_URL}/market/history/${symbol}?period=${period}&interval=${interval}&exchange=${exchange}`);
        if (!res.ok) throw new Error("Failed to fetch history");
        return res.json();
    },

    async getSentiment(symbol: string, exchange: string = "NSE") {
        const res = await fetch(`${API_URL}/market/sentiment/${symbol}?exchange=${exchange}`);
        return res.json();
    },

    async getPrediction(symbol: string, exchange: string = "NSE") {
        const res = await fetch(`${API_URL}/market/predict/${symbol}?exchange=${exchange}`);
        return res.json();
    },

    async chat(messages: { role: string; content: string }[], useSearch: boolean = false, contextSymbol?: string, contextExchange?: string) {
        const res = await fetch(`${API_URL}/advisor/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages, use_search: useSearch, context_symbol: contextSymbol, context_exchange: contextExchange }),
        });
        if (!res.ok) throw new Error("Chat failed");
        return res.json();
    },

    async chatStream(
        messages: { role: string; content: string }[],
        useSearch: boolean = false,
        contextSymbol?: string,
        contextExchange?: string,
        onToken?: (token: string) => void,
        onError?: (err: any) => void
    ) {
        try {
            const response = await fetch(`${API_URL}/advisor/chat/stream`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messages, use_search: useSearch, context_symbol: contextSymbol, context_exchange: contextExchange })
            });

            if (!response.ok) throw new Error("Stream connection failed");

            const reader = response.body?.getReader();
            if (!reader) throw new Error("ReadableStream not supported");

            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                
                buffer = lines.pop() || "";

                for (const line of lines) {
                    const cleanLine = line.trim();
                    if (!cleanLine.startsWith("data: ")) continue;
                    
                    const dataStr = cleanLine.substring(6);
                    try {
                        const parsed = JSON.parse(dataStr);
                        if (parsed.error) {
                            if (onError) onError(new Error(parsed.error));
                            return;
                        }
                        if (parsed.token && onToken) {
                            onToken(parsed.token);
                        }
                    } catch (e) {
                        console.error("Error parsing SSE line:", e);
                    }
                }
            }
        } catch (err) {
            if (onError) onError(err);
            else throw err;
        }
    },

    // Watchlist API
    async getWatchlist(): Promise<WatchlistResponse[]> {
        const res = await fetch(`${API_URL}/watchlist`);
        if (!res.ok) throw new Error("Failed to fetch watchlist");
        return res.json();
    },

    async addToWatchlist(symbol: string, exchange: string = "NSE") {
        const res = await fetch(`${API_URL}/watchlist`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ symbol, exchange }),
        });
        if (!res.ok) throw new Error("Failed to add to watchlist");
        return res.json();
    },

    async removeFromWatchlist(symbol: string, exchange: string = "NSE") {
        const res = await fetch(`${API_URL}/watchlist/${symbol}?exchange=${exchange}`, {
            method: "DELETE",
        });
        if (!res.ok) throw new Error("Failed to remove from watchlist");
        return res.json();
    },

    // Portfolio API
    async getPortfolio(): Promise<PortfolioResponse> {
        const res = await fetch(`${API_URL}/portfolio`);
        if (!res.ok) throw new Error("Failed to fetch portfolio");
        return res.json();
    },

    async addHolding(holding: { symbol: string; exchange: string; qty: number; buy_price: number; date?: string }) {
        const res = await fetch(`${API_URL}/portfolio`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(holding),
        });
        if (!res.ok) throw new Error("Failed to add holding");
        return res.json();
    },

    async removeHolding(holdingId: string) {
        const res = await fetch(`${API_URL}/portfolio/${holdingId}`, {
            method: "DELETE",
        });
        if (!res.ok) throw new Error("Failed to remove holding");
        return res.json();
    },

    // News API
    async getNews(symbol: string, exchange: string = "NSE") {
        const res = await fetch(`${API_URL}/market/news/${symbol}?exchange=${exchange}`);
        if (!res.ok) throw new Error("Failed to fetch news");
        return res.json();
    },

    // Export CSV Helper URL
    getExportUrl(symbol: string, exchange: string = "NSE"): string {
        return `${API_URL}/market/export/${symbol}?exchange=${exchange}`;
    }
};
