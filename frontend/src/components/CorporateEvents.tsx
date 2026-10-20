"use client";

import { useEffect, useState } from "react";
import { api, CorporateEventsResponse } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { CalendarDays, ExternalLink, FileText } from "lucide-react";

interface CorporateEventsProps {
    symbol: string;
    exchange?: string;
}

const formatDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "TBA";

export function CorporateEvents({ symbol, exchange = "NSE" }: CorporateEventsProps) {
    // Results are keyed by symbol/exchange; anything else is a stale or
    // in-flight request, which also means we're still loading.
    const key = `${symbol}:${exchange}`;
    const [result, setResult] = useState<{ key: string; events: CorporateEventsResponse | null } | null>(null);

    useEffect(() => {
        let active = true;
        api.getEvents(symbol, exchange)
            .then(res => {
                if (active) setResult({ key: `${symbol}:${exchange}`, events: res });
            })
            .catch(e => {
                console.error("Failed to fetch corporate events:", e);
                if (active) setResult({ key: `${symbol}:${exchange}`, events: null });
            });
        return () => {
            active = false;
        };
    }, [symbol, exchange]);

    const loading = result?.key !== key;
    const events = loading ? null : result.events;

    const isEmpty = events
        && events.upcoming_results.length === 0
        && events.corporate_actions.length === 0
        && events.announcements.length === 0;

    return (
        <Card className="dense-card border border-border bg-card">
            <CardHeader className="flex flex-row items-center gap-2 pb-2 border-b border-border p-4">
                <CalendarDays className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm font-bold uppercase tracking-wide text-foreground">Corporate Events: {symbol}</CardTitle>
            </CardHeader>
            <CardContent className="p-0 max-h-[400px] overflow-auto text-xs">
                {loading ? (
                    <div className="p-8 text-center text-muted-foreground animate-pulse">Fetching NSE filings...</div>
                ) : !events || isEmpty ? (
                    <div className="p-8 text-center text-muted-foreground">No recent NSE filings or corporate actions.</div>
                ) : (
                    <div className="divide-y divide-border">
                        {(events.upcoming_results.length > 0 || events.corporate_actions.length > 0) && (
                            <div className="p-4 space-y-2">
                                {events.upcoming_results.map((r, i) => (
                                    <div key={`r${i}`} className="flex justify-between gap-2" title={r.description}>
                                        <span className="font-semibold text-foreground">{r.purpose}</span>
                                        <span className="font-mono text-primary whitespace-nowrap">{formatDate(r.date)}</span>
                                    </div>
                                ))}
                                {events.corporate_actions.map((a, i) => (
                                    <div key={`a${i}`} className="flex justify-between gap-2">
                                        <span className="text-foreground">{a.subject}</span>
                                        <span className="font-mono text-muted-foreground whitespace-nowrap">Ex {formatDate(a.ex_date)}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {events.announcements.map((a, i) => (
                            <div key={`n${i}`} className="p-4 space-y-1 hover:bg-muted/30 transition-colors">
                                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                    <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded-sm font-mono font-semibold">{formatDate(a.date)}</span>
                                    <span className="font-medium">{a.subject}</span>
                                </div>
                                {a.url ? (
                                    <a href={a.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-1 text-foreground hover:text-primary group">
                                        <FileText className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-muted-foreground" />
                                        <span className="line-clamp-2 group-hover:underline">{a.text || a.subject}</span>
                                        <ExternalLink className="h-3 w-3 mt-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground" />
                                    </a>
                                ) : (
                                    <p className="line-clamp-2 text-foreground">{a.text || a.subject}</p>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
