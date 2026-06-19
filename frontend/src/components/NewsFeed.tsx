"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { RefreshCw, ExternalLink, Newspaper } from "lucide-react";

interface NewsFeedProps {
    symbol: string;
    exchange?: string;
}

export function NewsFeed({ symbol, exchange = "NSE" }: NewsFeedProps) {
    const [articles, setArticles] = useState<any[]>([]);
    const [sources, setSources] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [expandedArticles, setExpandedArticles] = useState<Record<number, boolean>>({});

    const toggleExpand = (index: number) => {
        setExpandedArticles(prev => ({
            ...prev,
            [index]: !prev[index]
        }));
    };

    const fetchNews = async () => {
        if (!symbol) return;
        setLoading(true);
        try {
            const res = await api.getNews(symbol, exchange);
            setArticles(res.articles || []);
            setSources(res.sources || []);
        } catch (e) {
            console.error("Failed to fetch news:", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchNews();
        const interval = setInterval(fetchNews, 180000); // 3 minutes auto-refresh
        return () => clearInterval(interval);
    }, [symbol, exchange]);

    return (
        <Card className="dense-card border border-border bg-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-border p-4">
                <div className="flex items-center gap-2">
                    <Newspaper className="h-4 w-4 text-primary" />
                    <CardTitle className="text-sm font-bold uppercase tracking-wide text-foreground">Latest News: {symbol}</CardTitle>
                </div>
                <button
                    onClick={fetchNews}
                    disabled={loading}
                    className="p-1 hover:bg-muted text-muted-foreground rounded-sm transition-colors disabled:opacity-50"
                >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </CardHeader>
            <CardContent className="p-0 max-h-[400px] overflow-auto divide-y divide-border flex flex-col">
                <div className="divide-y divide-border flex-1">
                    {loading && articles.length === 0 ? (
                        <div className="p-8 text-center text-xs text-muted-foreground animate-pulse">Fetching articles...</div>
                    ) : articles.length === 0 ? (
                        <div className="p-8 text-center text-xs text-muted-foreground">No news articles found.</div>
                    ) : (
                        articles.map((item, index) => (
                            <div 
                                key={index} 
                                className="p-4 hover:bg-muted/30 transition-colors space-y-1 cursor-pointer"
                                onClick={() => toggleExpand(index)}
                                title="Click to show full/collapsed news text"
                            >
                                <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-1">
                                    {item.date && (
                                        <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded-sm font-mono font-semibold">
                                            {new Date(item.date).toLocaleString(undefined, {dateStyle: 'short', timeStyle: 'short'})}
                                        </span>
                                    )}
                                    <span className="font-medium">
                                        {item.href ? new URL(item.href).hostname : "News"}
                                    </span>
                                </div>
                                <a
                                    href={item.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-semibold text-sm text-foreground hover:text-primary transition-colors flex items-start gap-1 justify-between group"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <span className="group-hover:underline">{item.title}</span>
                                    <ExternalLink className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5 text-muted-foreground" />
                                </a>
                                <p 
                                    className={`text-xs text-muted-foreground leading-relaxed transition-all duration-300 ${
                                        expandedArticles[index] ? '' : 'line-clamp-2'
                                    }`}
                                    title={item.body}
                                >
                                    {item.body}
                                </p>
                            </div>
                        ))
                    )}
                </div>

                {sources.length > 0 && (
                    <div className="p-4 bg-muted/10 border-t border-border space-y-3">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Sources & Reference Links:</div>
                        <ul className="space-y-2">
                            {sources.map((src, index) => (
                                <li key={index} className="text-xs flex items-start gap-1.5 leading-relaxed">
                                    <span className="text-muted-foreground mt-0.5">•</span>
                                    <a
                                        href={src.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-muted-foreground hover:text-primary transition-colors hover:underline flex-1"
                                    >
                                        {src.title || src.url}
                                        <span className="text-[10px] text-muted-foreground/60 ml-1.5 font-mono">
                                            ({src.url ? new URL(src.url).hostname.replace("www.", "") : "Source"})
                                        </span>
                                    </a>
                                    <ExternalLink className="h-3 w-3 text-muted-foreground/50 mt-1 flex-shrink-0" />
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
