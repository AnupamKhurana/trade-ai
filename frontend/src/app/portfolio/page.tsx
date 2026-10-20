"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { api, PortfolioResponse } from "@/lib/api";
import ThemeToggle from "@/components/ThemeToggle";
import { Trash2, Plus, ArrowUpRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useStockList } from "@/lib/useStockList";

export default function PortfolioPage() {
    const [portfolio, setPortfolio] = useState<PortfolioResponse | null>(null);
    const [loading, setLoading] = useState(true);

    // Form states
    const [symbol, setSymbol] = useState("");
    const [exchange, setExchange] = useState("NSE");
    const stockList = useStockList(exchange);
    const [qty, setQty] = useState("");
    const [buyPrice, setBuyPrice] = useState("");
    const [date, setDate] = useState("");
    
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

    const selectHoldingSymbol = (sym: string) => {
        setSymbol(sym);
        setShowDropdown(false);
    };

    const fetchPortfolio = async () => {
        setLoading(true);
        try {
            const data = await api.getPortfolio();
            setPortfolio(data);
        } catch (e) {
            console.error("Failed to fetch portfolio", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPortfolio();
    }, []);

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!symbol.trim() || !qty || !buyPrice) return;

        try {
            await api.addHolding({
                symbol: symbol.toUpperCase(),
                exchange,
                qty: parseFloat(qty),
                buy_price: parseFloat(buyPrice),
                date: date || undefined
            });
            setSymbol("");
            setQty("");
            setBuyPrice("");
            setDate("");
            fetchPortfolio();
        } catch (e) {
            alert("Failed to add holding");
        }
    };

    const handleDelete = async (holdingId: string) => {
        try {
            await api.removeHolding(holdingId);
            fetchPortfolio();
        } catch (e) {
            alert("Failed to remove holding");
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
                        <Link href="/watchlist" className="hover:text-foreground">Watchlist</Link>
                        <Link href="/portfolio" className="text-foreground font-bold">Portfolio</Link>
                        <Link href="/compare" className="hover:text-foreground">Compare</Link>
                        <ThemeToggle />
                    </div>
                </div>
            </header>

            <main className="max-w-[1600px] mx-auto p-6 space-y-4">
                {/* Summary Cards */}
                {portfolio && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bordered-card p-4 bg-card">
                            <span className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Total Invested</span>
                            <span className="text-xl font-bold font-mono">₹{portfolio.summary.total_invested.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="bordered-card p-4 bg-card">
                            <span className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Current Value</span>
                            <span className="text-xl font-bold font-mono">₹{portfolio.summary.total_value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div className="bordered-card p-4 bg-card">
                            <span className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Total P&L</span>
                            <span className={`text-xl font-bold font-mono ${portfolio.summary.total_pnl >= 0 ? "text-green-600" : "text-red-600"}`}>
                                ₹{portfolio.summary.total_pnl.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>
                        <div className="bordered-card p-4 bg-card">
                            <span className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Overall Return</span>
                            <span className={`text-xl font-bold font-mono ${portfolio.summary.total_pnl_percent >= 0 ? "text-green-600" : "text-red-600"}`}>
                                {portfolio.summary.total_pnl_percent >= 0 ? "+" : ""}{portfolio.summary.total_pnl_percent.toFixed(2)}%
                            </span>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-12 gap-4">
                    {/* Holdings Table (9 cols) */}
                    <div className="col-span-12 lg:col-span-9 space-y-4">
                        <div className="bordered-card p-6 bg-card space-y-4">
                            <h2 className="text-xl font-bold tracking-tight text-foreground border-b border-border pb-4">Holdings</h2>
                            
                            {loading ? (
                                <div className="text-center py-12 text-sm text-muted-foreground animate-pulse">Loading holdings...</div>
                            ) : !portfolio || portfolio.holdings.length === 0 ? (
                                <div className="text-center py-12 text-sm text-muted-foreground">No holdings in your portfolio. Add one using the sidebar.</div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm">
                                        <thead>
                                            <tr className="border-b border-border text-[10px] uppercase font-bold text-muted-foreground">
                                                <th className="pb-3">Symbol</th>
                                                <th className="pb-3">Exchange</th>
                                                <th className="pb-3 text-right">Qty</th>
                                                <th className="pb-3 text-right">Buy Price</th>
                                                <th className="pb-3 text-right">Current Price</th>
                                                <th className="pb-3 text-right">Invested</th>
                                                <th className="pb-3 text-right">Current Value</th>
                                                <th className="pb-3 text-right">P&L</th>
                                                <th className="pb-3 text-center">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                            {portfolio.holdings.map((item) => (
                                                <tr key={item.id} className="hover:bg-muted/10 transition-colors">
                                                    <td className="py-3 font-bold font-mono">
                                                        <Link href={`/?symbol=${item.symbol}&exchange=${item.exchange}`} className="text-primary hover:underline flex items-center gap-1">
                                                            {item.symbol} <ArrowUpRight className="h-3 w-3" />
                                                        </Link>
                                                    </td>
                                                    <td className="py-3 text-xs text-muted-foreground">{item.exchange}</td>
                                                    <td className="py-3 text-right font-mono">{item.qty}</td>
                                                    <td className="py-3 text-right font-mono">₹{item.buy_price.toFixed(2)}</td>
                                                    <td className="py-3 text-right font-mono">
                                                        {item.current_price !== null ? `₹${item.current_price.toFixed(2)}` : "—"}
                                                    </td>
                                                    <td className="py-3 text-right font-mono">₹{item.invested.toFixed(2)}</td>
                                                    <td className="py-3 text-right font-mono">₹{item.current_value.toFixed(2)}</td>
                                                    <td className={`py-3 text-right font-mono font-bold ${item.pnl >= 0 ? "text-green-600" : "text-red-600"}`}>
                                                        <div>₹{item.pnl.toFixed(2)}</div>
                                                        <div className="text-[10px] font-normal">{item.pnl_percent >= 0 ? "+" : ""}{item.pnl_percent.toFixed(2)}%</div>
                                                    </td>
                                                    <td className="py-3 text-center">
                                                        <button
                                                            onClick={() => handleDelete(item.id)}
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

                    {/* Add Holding Form (3 cols) */}
                    <div className="col-span-12 lg:col-span-3">
                        <div className="bordered-card p-6 bg-card space-y-4" ref={wrapperRef}>
                            <h3 className="text-sm font-bold uppercase tracking-wide text-foreground border-b border-border pb-2">Add Transaction</h3>
                            <form onSubmit={handleAdd} className="space-y-3">
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Exchange</label>
                                    <select
                                        value={exchange}
                                        onChange={(e) => setExchange(e.target.value)}
                                        className="w-full h-8 text-xs bg-card border border-border px-2 rounded-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                    >
                                        <option value="NSE">NSE</option>
                                        <option value="BSE">BSE</option>
                                        <option value="US">US</option>
                                    </select>
                                </div>
                                <div className="relative">
                                    <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Symbol</label>
                                    <Input
                                        placeholder="e.g. INFy"
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
                                        <div className="absolute top-full left-0 mt-1 w-full z-50 max-h-60 overflow-auto bg-popover shadow-md border border-border rounded-md">
                                            <ul className="py-1">
                                                {suggestions.map((stock) => (
                                                    <li
                                                        key={stock.symbol}
                                                        className="px-3 py-1.5 hover:bg-muted cursor-pointer text-xs flex justify-between items-center"
                                                        onClick={() => selectHoldingSymbol(stock.symbol)}
                                                    >
                                                        <span className="font-semibold text-foreground">{stock.symbol}</span>
                                                        <span className="text-muted-foreground text-[10px] truncate ml-2 max-w-[120px]">{stock.name}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Quantity</label>
                                    <Input
                                        type="number"
                                        step="any"
                                        placeholder="Quantity"
                                        value={qty}
                                        onChange={e => setQty(e.target.value)}
                                        className="h-8 text-xs bg-card"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Buy Price (₹)</label>
                                    <Input
                                        type="number"
                                        step="any"
                                        placeholder="Buy Price"
                                        value={buyPrice}
                                        onChange={e => setBuyPrice(e.target.value)}
                                        className="h-8 text-xs bg-card"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Purchase Date</label>
                                    <Input
                                        type="date"
                                        value={date}
                                        onChange={e => setDate(e.target.value)}
                                        className="h-8 text-xs bg-card"
                                    />
                                </div>
                                <button
                                    type="submit"
                                    className="w-full h-8 bg-primary hover:bg-primary/95 text-white text-xs font-semibold rounded-sm flex items-center justify-center gap-1 cursor-pointer mt-4"
                                >
                                    <Plus className="h-3.5 w-3.5" /> Save Transaction
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
