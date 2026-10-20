"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import ThemeToggle from "@/components/ThemeToggle";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { ArrowUpRight, Plus, RefreshCw, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useStockList } from "@/lib/useStockList";

export default function ComparePage() {
    const [stocks, setStocks] = useState<{ symbol: string; exchange: string }[]>([]);
    const [symbolInput, setSymbolInput] = useState("");
    const [exchangeInput, setExchangeInput] = useState("NSE");
    const stockList = useStockList(exchangeInput);
    const [period, setPeriod] = useState("1mo");

    const [loading, setLoading] = useState(false);
    const [quotes, setQuotes] = useState<any[]>([]);
    const [chartData, setChartData] = useState<any[]>([]);
    
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (symbolInput.trim().length > 0) {
            const lowerQuery = symbolInput.toLowerCase();
            const filtered = stockList.filter(stock =>
                stock.symbol.toLowerCase().includes(lowerQuery) ||
                stock.name.toLowerCase().includes(lowerQuery)
            ).slice(0, 50);
            setSuggestions(filtered);
        } else {
            setSuggestions([]);
            setShowDropdown(false);
        }
    }, [symbolInput, stockList]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setShowDropdown(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [wrapperRef]);

    const addStockSymbol = (sym: string) => {
        if (stocks.length >= 3) return;
        const s = sym.toUpperCase().trim();
        if (stocks.some(existing => existing.symbol === s && existing.exchange === exchangeInput)) return;
        setStocks([...stocks, { symbol: s, exchange: exchangeInput }]);
        setSymbolInput("");
        setShowDropdown(false);
    };

    const addStock = (e: React.FormEvent) => {
        e.preventDefault();
        if (!symbolInput.trim() || stocks.length >= 3) return;
        addStockSymbol(symbolInput);
    };

    const removeStock = (index: number) => {
        setStocks(stocks.filter((_, i) => i !== index));
    };

    const fetchComparisonData = async () => {
        if (stocks.length === 0) {
            setQuotes([]);
            setChartData([]);
            return;
        }

        setLoading(true);
        try {
            // Fetch quotes
            const quotesPromises = stocks.map(s => api.getQuote(s.symbol, s.exchange).catch(() => null));
            const fetchedQuotes = await Promise.all(quotesPromises);
            setQuotes(fetchedQuotes.filter(Boolean));

            // Fetch history
            const historyPromises = stocks.map(s => api.getHistory(s.symbol, period, "1d", s.exchange).catch(() => []));
            const fetchedHistories = await Promise.all(historyPromises);

            // Normalize and align histories to percentage changes
            // Format of aligned data: [{ Date: '...', TCS: 1.2, RELIANCE: -0.4 }, ...]
            const dateMap: { [date: string]: { [sym: string]: number } } = {};

            fetchedHistories.forEach((historyList, idx) => {
                const stock = stocks[idx];
                if (!historyList || historyList.length === 0) return;

                const firstClose = historyList[0].Close;
                if (!firstClose) return;

                historyList.forEach((point: any) => {
                    const dateStr = point.Date;
                    if (!dateMap[dateStr]) {
                        dateMap[dateStr] = {};
                    }
                    const pctChange = ((point.Close - firstClose) / firstClose) * 100;
                    dateMap[dateStr][stock.symbol] = pctChange;
                });
            });

            const alignedData = Object.keys(dateMap).sort().map(date => {
                return {
                    Date: date,
                    ...dateMap[date]
                };
            });

            setChartData(alignedData);
        } catch (e) {
            console.error("Comparison load error", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchComparisonData();
    }, [stocks, period]);

    const formatCr = (val: number) => {
        if (!val) return "—";
        return `₹${(val / 10000000).toFixed(0)} Cr`;
    };

    const formatPercent = (val: number) => {
        if (val === undefined || val === null) return "—";
        return `${(val * 100).toFixed(2)}%`;
    };

    // Predefined colors for comparison lines
    const colors = ["#0f62fe", "#10b981", "#f59e0b"];

    return (
        <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary selection:text-white">
            {/* Header */}
            <header className="sticky top-0 z-50 bg-background border-b border-border shadow-sm">
                <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between gap-4">
                    <Link href="/" className="flex items-center gap-2 hover:opacity-90">
                        <div className="bg-primary text-white p-1 rounded-sm">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" className="lucide lucide-trending-up"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></svg>
                        </div>
                        <div>
                            <h1 className="text-lg font-bold tracking-tight text-foreground leading-none">TradeAI</h1>
                            <span className="text-[10px] items-center font-medium uppercase tracking-wider text-muted-foreground">Terminal</span>
                        </div>
                    </Link>
                    <div className="flex items-center gap-4 text-sm font-medium text-muted-foreground">
                        <Link href="/" className="hover:text-foreground">Dashboard</Link>
                        <Link href="/watchlist" className="hover:text-foreground">Watchlist</Link>
                        <Link href="/portfolio" className="hover:text-foreground">Portfolio</Link>
                        <Link href="/compare" className="text-foreground font-bold">Compare</Link>
                        <ThemeToggle />
                    </div>
                </div>
            </header>

            <main className="max-w-[1600px] mx-auto p-6 space-y-4">
                <div className="grid grid-cols-12 gap-4">
                    {/* Setup & Control sidebar (4 cols) */}
                    <div className="col-span-12 lg:col-span-3 space-y-4">
                        <div className="bordered-card p-6 bg-card space-y-4">
                            <div>
                                <h2 className="text-lg font-bold tracking-tight text-foreground">Compare Stocks</h2>
                                <p className="text-xs text-muted-foreground">Compare performance and fundamentals of up to 3 stocks side-by-side.</p>
                            </div>

                            <div ref={wrapperRef} className="relative">
                                <form onSubmit={addStock} className="space-y-3">
                                    <div>
                                        <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Exchange</label>
                                        <select
                                            value={exchangeInput}
                                            onChange={e => setExchangeInput(e.target.value)}
                                            className="w-full h-8 text-xs bg-card border border-border px-2 rounded-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                        >
                                            <option value="NSE">NSE</option>
                                            <option value="BSE">BSE</option>
                                            <option value="US">US</option>
                                        </select>
                                    </div>
                                    <div className="flex gap-2 items-end">
                                        <div className="flex-1 relative">
                                            <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Symbol</label>
                                            <Input
                                                placeholder="e.g. RELIANCE"
                                                value={symbolInput}
                                                onChange={e => {
                                                    setSymbolInput(e.target.value);
                                                    if (e.target.value.trim().length > 0) setShowDropdown(true);
                                                }}
                                                onFocus={() => symbolInput.trim().length > 0 && setShowDropdown(true)}
                                                className="h-8 text-xs bg-card"
                                                disabled={stocks.length >= 3}
                                                required
                                            />
                                            {showDropdown && suggestions.length > 0 && (
                                                <div className="absolute top-full left-0 mt-1 w-64 z-50 max-h-60 overflow-auto bg-popover shadow-md border border-border rounded-md">
                                                    <ul className="py-1">
                                                        {suggestions.map((stock) => (
                                                            <li
                                                                key={stock.symbol}
                                                                className="px-3 py-1.5 hover:bg-muted cursor-pointer text-xs flex justify-between items-center"
                                                                onClick={() => addStockSymbol(stock.symbol)}
                                                            >
                                                                <span className="font-semibold text-foreground">{stock.symbol}</span>
                                                                <span className="text-muted-foreground text-[10px] truncate ml-2 max-w-[150px]">{stock.name}</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            type="submit"
                                            disabled={stocks.length >= 3}
                                            className="h-8 bg-primary hover:bg-primary/95 text-white px-3 text-xs font-semibold rounded-sm flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            Add
                                        </button>
                                    </div>
                                </form>
                            </div>

                            {/* Active comparison list */}
                            <div className="space-y-2 pt-2 border-t border-border">
                                <span className="text-[10px] uppercase font-bold text-muted-foreground block">Comparing</span>
                                {stocks.length === 0 ? (
                                    <span className="text-xs text-muted-foreground block py-2">No stocks selected. Add a symbol above.</span>
                                ) : (
                                    <div className="space-y-1.5">
                                        {stocks.map((stock, idx) => (
                                            <div key={idx} className="flex justify-between items-center p-2 border border-border rounded-sm bg-muted/20">
                                                <div className="flex items-center gap-2">
                                                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colors[idx] }} />
                                                    <span className="font-bold font-mono text-xs">{stock.symbol} ({stock.exchange})</span>
                                                </div>
                                                <button onClick={() => removeStock(idx)} className="p-0.5 hover:bg-muted text-muted-foreground rounded-sm cursor-pointer">
                                                    <X className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Chart & Fundamentals Workspace (9 cols) */}
                    <div className="col-span-12 lg:col-span-9 space-y-4">
                        {stocks.length > 0 && (
                            <div className="bordered-card p-6 bg-card space-y-4">
                                <div className="flex justify-between items-center border-b border-border pb-4">
                                    <span className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Relative Performance (%)</span>
                                    <div className="flex border border-border rounded-sm overflow-hidden divide-x divide-border">
                                        {["1mo", "3mo", "6mo", "1y"].map((p) => (
                                            <button
                                                key={p}
                                                onClick={() => setPeriod(p)}
                                                className={`px-3 py-1 text-[10px] font-medium transition-colors hover:bg-muted ${period === p
                                                    ? "bg-secondary text-primary font-bold"
                                                    : "bg-card text-muted-foreground"
                                                    }`}
                                            >
                                                {p.toUpperCase()}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="h-[300px] w-full">
                                    {loading ? (
                                        <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground animate-pulse">
                                            Generating overlay comparison...
                                        </div>
                                    ) : chartData.length === 0 ? (
                                        <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                                            No chart data loaded.
                                        </div>
                                    ) : (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                                <XAxis
                                                    dataKey="Date"
                                                    tickFormatter={(str) => {
                                                        const date = new Date(str);
                                                        return `${date.getDate()}/${date.getMonth() + 1}`;
                                                    }}
                                                    stroke="#9ca3af"
                                                    fontSize={10}
                                                    tickLine={false}
                                                    axisLine={{ stroke: '#e5e7eb' }}
                                                />
                                                <YAxis
                                                    stroke="#9ca3af"
                                                    fontSize={10}
                                                    tickFormatter={(value) => `${value.toFixed(1)}%`}
                                                    tickLine={false}
                                                    axisLine={false}
                                                    orientation="right"
                                                    width={50}
                                                />
                                                <Tooltip
                                                    contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', color: '#0f172a', fontSize: '12px' }}
                                                    formatter={(value: any) => [`${parseFloat(value).toFixed(2)}%`, "Change"]}
                                                />
                                                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                                                {stocks.map((stock, idx) => (
                                                    <Line
                                                        key={stock.symbol}
                                                        type="linear"
                                                        dataKey={stock.symbol}
                                                        stroke={colors[idx]}
                                                        strokeWidth={1.5}
                                                        dot={false}
                                                        isAnimationActive={false}
                                                    />
                                                ))}
                                            </LineChart>
                                        </ResponsiveContainer>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Fundamentals Grid Table */}
                        {quotes.length > 0 && (
                            <div className="bordered-card p-6 bg-card space-y-4 overflow-x-auto">
                                <h3 className="text-sm font-bold uppercase tracking-wide text-foreground border-b border-border pb-4">Fundamentals Comparison</h3>
                                <table className="w-full text-left text-xs text-foreground divide-y divide-border">
                                    <thead>
                                        <tr className="text-[10px] uppercase font-bold text-muted-foreground">
                                            <th className="pb-3">Metric</th>
                                            {quotes.map((q, idx) => (
                                                <th key={q.symbol} className="pb-3 text-right" style={{ color: colors[idx] }}>
                                                    {q.name} ({q.symbol.replace(".NS", "").replace(".BO", "")})
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border font-medium">
                                        <tr className="hover:bg-muted/5">
                                            <td className="py-2.5 text-muted-foreground">Current Price</td>
                                            {quotes.map(q => <td key={q.symbol} className="py-2.5 text-right font-mono font-semibold">₹{q.price}</td>)}
                                        </tr>
                                        <tr className="hover:bg-muted/5">
                                            <td className="py-2.5 text-muted-foreground">Market Cap</td>
                                            {quotes.map(q => <td key={q.symbol} className="py-2.5 text-right font-mono">{formatCr(q.market_cap)}</td>)}
                                        </tr>
                                        <tr className="hover:bg-muted/5">
                                            <td className="py-2.5 text-muted-foreground">P/E Ratio</td>
                                            {quotes.map(q => <td key={q.symbol} className="py-2.5 text-right font-mono">{q.pe_ratio ? `${q.pe_ratio.toFixed(1)}x` : "—"}</td>)}
                                        </tr>
                                        <tr className="hover:bg-muted/5">
                                            <td className="py-2.5 text-muted-foreground">ROE</td>
                                            {quotes.map(q => <td key={q.symbol} className="py-2.5 text-right font-mono">{formatPercent(q.roe)}</td>)}
                                        </tr>
                                        <tr className="hover:bg-muted/5">
                                            <td className="py-2.5 text-muted-foreground">ROCE</td>
                                            {quotes.map(q => <td key={q.symbol} className="py-2.5 text-right font-mono">{formatPercent(q.roce)}</td>)}
                                        </tr>
                                        <tr className="hover:bg-muted/5">
                                            <td className="py-2.5 text-muted-foreground">Dividend Yield</td>
                                            {quotes.map(q => <td key={q.symbol} className="py-2.5 text-right font-mono">{formatPercent(q.dividend_yield)}</td>)}
                                        </tr>
                                        <tr className="hover:bg-muted/5">
                                            <td className="py-2.5 text-muted-foreground">52-Week Range</td>
                                            {quotes.map(q => <td key={q.symbol} className="py-2.5 text-right font-mono text-[10px]">₹{q.low_52} - ₹{q.high_52}</td>)}
                                        </tr>
                                        <tr className="hover:bg-muted/5">
                                            <td className="py-2.5 text-muted-foreground">Consensus Rating</td>
                                            {quotes.map(q => {
                                                const ratings = q.analyst_ratings || { consensus: "N/A" };
                                                return <td key={q.symbol} className="py-2.5 text-right font-semibold">{ratings.consensus || "N/A"}</td>;
                                            })}
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
