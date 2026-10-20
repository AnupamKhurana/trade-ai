"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, Deal, FiiDiiRow, MarketIndex, MarketOverviewResponse } from "@/lib/api";
import ThemeToggle from "@/components/ThemeToggle";

const REFRESH_MS = 60_000;

const fmt = (v: number | null | undefined, digits = 2) =>
    v === null || v === undefined ? "—" : v.toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits });

const fmtInt = (v: number | null | undefined) =>
    v === null || v === undefined ? "—" : v.toLocaleString("en-IN", { maximumFractionDigits: 0 });

const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—";

const tone = (v: number | null | undefined) =>
    v === null || v === undefined || v === 0 ? "text-muted-foreground" : v > 0 ? "text-green-600" : "text-red-600";

const sign = (v: number | null | undefined) => (v !== null && v !== undefined && v > 0 ? "+" : "");

function IndexCard({ index }: { index: MarketIndex }) {
    return (
        <div className="bordered-card p-4 bg-card space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{index.name}</div>
            <div className="text-2xl font-bold font-mono tracking-tight">{fmt(index.last)}</div>
            <div className={`text-xs font-semibold font-mono ${tone(index.change)}`}>
                {sign(index.change)}{fmt(index.change)} ({sign(index.change_percent)}{fmt(index.change_percent)}%)
            </div>
        </div>
    );
}

