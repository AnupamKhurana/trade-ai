import { useState } from "react";
import { Newspaper, X, RotateCw } from "lucide-react";
import { Button } from "./ui/button";

interface SentimentGaugeProps {
    data: any;
    onRetry?: () => void;
}

export function SentimentGauge({ data, onRetry }: SentimentGaugeProps) {
    const [showNews, setShowNews] = useState(false);

    const [expandedSummary, setExpandedSummary] = useState(false);

    if (!data) return null;

    // Score is -1 to 1. Map to color and position.
    const score = data.score;
    let colorClass = "bg-gray-500";
    let text = "Neutral";

    // Professional Thresholds
    if (score > 0.15) { colorClass = "bg-green-600"; text = "Bullish"; }
    else if (score < -0.15) { colorClass = "bg-red-600"; text = "Bearish"; }

    const hasNews = data.news && data.news.length > 0;
    const percentage = ((score + 1) / 2) * 100; // 0 to 100

    const isError = data.summary?.startsWith("Error") || data.summary?.includes("Error") || !!data.details;

    return (
        <div className="bordered-card relative bg-card flex flex-col h-full">
            <div className="flex items-center justify-between p-3 border-b border-border">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Market Sentiment</span>
                    {data.source === "cache" && <span className="text-[10px] text-muted-foreground bg-muted px-1 rounded-sm">Cached</span>}
                </div>
                <div className="flex items-center gap-1">
                    {onRetry && (
                        <Button variant="ghost" size="icon" className="h-4 w-4 text-muted-foreground hover:text-primary" onClick={onRetry} title="Refresh Analysis">
                            <RotateCw className="h-3 w-3" />
                        </Button>
                    )}
                    {hasNews && (
                        <Button variant="ghost" size="icon" className="h-4 w-4 text-muted-foreground hover:text-primary" onClick={() => setShowNews(!showNews)} title="View Sources">
                            <Newspaper className="h-3 w-3" />
                        </Button>
                    )}
                </div>
            </div>

            {isError ? (
                <div className="p-4 flex-1 flex flex-col justify-center space-y-4">
                    <div className="p-3 bg-destructive/10 text-destructive text-xs font-medium border border-destructive/20 rounded-sm leading-relaxed">
                        <div className="font-bold mb-1">{data.summary}</div>
                        {data.details && <div className="text-[10px] opacity-90">{data.details}</div>}
                    </div>
                    {onRetry && (
                        <Button
                            onClick={onRetry}
                            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-primary text-white text-xs font-semibold rounded-sm hover:bg-primary/90 transition-colors shadow-sm"
                        >
                            <RotateCw className="h-3.5 w-3.5" />
                            Retry Sentiment Analysis
                        </Button>
                    )}
                </div>
            ) : (
                <div className="p-4 flex-1 flex flex-col justify-center space-y-4">
                    <div className="flex items-end justify-between">
                        <div>
                            <div className={`text-2xl font-black tracking-tight ${score > 0.15 ? 'text-green-700' : score < -0.15 ? 'text-red-700' : 'text-gray-700'}`}>
                                {text}
                            </div>
                            <div className="text-xs font-mono text-muted-foreground mt-0.5">
                                 Index Score: {score.toFixed(2)}
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-xs text-muted-foreground mb-1">Confidence</div>
                            <div className="text-sm font-bold">High</div>
                        </div>
                    </div>

                    {/* Circular Sentiment Gauge */}
                    <div className="flex items-center justify-center py-4">
                        <div className="relative h-32 w-32">
                            {/* Background Circle */}
                            <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 100 100">
                                <circle
                                    className="text-secondary"
                                    strokeWidth="8"
                                    stroke="currentColor"
                                    fill="transparent"
                                    r="40"
                                    cx="50"
                                    cy="50"
                                />
                                {/* Progress Circle */}
                                <circle
                                    className={`${score > 0.15 ? 'text-green-500' : score < -0.15 ? 'text-red-500' : 'text-gray-500'} transition-all duration-1000 ease-in-out`}
                                    strokeWidth="8"
                                    strokeDasharray={`${percentage * 2.51} 251.2`}
                                    strokeLinecap="round"
                                    stroke="currentColor"
                                    fill="transparent"
                                    r="40"
                                    cx="50"
                                    cy="50"
                                />
                            </svg>
                            {/* Center Text */}
                            <div className="absolute top-0 flex h-full w-full flex-col items-center justify-center">
                                <span className={`text-2xl font-bold ${score > 0.15 ? 'text-green-700' : score < -0.15 ? 'text-red-700' : 'text-gray-700'}`}>
                                    {Math.round(percentage)}%
                                </span>
                                <span className="text-[10px] uppercase font-bold text-muted-foreground">{text}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-between text-[10px] uppercase font-medium text-muted-foreground px-4">
                        <span className="text-red-600">Bearish</span>
                        <span className="text-gray-500">Neutral</span>
                        <span className="text-green-600">Bullish</span>
                    </div>

                    <div className="mt-2 pt-3 border-t border-border">
                        <p 
                            className={`text-xs leading-relaxed text-muted-foreground cursor-pointer transition-all duration-300 ${
                                expandedSummary ? '' : 'line-clamp-3'
                            }`}
                            onClick={() => setExpandedSummary(!expandedSummary)}
                            title={data.summary + " (Click to toggle view)"}
                        >
                            <span className="font-bold text-foreground mr-1">AI Summary:</span>
                            {data.summary}
                        </p>
                    </div>
                </div>
            )}

            {/* News Popover/Overlay */}
            {showNews && (
                <div className="absolute top-10 right-2 left-2 bg-popover border border-border rounded-sm shadow-xl z-50 p-3 text-xs animate-in zoom-in-95 duration-200">
                    <div className="flex justify-between items-center mb-3 border-b border-border pb-2">
                        <span className="font-bold uppercase tracking-wider text-muted-foreground">Sources</span>
                        <button onClick={() => setShowNews(false)} className="hover:bg-muted p-1 rounded-sm"><X className="h-3 w-3" /></button>
                    </div>
                    <ul className="space-y-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                        {data.news.map((item: any, i: number) => (
                            <li key={i} className="group">
                                <a
                                    href={item.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block p-2 rounded-sm bg-muted/30 hover:bg-secondary border border-transparent hover:border-border transition-all"
                                    title={item.title}
                                >
                                    <div className="font-medium text-foreground group-hover:text-primary truncate mb-1">{item.title}</div>
                                    <div className="flex items-center justify-between gap-1 text-[10px] text-muted-foreground mt-1">
                                        <span className="truncate max-w-[150px]">{item.href ? new URL(item.href).hostname : "Source"}</span>
                                        {item.date && (
                                            <span className="font-mono text-muted-foreground">{new Date(item.date).toLocaleString(undefined, {dateStyle: 'short', timeStyle: 'short'})}</span>
                                        )}
                                    </div>
                                </a>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
