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

export interface CorporateEventsResponse {
    symbol: string;
    upcoming_results: { date: string | null; purpose: string; description: string | null }[];
    corporate_actions: { subject: string; ex_date: string | null; record_date: string | null }[];
    announcements: { date: string | null; subject: string; text: string; url: string | null }[];
}

export interface MarketIndex {
    name: string;
    group: string;
    last: number;
    change: number | null;
    change_percent: number | null;
    previous_close: number | null;
    open: number | null;
    high: number | null;
    low: number | null;
    year_high: number | null;
    year_low: number | null;
    pe: number | null;
    pb: number | null;
    dividend_yield: number | null;
    change_30d_percent: number | null;
    change_1y_percent: number | null;
}

export interface MarketOverviewResponse {
    status: { open: boolean; message: string; as_of: string } | null;
    indices: MarketIndex[];
    headline: MarketIndex[];
    breadth: { advances: number; declines: number; unchanged: number } | null;
}

export interface FiiDiiRow {
    category: string;
    date: string | null;
    buy: number | null;
    sell: number | null;
    net: number | null;
}

export interface Deal {
    date: string | null;
    type: "Bulk" | "Block";
    symbol: string;
    name: string;
    client: string;
    side: string;
    quantity: number | null;
    price: number | null;
}

export const api = {
    async getSymbols(): Promise<{ symbol: string; name: string }[]> {
        const res = await fetch(`${API_URL}/market/symbols`);
        if (!res.ok) throw new Error("Failed to fetch symbol list");
        return res.json();
    },

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

    // NSE corporate events
    async getEvents(symbol: string, exchange: string = "NSE"): Promise<CorporateEventsResponse> {
        const res = await fetch(`${API_URL}/market/events/${symbol}?exchange=${exchange}`);
        if (!res.ok) throw new Error("Failed to fetch corporate events");
        return res.json();
    },

    // Market-wide data (NSE)
    async getMarketOverview(): Promise<MarketOverviewResponse> {
        const res = await fetch(`${API_URL}/market/overview`);
        if (!res.ok) throw new Error("Failed to fetch market overview");
        return res.json();
    },

    async getFiiDii(): Promise<FiiDiiRow[]> {
        const res = await fetch(`${API_URL}/market/fii-dii`);
        if (!res.ok) throw new Error("Failed to fetch FII/DII activity");
        return res.json();
    },

    async getDeals(days: number = 7, symbol?: string): Promise<Deal[]> {
        const params = new URLSearchParams({ days: String(days) });
        if (symbol) params.set("symbol", symbol);
        const res = await fetch(`${API_URL}/market/deals?${params}`);
        if (!res.ok) throw new Error("Failed to fetch bulk/block deals");
        return res.json();
    },

    // Export CSV Helper URL
    getExportUrl(symbol: string, exchange: string = "NSE"): string {
        return `${API_URL}/market/export/${symbol}?exchange=${exchange}`;
    }
};
