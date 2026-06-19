"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Bell, Trash2, Plus } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import { Input } from "./ui/input";

interface Alert {
    id: string;
    symbol: string;
    targetPrice: number;
    direction: "above" | "below";
    triggered: boolean;
}

export default function PriceAlerts() {
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [symbol, setSymbol] = useState("");
    const [targetPrice, setTargetPrice] = useState("");
    const [direction, setDirection] = useState<"above" | "below">("above");

    useEffect(() => {
        const saved = localStorage.getItem("price_alerts");
        if (saved) {
            setAlerts(JSON.parse(saved));
        }

        // Request notification permission
        if (typeof window !== "undefined" && "Notification" in window) {
            if (Notification.permission === "default") {
                Notification.requestPermission();
            }
        }
    }, []);

    const saveAlerts = (newAlerts: Alert[]) => {
        setAlerts(newAlerts);
        localStorage.setItem("price_alerts", JSON.stringify(newAlerts));
    };

    const addAlert = (e: React.FormEvent) => {
        e.preventDefault();
        if (!symbol.trim() || !targetPrice) return;

        const newAlert: Alert = {
            id: Math.random().toString(36).substring(2, 9),
            symbol: symbol.trim().toUpperCase(),
            targetPrice: parseFloat(targetPrice),
            direction,
            triggered: false
        };

        saveAlerts([...alerts, newAlert]);
        setSymbol("");
        setTargetPrice("");
    };

    const deleteAlert = (id: string) => {
        saveAlerts(alerts.filter(a => a.id !== id));
    };

    // Polling logic
    useEffect(() => {
        const checkAlerts = async () => {
            const activeAlerts = alerts.filter(a => !a.triggered);
            if (activeAlerts.length === 0) return;

            let updated = false;
            const newAlerts = [...alerts];

            for (let i = 0; i < newAlerts.length; i++) {
                const alertItem = newAlerts[i];
                if (alertItem.triggered) continue;

                try {
                    const quote = await api.getQuote(alertItem.symbol);
                    const currentPrice = quote.price;

                    if (currentPrice !== undefined && currentPrice !== null) {
                        let isTriggered = false;
                        if (alertItem.direction === "above" && currentPrice >= alertItem.targetPrice) {
                            isTriggered = true;
                        } else if (alertItem.direction === "below" && currentPrice <= alertItem.targetPrice) {
                            isTriggered = true;
                        }

                        if (isTriggered) {
                            alertItem.triggered = true;
                            updated = true;

                            // Show browser notification
                            if (Notification.permission === "granted") {
                                new Notification(`Price Alert Triggered!`, {
                                    body: `${alertItem.symbol} has gone ${alertItem.direction} ₹${alertItem.targetPrice}. Current: ₹${currentPrice}`,
                                });
                            } else {
                                alert(`ALERT: ${alertItem.symbol} is now ₹${currentPrice} (Target: ${alertItem.direction} ₹${alertItem.targetPrice})`);
                            }
                        }
                    }
                } catch (e) {
                    console.error("Error checking alert for", alertItem.symbol, e);
                }
            }

            if (updated) {
                saveAlerts(newAlerts);
            }
        };

        const interval = setInterval(checkAlerts, 60000); // Poll every 60 seconds
        return () => clearInterval(interval);
    }, [alerts]);

    return (
        <Card className="bordered-card bg-card text-foreground">
            <CardHeader className="flex flex-row items-center gap-2 pb-2 border-b border-border p-4">
                <Bell className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm font-bold uppercase tracking-wide">Price Alerts</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
                <form onSubmit={addAlert} className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
                    <div>
                        <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Symbol</label>
                        <Input
                            placeholder="e.g. RELIANCE"
                            value={symbol}
                            onChange={e => setSymbol(e.target.value)}
                            className="h-8 text-xs"
                            required
                        />
                    </div>
                    <div>
                        <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Price (₹)</label>
                        <Input
                            type="number"
                            step="any"
                            placeholder="Price"
                            value={targetPrice}
                            onChange={e => setTargetPrice(e.target.value)}
                            className="h-8 text-xs"
                            required
                        />
                    </div>
                    <div>
                        <label className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">Trigger When</label>
                        <select
                            value={direction}
                            onChange={e => setDirection(e.target.value as "above" | "below")}
                            className="w-full h-8 text-xs bg-card border border-border px-2 rounded-sm focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                            <option value="above">Goes Above</option>
                            <option value="below">Goes Below</option>
                        </select>
                    </div>
                    <button
                        type="submit"
                        className="h-8 bg-primary hover:bg-primary/90 text-white text-xs font-semibold rounded-sm flex items-center justify-center gap-1 cursor-pointer w-full"
                    >
                        <Plus className="h-3 w-3" /> Add
                    </button>
                </form>

                <div className="space-y-1.5 max-h-[200px] overflow-auto">
                    {alerts.length === 0 ? (
                        <div className="text-center py-4 text-xs text-muted-foreground">No alerts set.</div>
                    ) : (
                        alerts.map(alertItem => (
                            <div key={alertItem.id} className="flex justify-between items-center p-2 text-xs border border-border hover:bg-muted/30 transition-colors">
                                <div className="space-y-0.5">
                                    <span className="font-bold text-foreground">{alertItem.symbol}</span>
                                    <span className="text-muted-foreground ml-2">
                                        if price goes {alertItem.direction} <span className="font-semibold text-foreground">₹{alertItem.targetPrice}</span>
                                    </span>
                                    {alertItem.triggered && (
                                        <span className="ml-2 text-[10px] font-bold text-green-600 bg-green-50 px-1 border border-green-200">TRIGGERED</span>
                                    )}
                                </div>
                                <button
                                    onClick={() => deleteAlert(alertItem.id)}
                                    className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
