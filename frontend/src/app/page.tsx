"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { StockSearch } from "@/components/StockSearch";
import { StockChart } from "@/components/StockChart";
import { SentimentGauge } from "@/components/SentimentGauge";
import { AdvisorChat, renderMarkdown } from "@/components/AdvisorChat";
import { CompanyInfo } from "@/components/CompanyInfo";
import { NewsFeed } from "@/components/NewsFeed";
import ThemeToggle from "@/components/ThemeToggle";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, PieChart, MessageSquare, LineChart, RotateCw } from "lucide-react";

const ENGAGEMENT_TIPS = [
  "Tip: Always check the RSI (Relative Strength Index). Values above 70 indicate overbought conditions, while below 30 suggest oversold.",
  "Fact: The BSE (Bombay Stock Exchange) is Asia's oldest stock exchange, established in 1875.",
  "Tip: Divergence between MACD and price action often signals a strong potential trend reversal.",
  "Tip: Market sentiment reflects the crowd's attitude. Contrarian traders look for extremes to find opportunities.",
  "Tip: Diversify across sectors. Putting all capital in one industry exposes you to high unsystematic risk.",
  "Fact: High volume accompanying price gains indicates strong institutional backing.",
  "Tip: Keep a trading journal. Tracking your rules, entries, exits, and emotions is the best way to improve."
];