export default function MarketPage() {
    const [overview, setOverview] = useState<MarketOverviewResponse | null>(null);
    const [fiiDii, setFiiDii] = useState<FiiDiiRow[] | null>(null);
    const [deals, setDeals] = useState<Deal[] | null>(null);
    const [overviewError, setOverviewError] = useState(false);
    const [dealFilter, setDealFilter] = useState("");
    const [dealType, setDealType] = useState<"All" | "Bulk" | "Block">("All");
    const [showAllIndices, setShowAllIndices] = useState(false);

    useEffect(() => {
        let active = true;
        const load = () =>
            api.getMarketOverview()
                .then(res => {
                    if (!active) return;
                    setOverview(res);
                    setOverviewError(res.indices.length === 0);
                })
                .catch(() => active && setOverviewError(true));
        load();
        const timer = setInterval(load, REFRESH_MS);
        return () => {
            active = false;
            clearInterval(timer);
        };
    }, []);

    useEffect(() => {
        let active = true;
        api.getFiiDii().then(res => active && setFiiDii(res)).catch(() => active && setFiiDii([]));
        api.getDeals(7).then(res => active && setDeals(res)).catch(() => active && setDeals([]));
        return () => {
            active = false;
        };
    }, []);

    const visibleDeals = useMemo(() => {
        const q = dealFilter.trim().toLowerCase();
        return (deals ?? []).filter(d =>
            (dealType === "All" || d.type === dealType) &&
            (!q || d.symbol.toLowerCase().includes(q) || d.client.toLowerCase().includes(q))
        );
    }, [deals, dealFilter, dealType]);

    const otherIndices = useMemo(() => {
        const headline = new Set((overview?.headline ?? []).map(i => i.name));
        return (overview?.indices ?? []).filter(i => !headline.has(i.name));
    }, [overview]);

    const breadth = overview?.breadth;
    const breadthTotal = breadth ? breadth.advances + breadth.declines + breadth.unchanged : 0;

    return (
        <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary selection:text-white">
            <header className="sticky top-0 z-50 bg-background border-b border-border shadow-sm">
                <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between gap-4">
                    <Link href="/" className="flex items-center gap-2 hover:opacity-90">
                        <div className="bg-primary text-white p-1 rounded-sm">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></svg>
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
                        <Link href="/market" className="text-foreground font-bold">Market</Link>
                        <Link href="/compare" className="hover:text-foreground">Compare</Link>
                        <ThemeToggle />
                    </div>
                </div>
            </header>

            <main className="max-w-[1600px] mx-auto p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold tracking-tight">Market Overview</h2>
                        <p className="text-xs text-muted-foreground">NSE index levels, institutional flows and large deals. Free exchange data, refreshed every minute.</p>
                    </div>
                    {overview?.status && (
                        <span className={`text-[10px] font-bold uppercase px-2 py-1 border rounded-sm ${overview.status.open ? "bg-green-50 text-green-700 border-green-200" : "bg-muted text-muted-foreground border-border"}`}>
                            {overview.status.message} · {overview.status.as_of}
                        </span>
                    )}
                </div>

                {overviewError && (
                    <div className="p-3 bg-destructive/10 text-destructive text-sm font-medium border border-destructive/20 rounded-sm">
                        Could not load NSE index data right now. It will retry automatically.
                    </div>
                )}

                {/* Indices */}
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
                    {overview
                        ? overview.headline.map(i => <IndexCard key={i.name} index={i} />)
                        : Array.from({ length: 6 }).map((_, i) => <div key={i} className="bordered-card h-[104px] bg-muted/20 animate-pulse" />)}
                </div>

                <div className="grid grid-cols-12 gap-4">
                    {/* Left: breadth + FII/DII */}
                    <div className="col-span-12 lg:col-span-4 space-y-4">
                        <div className="bordered-card p-4 bg-card space-y-3">
                            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Market Breadth (NSE)</div>
                            {breadth && breadthTotal > 0 ? (
                                <>
                                    <div className="flex h-2 rounded-full overflow-hidden bg-muted">
                                        <div className="bg-green-500" style={{ width: `${(breadth.advances / breadthTotal) * 100}%` }} />
                                        <div className="bg-red-500" style={{ width: `${(breadth.declines / breadthTotal) * 100}%` }} />
                                    </div>
                                    <div className="flex justify-between text-xs font-mono">
                                        <span className="text-green-600">▲ {fmtInt(breadth.advances)} advancing</span>
                                        <span className="text-muted-foreground">{fmtInt(breadth.unchanged)} flat</span>
                                        <span className="text-red-600">▼ {fmtInt(breadth.declines)} declining</span>
                                    </div>
                                </>
                            ) : (
                                <div className="text-xs text-muted-foreground">{overview ? "Not available." : "Loading…"}</div>
                            )}
                        </div>

                        <div className="bordered-card p-4 bg-card space-y-3">
                            <div className="flex justify-between items-baseline">
                                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">FII / DII Activity</span>
                                <span className="text-[10px] text-muted-foreground">₹ crore{fiiDii?.[0]?.date ? ` · ${fmtDate(fiiDii[0].date)}` : ""}</span>
                            </div>
                            {fiiDii === null ? (
                                <div className="text-xs text-muted-foreground animate-pulse">Loading…</div>
                            ) : fiiDii.length === 0 ? (
                                <div className="text-xs text-muted-foreground">Not available right now.</div>
                            ) : (
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="text-[10px] uppercase text-muted-foreground border-b border-border">
                                            <th className="py-1.5 text-left">Who</th>
                                            <th className="py-1.5 text-right">Bought</th>
                                            <th className="py-1.5 text-right">Sold</th>
                                            <th className="py-1.5 text-right">Net</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border font-mono">
                                        {fiiDii.map(r => (
                                            <tr key={r.category}>
                                                <td className="py-2 font-sans font-semibold">{r.category}</td>
                                                <td className="py-2 text-right">{fmt(r.buy)}</td>
                                                <td className="py-2 text-right">{fmt(r.sell)}</td>
                                                <td className={`py-2 text-right font-bold ${tone(r.net)}`}>{sign(r.net)}{fmt(r.net)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                            <p className="text-[10px] text-muted-foreground">Net buying by foreign (FII/FPI) or domestic (DII) institutions in the latest session.</p>
                        </div>
                    </div>

                    {/* Right: bulk/block deals */}
                    <div className="col-span-12 lg:col-span-8">
                        <div className="bordered-card p-4 bg-card space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                    Bulk &amp; Block Deals · last 7 days {deals ? `(${visibleDeals.length})` : ""}
                                </span>
                                <div className="flex gap-2">
                                    <select
                                        value={dealType}
                                        onChange={e => setDealType(e.target.value as "All" | "Bulk" | "Block")}
                                        className="bg-card text-foreground border border-border px-2 py-1 text-xs h-8"
                                    >
                                        <option value="All">All deals</option>
                                        <option value="Bulk">Bulk</option>
                                        <option value="Block">Block</option>
                                    </select>
                                    <input
                                        value={dealFilter}
                                        onChange={e => setDealFilter(e.target.value)}
                                        placeholder="Filter symbol or client"
                                        className="bg-card text-foreground border border-border px-2 py-1 text-xs h-8 w-48"
                                    />
                                </div>
                            </div>
                            <div className="max-h-[520px] overflow-auto">
                                {deals === null ? (
                                    <div className="p-8 text-center text-xs text-muted-foreground animate-pulse">Loading deals…</div>
                                ) : visibleDeals.length === 0 ? (
                                    <div className="p-8 text-center text-xs text-muted-foreground">No deals found.</div>
                                ) : (
                                    <table className="w-full text-xs">
                                        <thead className="sticky top-0 bg-card">
                                            <tr className="text-[10px] uppercase text-muted-foreground border-b border-border">
                                                <th className="py-1.5 text-left">Date</th>
                                                <th className="py-1.5 text-left">Stock</th>
                                                <th className="py-1.5 text-left">Client</th>
                                                <th className="py-1.5 text-left">Side</th>
                                                <th className="py-1.5 text-right">Quantity</th>
                                                <th className="py-1.5 text-right">Price</th>
                                                <th className="py-1.5 text-right">Value (₹ L)</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                            {visibleDeals.map((d, i) => (
                                                <tr key={i} className="hover:bg-muted/30">
                                                    <td className="py-2 font-mono text-muted-foreground whitespace-nowrap">{fmtDate(d.date)}</td>
                                                    <td className="py-2">
                                                        <Link href={`/?symbol=${encodeURIComponent(d.symbol)}&exchange=NSE`} className="font-semibold hover:text-primary hover:underline">{d.symbol}</Link>
                                                        {d.type === "Block" && <span className="ml-1.5 text-[9px] font-bold uppercase px-1 py-0.5 bg-primary/10 text-primary rounded-sm">Block</span>}
                                                    </td>
                                                    <td className="py-2 text-muted-foreground max-w-[260px] truncate" title={d.client}>{d.client}</td>
                                                    <td className={`py-2 font-semibold ${d.side === "BUY" ? "text-green-600" : "text-red-600"}`}>{d.side}</td>
                                                    <td className="py-2 text-right font-mono">{fmtInt(d.quantity)}</td>
                                                    <td className="py-2 text-right font-mono">{fmt(d.price)}</td>
                                                    <td className="py-2 text-right font-mono">{d.quantity && d.price ? fmt((d.quantity * d.price) / 100000, 1) : "—"}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* All other indices */}
                {otherIndices.length > 0 && (
                    <div className="bordered-card p-4 bg-card space-y-3">
                        <button
                            onClick={() => setShowAllIndices(v => !v)}
                            className="w-full flex justify-between items-center text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                        >
                            <span>All Indices ({otherIndices.length})</span>
                            <span>{showAllIndices ? "Hide ▲" : "Show ▼"}</span>
                        </button>
                        {showAllIndices && (
                            <div className="max-h-[480px] overflow-auto">
                                <table className="w-full text-xs">
                                    <thead className="sticky top-0 bg-card">
                                        <tr className="text-[10px] uppercase text-muted-foreground border-b border-border">
                                            <th className="py-1.5 text-left">Index</th>
                                            <th className="py-1.5 text-right">Level</th>
                                            <th className="py-1.5 text-right">Change</th>
                                            <th className="py-1.5 text-right">30d</th>
                                            <th className="py-1.5 text-right">1y</th>
                                            <th className="py-1.5 text-right">P/E</th>
                                            <th className="py-1.5 text-right">52w range</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border font-mono">
                                        {otherIndices.map(i => (
                                            <tr key={i.name} className="hover:bg-muted/30">
                                                <td className="py-2 font-sans font-semibold">{i.name}</td>
                                                <td className="py-2 text-right">{fmt(i.last)}</td>
                                                <td className={`py-2 text-right ${tone(i.change_percent)}`}>{sign(i.change_percent)}{fmt(i.change_percent)}%</td>
                                                <td className={`py-2 text-right ${tone(i.change_30d_percent)}`}>{sign(i.change_30d_percent)}{fmt(i.change_30d_percent, 1)}%</td>
                                                <td className={`py-2 text-right ${tone(i.change_1y_percent)}`}>{sign(i.change_1y_percent)}{fmt(i.change_1y_percent, 1)}%</td>
                                                <td className="py-2 text-right">{fmt(i.pe, 1)}</td>
                                                <td className="py-2 text-right text-muted-foreground">{fmtInt(i.year_low)} – {fmtInt(i.year_high)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}
