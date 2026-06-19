import { useState } from "react";
import { api } from "@/lib/api";
import { Globe, ArrowUpRight } from "lucide-react";

interface CompanyInfoProps {
    data: any;
}

export function CompanyInfo({ data }: CompanyInfoProps) {
    const [expandedProfile, setExpandedProfile] = useState(false);
    if (!data) return null;

    const formatCr = (val: number) => {
        if (!val) return "—";
        const cr = val / 10000000;
        return `₹${cr.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr`;
    };

    const formatPercent = (val: number) => {
        if (val === undefined || val === null) return "—";
        return `${(val * 100).toFixed(2)}%`;
    };

    const formatNum = (val: number) => {
        if (!val) return "—";
        return val.toFixed(1);
    };

    const ratings = data.analyst_ratings || { strong_buy: 0, buy: 0, hold: 0, sell: 0, strong_sell: 0, consensus: "N/A" };
    const hasRatings = ratings.strong_buy + ratings.buy + ratings.hold + ratings.sell + ratings.strong_sell > 0;

    const consensusColor = (c: string) => {
        if (c === "Strong Buy") return "bg-green-100 text-green-800 border-green-300";
        if (c === "Buy") return "bg-green-50 text-green-700 border-green-200";
        if (c === "Hold") return "bg-yellow-50 text-yellow-700 border-yellow-200";
        if (c === "Sell") return "bg-red-50 text-red-700 border-red-200";
        if (c === "Strong Sell") return "bg-red-100 text-red-800 border-red-300";
        return "bg-muted text-muted-foreground border-border";
    };

    return (
        <div className="bordered-card p-0 overflow-hidden bg-card">
            {/* Header with Title and Price */}
            <div className="p-4 border-b border-border flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <h2 className="text-xl font-bold tracking-tight text-foreground">{data.name}</h2>
                        <span className="text-xs font-mono text-muted-foreground px-1.5 py-0.5 border border-border rounded-sm">{data.symbol.replace(".NS", "").replace(".BO", "")}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground">
                        {data.sector && (
                            <span>Sector: <span className="text-foreground">{data.sector}</span></span>
                        )}
                        {data.industry && (
                            <span>Industry: <span className="text-foreground">{data.industry}</span></span>
                        )}
                        {data.isin && (
                            <span>ISIN: <span className="text-foreground">{data.isin}</span></span>
                        )}
                        {data.website && (
                            <a href={data.website} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-primary transition-colors">
                                <Globe className="h-3 w-3" />
                                Website
                            </a>
                        )}
                    </div>
                </div>

                <div className="text-right">
                    <div className="text-2xl font-bold font-mono tracking-tight flex items-center justify-end gap-3 text-foreground">
                        ₹{data.price}
                        <span className={`text-sm font-bold flex items-center ${data.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {data.change >= 0 ? '+' : ''}{data.change} ({data.change_percent}%)
                        </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium mt-1">
                        Real-time Data • {data.symbol.endsWith(".BO") ? "BSE" : data.symbol.endsWith(".NS") ? "NSE" : "US"}
                    </div>
                </div>
            </div>

            {/* 3-Column Layout: Key Stats, Fundamentals, Analyst Ratings */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 text-sm">

                {/* Column 1: Key Statistics */}
                <div className="border border-border rounded-md overflow-hidden">
                    <div className="bg-muted/30 px-3 py-2 border-b border-border font-bold text-foreground flex justify-between items-center">
                        Key Statistics <ArrowUpRight className="h-3 w-3 text-green-500" />
                    </div>
                    <div className="divide-y divide-border">
                        <div className="flex justify-between px-3 py-2">
                            <span className="text-muted-foreground">P/E Ratio</span>
                            <span className="font-semibold">{formatNum(data.pe_ratio)}x</span>
                        </div>
                        <div className="flex justify-between px-3 py-2">
                            <span className="text-muted-foreground">Market Cap</span>
                            <span className="font-semibold">{formatCr(data.market_cap)}</span>
                        </div>
                        <div className="flex justify-between px-3 py-2">
                            <span className="text-muted-foreground">Div Yield</span>
                            <span className="font-semibold">{formatPercent(data.dividend_yield)}</span>
                        </div>
                        <div className="flex justify-between px-3 py-2">
                            <span className="text-muted-foreground">P/B Ratio</span>
                            <span className="font-semibold">{formatNum(data.book_value ? data.price / data.book_value : 0)}x</span>
                        </div>
                    </div>
                </div>

                {/* Column 2: Fundamentals */}
                <div className="border border-border rounded-md overflow-hidden">
                    <div className="bg-muted/30 px-3 py-2 border-b border-border font-bold text-foreground">
                        Fundamentals & Ratios
                    </div>
                    <div className="divide-y divide-border">
                        <div className="flex justify-between px-3 py-2">
                            <span className="text-muted-foreground">ROE</span>
                            <span className="font-semibold">{formatPercent(data.roe)}</span>
                        </div>
                        <div className="flex justify-between px-3 py-2">
                            <span className="text-muted-foreground">ROCE</span>
                            <span className="font-semibold">{formatPercent(data.roce)}</span>
                        </div>
                        <div className="flex justify-between px-3 py-2">
                            <span className="text-muted-foreground">Book Value</span>
                            <span className="font-semibold">₹{formatNum(data.book_value)}</span>
                        </div>
                        <div className="flex justify-between px-3 py-2">
                            <span className="text-muted-foreground">52W High/Low</span>
                            <span className="font-semibold text-xs">₹{data.high_52}/₹{data.low_52}</span>
                        </div>
                    </div>
                </div>

                {/* Column 3: Analyst Ratings (Real Data) */}
                <div className="border border-border rounded-md overflow-hidden">
                    <div className="bg-muted/30 px-3 py-2 border-b border-border font-bold text-foreground flex justify-between items-center">
                        Analyst Ratings
                        {hasRatings && (
                            <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 border rounded-sm ${consensusColor(ratings.consensus)}`}>
                                {ratings.consensus}
                            </span>
                        )}
                    </div>
                    {hasRatings ? (
                        <div className="divide-y divide-border">
                            <div className="flex justify-between px-3 py-2">
                                <span className="text-muted-foreground">Strong Buy</span>
                                <span className="font-bold text-green-600">{ratings.strong_buy}</span>
                            </div>
                            <div className="flex justify-between px-3 py-2">
                                <span className="text-muted-foreground">Buy</span>
                                <span className="font-bold text-green-500">{ratings.buy}</span>
                            </div>
                            <div className="flex justify-between px-3 py-2">
                                <span className="text-muted-foreground">Hold</span>
                                <span className="font-bold text-yellow-600">{ratings.hold}</span>
                            </div>
                            <div className="flex justify-between px-3 py-2">
                                <span className="text-muted-foreground">Sell</span>
                                <span className="font-bold text-red-500">{ratings.sell}</span>
                            </div>
                            <div className="flex justify-between px-3 py-2">
                                <span className="text-muted-foreground">Strong Sell</span>
                                <span className="font-bold text-red-600">{ratings.strong_sell}</span>
                            </div>
                        </div>
                    ) : (
                        <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                            No analyst ratings available for this stock.
                        </div>
                    )}
                </div>
            </div>

            {/* Actions / Summary */}
            <div className="p-3 bg-muted/20 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
                <div className="flex-1">
                    {data.summary ? (
                        <p 
                            className={`text-xs leading-relaxed text-muted-foreground cursor-pointer transition-all duration-300 ${
                                expandedProfile ? '' : 'line-clamp-1 max-w-2xl'
                            }`}
                            onClick={() => setExpandedProfile(!expandedProfile)}
                            title="Click to toggle full company profile description"
                        >
                            <span className="font-bold text-foreground mr-1">Profile:</span>
                            {data.summary}
                        </p>
                    ) : (
                        <span>No company summary available.</span>
                    )}
                </div>
                <div className="flex gap-2 shrink-0">
                    <button
                        onClick={async () => {
                            const ex = data.symbol.endsWith(".NS") ? "NSE" : data.symbol.endsWith(".BO") ? "BSE" : "US";
                            const cleanSym = data.symbol.replace(".NS", "").replace(".BO", "");
                            try {
                                await api.addToWatchlist(cleanSym, ex);
                                alert(`Added ${cleanSym} to watchlist!`);
                            } catch (e) {
                                alert("Failed to add to watchlist");
                            }
                        }}
                        className="px-3 py-1 bg-primary text-white font-medium rounded-sm hover:bg-primary/95 transition-colors cursor-pointer"
                    >
                        Add to Watchlist
                    </button>
                    <a
                        href={api.getExportUrl(data.symbol.replace(".NS", "").replace(".BO", ""), data.symbol.endsWith(".NS") ? "NSE" : data.symbol.endsWith(".BO") ? "BSE" : "US")}
                        download
                        className="px-3 py-1 bg-secondary text-primary border border-border font-medium rounded-sm hover:bg-muted transition-colors text-center inline-block"
                    >
                        Export CSV
                    </a>
                </div>
            </div>
        </div>
    );
}

