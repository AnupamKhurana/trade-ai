"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { api, WatchlistResponse } from "@/lib/api";
import PriceAlerts from "@/components/PriceAlerts";
import ThemeToggle from "@/components/ThemeToggle";
import { Trash2, Plus, ArrowUpRight, TrendingUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useStockList } from "@/lib/useStockList";

export default function WatchlistPage() {
    const [watchlist, setWatchlist] = useState<WatchlistResponse[]>([]);
    const [loading, setLoading] = useState(true);
    const [symbol, setSymbol] = useState("");
    const [exchange, setExchange] = useState("NSE");
    const stockList = useStockList(exchange);
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (symbol.trim().length > 0) {
            const lowerQuery = symbol.toLowerCase();
            const filtered = stockList.filter(stock =>
                stock.symbol.toLowerCase().includes(lowerQuery) ||
                stock.name.toLowerCase().includes(lowerQuery)
            ).slice(0, 50);
            setSuggestions(filtered);
        } else {
            setSuggestions([]);
            setShowDropdown(false);
        }
    }, [symbol, stockList]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setShowDropdown(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [wrapperRef]);

    const fetchWatchlist = async () => {
        setLoading(true);
        try {
            const data = await api.getWatchlist();
            setWatchlist(data);
        } catch (e) {
            console.error("Failed to fetch watchlist", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchWatchlist();
    }, []);

    const handleAddSymbol = async (sym: string) => {
        try {
            await api.addToWatchlist(sym.toUpperCase(), exchange);
            setSymbol("");
            setShowDropdown(false);
            fetchWatchlist();
        } catch (e) {
            alert("Failed to add symbol");
        }
    };

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!symbol.trim()) return;
        await handleAddSymbol(symbol);
    };

    const handleDelete = async (sym: string, exch: string) => {
        try {
            await api.removeFromWatchlist(sym, exch);
            fetchWatchlist();
        } catch (e) {
            alert("Failed to remove symbol");
        }
    };

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
                        <Link href="/watchlist" className="text-foreground font-bold">Watchlist</Link>
                        <Link href="/portfolio" className="hover:text-foreground">Portfolio</Link>
                        <Link href="/market" className="hover:text-foreground">Market</Link>
                        <Link href="/compare" className="hover:text-foreground">Compare</Link>
                        <ThemeToggle />
                    </div>
                </div>
            </header>

            <main className="max-w-[1600px] mx-auto p-6 space-y-4">
                <div className="grid grid-cols-12 gap-4">
                    {/* Watchlist Table (8 cols) */}
                    <div className="col-span-12 lg:col-span-8 space-y-4">
                        <div className="bordered-card p-6 bg-card space-y-4">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
                                <div>
                                    <h2 className="text-xl font-bold tracking-tight text-foreground">My Watchlist</h2>
                                    <p className="text-xs text-muted-foreground">Monitor real-time updates of your tracked companies.</p>
                                </div>

                                <div className="relative flex gap-2 items-center w-full sm:w-auto" ref={wrapperRef}>
                                    <form onSubmit={handleAdd} className="flex gap-2 items-center w-full sm:w-auto">
                                        <select
                                            value={exchange}
                                            onChange={(e) => setExchange(e.target.value)}
                                            className="bg-card text-foreground border border-border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary h-8"
                                        >
                                            <option value="NSE">NSE</option>
                                            <option value="BSE">BSE</option>
                                            <option value="US">US</option>
                                        </select>
                                        <div className="relative">
                                            <Input
                                                placeholder="Add Symbol (e.g. TCS)"
                                                value={symbol}
                                                onChange={e => {
                                                    setSymbol(e.target.value);
                                                    if (e.target.value.trim().length > 0) setShowDropdown(true);
                                                }}
                                                onFocus={() => symbol.trim().length > 0 && setShowDropdown(true)}
                                                className="h-8 text-xs bg-card"
                                                required
                                            />
                                            {showDropdown && suggestions.length > 0 && (
                                                <div className="absolute top-full left-0 mt-1 w-64 z-50 max-h-60 overflow-auto bg-popover shadow-md border border-border rounded-md">
                                                    <ul className="py-1">
                                                        {suggestions.map((stock) => (
                                                            <li
                                                                key={stock.symbol}
                                                                className="px-3 py-1.5 hover:bg-muted cursor-pointer text-xs flex justify-between items-center"
                                                                onClick={() => handleAddSymbol(stock.symbol)}
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
                                            className="h-8 bg-primary hover:bg-primary/95 text-white px-3 text-xs font-semibold rounded-sm flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
                                        >
                                            <Plus className="h-3.5 w-3.5" /> Add
                                        </button>
                                    </form>
                                </div>
                            </div>

                            {loading ? (
                                <div className="text-center py-12 text-sm text-muted-foreground animate-pulse">Loading Watchlist...</div>
                            ) : watchlist.length === 0 ? (
                                <div className="text-center py-12 text-sm text-muted-foreground">Your watchlist is empty. Add a symbol above to start tracking.</div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm">
                                        <thead>
                                            <tr className="border-b border-border text-[10px] uppercase font-bold text-muted-foreground">
                                                <th className="pb-3">Symbol</th>
                                                <th className="pb-3">Company</th>
                                                <th className="pb-3">Exchange</th>
                                                <th className="pb-3 text-right">Price</th>
                                                <th className="pb-3 text-right">Change</th>
                                                <th className="pb-3 text-center">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                            {watchlist.map((item) => (
                                                <tr key={`${item.symbol}-${item.exchange}`} className="hover:bg-muted/10 transition-colors">
                                                    <td className="py-3 font-bold font-mono">
                                                        <Link href={`/?symbol=${item.symbol}&exchange=${item.exchange}`} className="text-primary hover:underline flex items-center gap-1">
                                                            {item.symbol} <ArrowUpRight className="h-3 w-3" />
                                                        </Link>
                                                    </td>
                                                    <td className="py-3 text-foreground font-medium">{item.company_name}</td>
                                                    <td className="py-3 text-xs text-muted-foreground">{item.exchange}</td>
                                                    <td className="py-3 text-right font-mono font-semibold">
                                                        {item.price !== null && item.price !== undefined ? `₹${item.price.toFixed(2)}` : "—"}
                                                    </td>
                                                    <td className={`py-3 text-right font-mono font-bold ${item.change_percent && item.change_percent >= 0 ? "text-green-600" : "text-red-600"}`}>
                                                        {item.change_percent !== null && item.change_percent !== undefined ? (
                                                            <>
                                                                {item.change_percent >= 0 ? "+" : ""}
                                                                {item.change_percent.toFixed(2)}%
                                                            </>
                                                        ) : "—"}
                                                    </td>
                                                    <td className="py-3 text-center">
                                                        <button
                                                            onClick={() => handleDelete(item.symbol, item.exchange)}
                                                            className="p-1 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                                                            title="Delete"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Alerts Widget (4 cols) */}
                    <div className="col-span-12 lg:col-span-4">
                        <PriceAlerts />
                    </div>
                </div>
            </main>
        </div>
    );
}