function LoadingCard({ elapsed, title, type }: { elapsed: number; title: string; type: "sentiment" | "prediction" }) {
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTipIndex(prev => (prev + 1) % ENGAGEMENT_TIPS.length);
    }, 4500);
    return () => clearInterval(interval);
  }, []);

  let statusMsg = "Initializing...";
  if (type === "sentiment") {
    if (elapsed < 3) statusMsg = "Aggregating news from Moneycontrol & CNBC-TV18...";
    else if (elapsed < 6) statusMsg = "Filtering out duplicate articles & parsing sources...";
    else if (elapsed < 10) statusMsg = "Analyzing sentiment vectors with LLM...";
    else statusMsg = "Generating sentiment summary report...";
  } else {
    if (elapsed < 3) statusMsg = "Fetching latest technical indicators & quote data...";
    else if (elapsed < 6) statusMsg = "Calculating moving averages, RSI, and MACD...";
    else if (elapsed < 10) statusMsg = "Running forecast simulation with LLM...";
    else statusMsg = "Compiling technical analysis report...";
  }

  return (
    <div className="bordered-card p-5 bg-card flex flex-col justify-between min-h-[180px] transition-all duration-300 shadow-sm relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-primary/30 via-primary to-primary/30 animate-pulse" />
      
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</span>
          <span className="text-[10px] font-mono px-2 py-0.5 bg-muted rounded-full text-muted-foreground flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-primary rounded-full animate-ping" />
            {elapsed}s elapsed
          </span>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <RotateCw className="h-3.5 w-3.5 text-primary animate-spin" />
            <span className="text-xs font-semibold text-foreground">{statusMsg}</span>
          </div>
          <div className="w-full bg-muted h-1 rounded-full overflow-hidden">
            <div 
              className="bg-primary h-full transition-all duration-500 rounded-full" 
              style={{ width: `${Math.min(elapsed * 7, 98)}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-border/60 bg-muted/20 p-2.5 rounded-sm">
        <div className="text-[10px] font-bold uppercase tracking-wider text-primary mb-1">Market Tip / Fact</div>
        <p className="text-[11px] text-muted-foreground leading-normal italic select-none">
          "{ENGAGEMENT_TIPS[tipIndex]}"
        </p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [stockData, setStockData] = useState<any>(null);
  const [historyData, setHistoryData] = useState<any>(null);
  const [sentimentData, setSentimentData] = useState<any>(null);
  const [predictionData, setPredictionData] = useState<any>(null);
  const [error, setError] = useState("");

  const [currentSymbol, setCurrentSymbol] = useState("");
  const [currentExchange, setCurrentExchange] = useState("NSE");
  const [period, setPeriod] = useState("1mo");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const sym = params.get("symbol");
      const exch = params.get("exchange") || "NSE";
      if (sym) {
        handleSearch(sym, exch);
      }
    }
  }, []);

  const [loadingStates, setLoadingStates] = useState({
    details: false,
    sentiment: false,
    prediction: false
  });

  const [predictionElapsed, setPredictionElapsed] = useState(0);
  const [sentimentElapsed, setSentimentElapsed] = useState(0);

  useEffect(() => {
    let intervalId: any = null;
    if (loadingStates.prediction) {
      setPredictionElapsed(0);
      intervalId = setInterval(() => {
        setPredictionElapsed(prev => prev + 1);
      }, 1000);
    } else {
      setPredictionElapsed(0);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [loadingStates.prediction]);

  useEffect(() => {
    let intervalId: any = null;
    if (loadingStates.sentiment) {
      setSentimentElapsed(0);
      intervalId = setInterval(() => {
        setSentimentElapsed(prev => prev + 1);
      }, 1000);
    } else {
      setSentimentElapsed(0);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [loadingStates.sentiment]);

  const updateHistory = async (p: string) => {
    setPeriod(p);
    if (!currentSymbol) return;

    try {
      const interval = p === "1d" ? "1m" : p === "5d" ? "5m" : "1d";
      const history = await api.getHistory(currentSymbol, p, interval, currentExchange);
      setHistoryData(history);
    } catch (e) {
      console.error("Failed to update history period", e);
    }
  };

  const handleSearch = async (symbol: string, exchange: string = "NSE") => {
    setLoading(true);
    setHasSearched(true);
    setCurrentSymbol(symbol);
    setCurrentExchange(exchange);
    setPeriod("1mo");
    setError("");

    setStockData(null);
    setHistoryData(null);
    setSentimentData(null);
    setPredictionData(null);

    setLoadingStates({
      details: true,
      sentiment: true,
      prediction: true
    });

    api.getQuote(symbol, exchange)
      .then(res => {
        setStockData(res);
        setLoadingStates(prev => ({ ...prev, details: false }));
      })
      .catch(e => {
        setError("Could not find stock. Please check the symbol.");
        setLoadingStates(prev => ({ ...prev, details: false }));
        setLoading(false);
      });

    api.getHistory(symbol, "1mo", "1d", exchange)
      .then(res => setHistoryData(res))
      .catch(e => console.error("History fetch failed", e));

    api.getSentiment(symbol, exchange)
      .then(res => {
        setSentimentData(res);
        setLoadingStates(prev => ({ ...prev, sentiment: false }));
      })
      .catch(e => {
        console.error("Sentiment fetch failed", e);
        setLoadingStates(prev => ({ ...prev, sentiment: false }));
      });

    api.getPrediction(symbol, exchange)
      .then(res => {
        setPredictionData(res);
        setLoadingStates(prev => ({ ...prev, prediction: false }));
      })
      .catch(e => {
        console.error("Prediction fetch failed", e);
        setLoadingStates(prev => ({ ...prev, prediction: false }));
      });

    setLoading(false);
  };

  const handleRetrySentiment = () => {
    if (!currentSymbol) return;

    setSentimentData(null);
    setLoadingStates(prev => ({ ...prev, sentiment: true }));

    api.getSentiment(currentSymbol, currentExchange)
      .then(res => {
        setSentimentData(res);
        setLoadingStates(prev => ({ ...prev, sentiment: false }));
      })
      .catch(e => {
        console.error("Sentiment retry fetch failed", e);
        setLoadingStates(prev => ({ ...prev, sentiment: false }));
      });
  };

  const handleRetryPrediction = () => {
    if (!currentSymbol) return;

    setPredictionData(null);
    setLoadingStates(prev => ({ ...prev, prediction: true }));

    api.getPrediction(currentSymbol, currentExchange)
      .then(res => {
        setPredictionData(res);
        setLoadingStates(prev => ({ ...prev, prediction: false }));
      })
      .catch(e => {
        console.error("Prediction retry fetch failed", e);
        setLoadingStates(prev => ({ ...prev, prediction: false }));
      });
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary selection:text-white">
      {/* Professional Header */}
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
          <div className="w-full max-w-md">
            <StockSearch onSearch={handleSearch} isLoading={loading} />
          </div>
          <div className="flex items-center gap-4 text-sm font-medium text-muted-foreground">
            <Link href="/" className="hover:text-foreground">Dashboard</Link>
            <Link href="/watchlist" className="hover:text-foreground">Watchlist</Link>
            <Link href="/portfolio" className="hover:text-foreground">Portfolio</Link>
            <Link href="/compare" className="hover:text-foreground">Compare</Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-6 space-y-4">
        {error && <div className="p-3 bg-destructive/10 text-destructive text-sm font-medium border border-destructive/20 rounded-sm">{error}</div>}

        {(hasSearched || stockData) && !error && (
          <div className="space-y-4 animate-in fade-in duration-300">

            {/* Main Workspace Grid - Dense Layout */}
            <div className="grid grid-cols-12 gap-4">

              {/* Left Column: Company Info & Chart (8 cols) */}
              <div className="col-span-12 lg:col-span-8 space-y-4">

                {/* 1. Company Information */}
                <div>
                  {loadingStates.details ? (
                    <div className="h-32 bordered-card flex items-center justify-center bg-muted/20">
                      <span className="text-sm text-muted-foreground animate-pulse">Loading Market Data...</span>
                    </div>
                  ) : (
                    <CompanyInfo data={stockData} />
                  )}
                </div>

                {/* 2. Stock Chart */}
                {historyData ? (
                  <div className="h-[550px] bordered-card overflow-hidden bg-card">
                    <StockChart data={historyData} period={period} setPeriod={updateHistory} />
                  </div>
                ) : (
                  (loadingStates.details || hasSearched) &&
                  <div className="h-[550px] bordered-card flex items-center justify-center bg-muted/10 text-muted-foreground text-sm">
                    Initializing Chart Engine...
                  </div>
                )}

                {/* 3. Advisor Chat */}
                {currentSymbol && (
                  <div className="h-[500px] bordered-card overflow-hidden flex flex-col bg-card">
                    <AdvisorChat symbol={currentSymbol} exchange={currentExchange} />
                  </div>
                )}
              </div>

              {/* Right Column: Sentiment & Intelligence (4 cols) */}
              <div className="col-span-12 lg:col-span-4 space-y-4 flex flex-col">

                {/* Prediction Card */}
                <div>
                  {loadingStates.prediction ? (
                    <LoadingCard elapsed={predictionElapsed} title="AI Technical Forecast" type="prediction" />
                  ) : (
                    predictionData && (() => {
                      const isPredictionError = predictionData.ai_analysis?.startsWith("Error") || 
                                                predictionData.ai_analysis?.includes("Error interacting with AI") || 
                                                predictionData.ai_analysis === "LLM not loaded.";
                      return (
                        <div className="bordered-card p-4 space-y-3 bg-card">
                          <div className="flex items-center justify-between border-b border-border pb-2">
                            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">AI Technical Forecast</span>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={handleRetryPrediction}
                                className="p-1 hover:bg-muted text-muted-foreground rounded-sm transition-colors"
                                title="Refresh Forecast"
                              >
                                <RotateCw className="h-3 w-3" />
                              </button>
                              <span className="text-[10px] text-muted-foreground">Validity: 24h</span>
                            </div>
                          </div>
                          {isPredictionError ? (
                            <div className="space-y-3 pt-1">
                              <div className="p-3 bg-destructive/10 text-destructive text-xs font-medium border border-destructive/20 rounded-sm leading-relaxed">
                                {predictionData.ai_analysis}
                              </div>
                              <button
                                onClick={handleRetryPrediction}
                                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-primary text-white text-xs font-semibold rounded-sm hover:bg-primary/90 transition-colors shadow-sm"
                              >
                                <RotateCw className="h-3.5 w-3.5" />
                                Retry Analysis
                              </button>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="text-sm text-muted-foreground">Target Price</div>
                                  <div className="text-2xl font-bold font-mono tracking-tight">₹{predictionData.predicted_next_day}</div>
                                </div>
                                <div className={`px-3 py-1 text-xs font-bold uppercase rounded-sm border ${predictionData.trend === 'UP'
                                  ? 'bg-green-50 text-green-700 border-green-200'
                                  : 'bg-red-50 text-red-700 border-red-200'
                                  }`}>
                                  {predictionData.trend}
                                </div>
                              </div>
                              <div className="text-xs text-muted-foreground leading-relaxed pt-1">
                                {renderMarkdown(predictionData.ai_analysis)}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })()
                  )}
                </div>

                {/* Sentiment Gauge */}
                <div className="h-auto">
                  {loadingStates.sentiment ? (
                    <LoadingCard elapsed={sentimentElapsed} title="Market Sentiment" type="sentiment" />
                  ) : (
                    <SentimentGauge data={sentimentData} onRetry={handleRetrySentiment} />
                  )}
                </div>

                {/* News Feed - Fits nicely in the sidebar */}
                {currentSymbol && (
                  <NewsFeed symbol={currentSymbol} exchange={currentExchange} />
                )}

              </div>
            </div>
          </div>
        )}

        {!hasSearched && !stockData && !loading && (
          <div className="flex flex-col items-center justify-center py-20 animate-in fade-in zoom-in-50 duration-500 max-w-4xl mx-auto text-center">
            <div className="mb-8">
              <h2 className="text-3xl font-bold tracking-tight mb-3">Welcome to TradeAI</h2>
              <p className="text-muted-foreground max-w-lg mx-auto">
                Advanced market intelligence for Indian Stocks. Enter a ticker symbol above to start analyzing.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full text-left">
              <div className="bordered-card hover:border-primary/50 transition-colors p-6 bg-card">
                <div className="h-10 w-10 bg-primary/10 rounded-sm flex items-center justify-center mb-4 text-primary">
                  <LineChart className="h-5 w-5" />
                </div>
                <h3 className="font-bold mb-2">Real-time Data</h3>
                <p className="text-sm text-muted-foreground">Live market data for NSE/BSE stocks with interactive professional charts.</p>
              </div>
              <div className="bordered-card hover:border-primary/50 transition-colors p-6 bg-card">
                <div className="h-10 w-10 bg-primary/10 rounded-sm flex items-center justify-center mb-4 text-primary">
                  <PieChart className="h-5 w-5" />
                </div>
                <h3 className="font-bold mb-2">AI Sentiment</h3>
                <p className="text-sm text-muted-foreground">Deep analysis of news and social sentiment to gauge market mood.</p>
              </div>
              <div className="bordered-card hover:border-primary/50 transition-colors p-6 bg-card">
                <div className="h-10 w-10 bg-primary/10 rounded-sm flex items-center justify-center mb-4 text-primary">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <h3 className="font-bold mb-2">TradeAI Advisor</h3>
                <p className="text-sm text-muted-foreground">Interactive AI chat for personalized strategy and risk assessment.</p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
