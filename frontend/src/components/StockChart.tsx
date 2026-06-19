"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ComposedChart, Bar, Cell, ReferenceLine } from "recharts";

interface StockChartProps {
    data: any[];
    period: string; // "1d", "5d", "1mo", "3mo", "6mo", "1y"
    setPeriod: (p: string) => void;
}

export function StockChart({ data, period, setPeriod }: StockChartProps) {
    const [chartType, setChartType] = useState<"line" | "candle">("line");
    
    // Indicator toggles
    const [showSma20, setShowSma20] = useState(false);
    const [showSma50, setShowSma50] = useState(false);
    const [showBb, setShowBb] = useState(false);
    const [showRsi, setShowRsi] = useState(false);
    const [showMacd, setShowMacd] = useState(false);

    if (!data || data.length === 0) return null;

    // Process data for Candlestick (Stack trick)
    const chartData = data.map(item => {
        const minOC = Math.min(item.Open, item.Close);
        const maxOC = Math.max(item.Open, item.Close);
        return {
            ...item,
            minOC: minOC,
            amplitude: maxOC - minOC,
        };
    });

    const [zoomRange, setZoomRange] = useState({ start: 0, end: chartData.length });

    useEffect(() => {
        setZoomRange({ start: 0, end: chartData.length });
    }, [data]);

    const visibleData = chartData.slice(zoomRange.start, zoomRange.end);

    // Calculate domain for Y axis to look good based on visible data
    const minPrice = visibleData.length > 0 ? Math.min(...visibleData.map(d => d.Low || d.Close)) : 0;
    const maxPrice = visibleData.length > 0 ? Math.max(...visibleData.map(d => d.High || d.Close)) : 0;
    const diff = maxPrice - minPrice;
    const domainPadding = diff === 0 ? minPrice * 0.05 : diff * 0.1;

    // Interactive Zoom / Pan State & Handlers
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState(0);
    const chartRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const chartContainer = chartRef.current;
        if (!chartContainer) return;

        const handleNativeWheel = (e: WheelEvent) => {
            e.preventDefault();
            const delta = e.deltaY;
            const currentLength = zoomRange.end - zoomRange.start;
            const zoomAmount = Math.max(1, Math.round(currentLength * 0.15));

            if (delta > 0) {
                // Zoom out (expand range)
                const newStart = Math.max(0, zoomRange.start - zoomAmount);
                const newEnd = Math.min(chartData.length, zoomRange.end + zoomAmount);
                setZoomRange({ start: newStart, end: newEnd });
            } else {
                // Zoom in (shrink range)
                if (currentLength > 8) {
                    const newStart = Math.min(zoomRange.end - 5, zoomRange.start + zoomAmount);
                    const newEnd = Math.max(newStart + 5, zoomRange.end - zoomAmount);
                    setZoomRange({ start: newStart, end: newEnd });
                }
            }
        };

        chartContainer.addEventListener("wheel", handleNativeWheel, { passive: false });
        return () => {
            chartContainer.removeEventListener("wheel", handleNativeWheel);
        };
    }, [zoomRange, chartData.length]);

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        setDragStart(e.clientX);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return;
        const deltaX = e.clientX - dragStart;
        const currentLength = zoomRange.end - zoomRange.start;
        // Sensitivity factor - 1 item per 12 pixels dragged
        const itemsToMove = Math.round(deltaX / 12); 

        if (itemsToMove !== 0) {
            let newStart = zoomRange.start - itemsToMove;
            let newEnd = zoomRange.end - itemsToMove;

            if (newStart < 0) {
                newEnd -= newStart;
                newStart = 0;
            }
            if (newEnd > chartData.length) {
                newStart -= (newEnd - chartData.length);
                newEnd = chartData.length;
            }
            
            newStart = Math.max(0, newStart);
            newEnd = Math.min(chartData.length, newEnd);
            
            if (newEnd - newStart >= 5) {
                setZoomRange({ start: newStart, end: newEnd });
                setDragStart(e.clientX);
            }
        }
    };

    const handleMouseUpOrLeave = () => {
        setIsDragging(false);
    };

    const CandleStick = (props: any) => {
        const { x, y, width, height, payload } = props;
        const { Open, Close, High, Low } = payload;

        if (typeof x !== 'number' || typeof y !== 'number') return null;

        const isUp = Close > Open;
        const color = isUp ? "#16a34a" : "#dc2626";

        const bodyValueDiff = Math.abs(Open - Close);
        let pixelPerValue = 0;
        if (bodyValueDiff > 0) {
            pixelPerValue = height / bodyValueDiff;
        }

        return (
            <g>
                <line
                    x1={x + width / 2}
                    y1={y - (High - Math.max(Open, Close)) * pixelPerValue}
                    x2={x + width / 2}
                    y2={y + height + (Math.min(Open, Close) - Low) * pixelPerValue}
                    stroke={color}
                    strokeWidth={1.5}
                />
                {bodyValueDiff > 0 ? (
                    <rect x={x} y={y} width={width} height={height} fill={color} />
                ) : (
                    <rect x={x} y={y} width={width} height={2} fill={color} />
                )}
            </g>
        );
    };

    return (
        <Card className="h-full flex flex-col border-0 shadow-none bg-transparent">
            <CardHeader className="flex flex-col gap-2 pb-2 border-b border-border px-4 pt-4">
                <div className="flex flex-row items-center justify-between">
                    <CardTitle className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Price History</CardTitle>
                    <div className="flex items-center gap-2">
                        {/* Time Range */}
                        <div className="flex border border-border rounded-sm overflow-hidden divide-x divide-border">
                            {["1d", "5d", "1mo", "3mo", "6mo", "1y"].map((p) => (
                                <button
                                    key={p}
                                    onClick={() => setPeriod(p)}
                                    className={`px-2 py-1 text-[10px] font-medium transition-colors hover:bg-muted ${period === p
                                        ? "bg-secondary text-primary font-bold"
                                        : "bg-card text-muted-foreground"
                                        }`}
                                >
                                    {p.toUpperCase()}
                                </button>
                            ))}
                        </div>
                        {/* Chart Type */}
                        <div className="flex border border-border rounded-sm overflow-hidden divide-x divide-border">
                            <button
                                onClick={() => setChartType("line")}
                                className={`px-2 py-1 text-[10px] font-medium hover:bg-muted ${chartType === "line" ? "bg-secondary text-primary font-bold" : "bg-card text-muted-foreground"}`}
                            >
                                Line
                            </button>
                            <button
                                onClick={() => setChartType("candle")}
                                className={`px-2 py-1 text-[10px] font-medium hover:bg-muted ${chartType === "candle" ? "bg-secondary text-primary font-bold" : "bg-card text-muted-foreground"}`}
                            >
                                Candle
                            </button>
                        </div>
                    </div>
                </div>

                {/* Technical Indicators Checkboxes */}
                <div className="flex flex-wrap gap-4 text-xs font-medium text-muted-foreground pt-1">
                    <label className="flex items-center gap-1.5 cursor-pointer hover:text-foreground">
                        <input type="checkbox" checked={showSma20} onChange={(e) => setShowSma20(e.target.checked)} className="rounded-sm border-border text-primary focus:ring-0" />
                        <span>SMA 20</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer hover:text-foreground">
                        <input type="checkbox" checked={showSma50} onChange={(e) => setShowSma50(e.target.checked)} className="rounded-sm border-border text-primary focus:ring-0" />
                        <span>SMA 50</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer hover:text-foreground">
                        <input type="checkbox" checked={showBb} onChange={(e) => setShowBb(e.target.checked)} className="rounded-sm border-border text-primary focus:ring-0" />
                        <span>Bollinger Bands</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer hover:text-foreground">
                        <input type="checkbox" checked={showRsi} onChange={(e) => setShowRsi(e.target.checked)} className="rounded-sm border-border text-primary focus:ring-0" />
                        <span>RSI</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer hover:text-foreground">
                        <input type="checkbox" checked={showMacd} onChange={(e) => setShowMacd(e.target.checked)} className="rounded-sm border-border text-primary focus:ring-0" />
                        <span>MACD</span>
                    </label>
                </div>
            </CardHeader>

            <CardContent className="flex-1 min-h-0 pt-4 px-0 pb-0 flex flex-col space-y-2">
                {/* Main Price Chart */}
                <div 
                    ref={chartRef}
                    className="flex-1 min-h-0 select-none cursor-grab active:cursor-grabbing"
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUpOrLeave}
                    onMouseLeave={handleMouseUpOrLeave}
                >
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={visibleData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                            <XAxis
                                dataKey="Date"
                                tickFormatter={(str) => {
                                    try {
                                        const date = new Date(str.includes(" ") ? str.replace(" ", "T") : str);
                                        if (isNaN(date.getTime())) return str;
                                        if (period === "1d") {
                                            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                        } else if (period === "5d") {
                                            return `${date.getDate()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                                        }
                                        return `${date.getDate()}/${date.getMonth() + 1}`;
                                    } catch (e) {
                                        return str;
                                    }
                                }}
                                stroke="#9ca3af"
                                fontSize={10}
                                tickLine={false}
                                axisLine={{ stroke: '#e5e7eb' }}
                                tickMargin={8}
                            />
                            <YAxis
                                yAxisId="price"
                                domain={[minPrice - domainPadding, maxPrice + domainPadding]}
                                allowDataOverflow={true}
                                stroke="#9ca3af"
                                fontSize={10}
                                tickFormatter={(value) => `₹${value.toFixed(0)}`}
                                tickLine={false}
                                axisLine={false}
                                orientation="right"
                                width={50}
                            />
                            <YAxis
                                yAxisId="volume"
                                domain={[0, Math.max(...visibleData.map(d => d.Volume || 0)) * 4]}
                                orientation="left"
                                hide
                            />

                            <Tooltip
                                contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', color: '#0f172a', fontSize: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}
                                labelStyle={{ color: '#64748b', marginBottom: '4px' }}
                                cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '4 4' }}
                                formatter={(value: any, name: any, props: any) => {
                                    if (name === "Volume") return [value.toLocaleString(), "Vol"];
                                    if (name === "Close" && chartType === "line") return [`₹${value.toFixed(2)}`, "Price"];
                                    if (name === "SMA_20") return [`₹${value.toFixed(2)}`, "SMA 20"];
                                    if (name === "SMA_50") return [`₹${value.toFixed(2)}`, "SMA 50"];
                                    if (name === "BB_Upper") return [`₹${value.toFixed(2)}`, "BB Upper"];
                                    if (name === "BB_Lower") return [`₹${value.toFixed(2)}`, "BB Lower"];
                                    if (name === "amplitude") {
                                        const { Open, Close, High, Low, Volume } = props.payload;
                                        return [
                                            <div key="tooltip" className="text-xs space-y-1 font-mono text-foreground">
                                                <div className="flex justify-between gap-4"><span>O:</span> <span>₹{Open.toFixed(2)}</span></div>
                                                <div className="flex justify-between gap-4"><span>H:</span> <span>₹{High.toFixed(2)}</span></div>
                                                <div className="flex justify-between gap-4"><span>L:</span> <span>₹{Low.toFixed(2)}</span></div>
                                                <div className="flex justify-between gap-4"><span>C:</span> <span>₹{Close.toFixed(2)}</span></div>
                                                <div className="flex justify-between gap-4 text-muted-foreground pt-1 border-t border-border mt-1"><span>Vol:</span> <span>{Volume.toLocaleString()}</span></div>
                                            </div>,
                                            ""
                                        ];
                                    }
                                    return [];
                                }}
                            />

                            <Bar yAxisId="volume" dataKey="Volume" fill="#cbd5e1" opacity={0.3} barSize={visibleData.length > 50 ? 2 : 5} isAnimationActive={false} />

                            {chartType === "line" ? (
                                <Line
                                    yAxisId="price"
                                    type="linear"
                                    dataKey="Close"
                                    stroke="#0f62fe"
                                    strokeWidth={1.5}
                                    dot={false}
                                    activeDot={{ r: 4, fill: '#0f62fe', stroke: '#fff', strokeWidth: 2 }}
                                    isAnimationActive={false}
                                />
                            ) : (
                                <>
                                    <Bar yAxisId="price" dataKey="minOC" stackId="a" fill="transparent" isAnimationActive={false} />
                                    <Bar
                                        yAxisId="price"
                                        dataKey="amplitude"
                                        stackId="a"
                                        shape={<CandleStick />}
                                        isAnimationActive={false}
                                    />
                                </>
                            )}

                            {/* Indicators overlays */}
                            {showSma20 && (
                                <Line yAxisId="price" type="linear" dataKey="SMA_20" stroke="#f59e0b" strokeWidth={1} dot={false} isAnimationActive={false} />
                            )}
                            {showSma50 && (
                                <Line yAxisId="price" type="linear" dataKey="SMA_50" stroke="#ef4444" strokeWidth={1} dot={false} isAnimationActive={false} />
                            )}
                            {showBb && (
                                <>
                                    <Line yAxisId="price" type="linear" dataKey="BB_Upper" stroke="#10b981" strokeDasharray="3 3" strokeWidth={1} dot={false} isAnimationActive={false} />
                                    <Line yAxisId="price" type="linear" dataKey="BB_Lower" stroke="#10b981" strokeDasharray="3 3" strokeWidth={1} dot={false} isAnimationActive={false} />
                                </>
                            )}
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>

                {/* RSI Sub-panel */}
                {showRsi && (
                    <div className="h-[80px] border-t border-border pt-1">
                        <div className="text-[9px] uppercase font-bold text-muted-foreground px-4">RSI (14)</div>
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={visibleData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                <XAxis dataKey="Date" hide />
                                <YAxis domain={[0, 100]} ticks={[30, 70]} stroke="#9ca3af" fontSize={8} orientation="right" width={50} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', fontSize: '10px' }}
                                    formatter={(value: any) => [`${parseFloat(value).toFixed(2)}`, "RSI"]}
                                />
                                <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 3" strokeWidth={0.5} />
                                <ReferenceLine y={30} stroke="#10b981" strokeDasharray="3 3" strokeWidth={0.5} />
                                <Line dataKey="RSI" stroke="#8b5cf6" strokeWidth={1} dot={false} isAnimationActive={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                )}

                {/* MACD Sub-panel */}
                {showMacd && (
                    <div className="h-[80px] border-t border-border pt-1">
                        <div className="text-[9px] uppercase font-bold text-muted-foreground px-4">MACD (12, 26, 9)</div>
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={visibleData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                <XAxis dataKey="Date" hide />
                                <YAxis stroke="#9ca3af" fontSize={8} orientation="right" width={50} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', fontSize: '10px' }}
                                    formatter={(value: any, name: any) => [`${parseFloat(value).toFixed(2)}`, name]}
                                />
                                <Bar dataKey="MACD_Histogram" fill="#cbd5e1" isAnimationActive={false}>
                                    {visibleData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.MACD_Histogram >= 0 ? "#10b981" : "#ef4444"} opacity={0.5} />
                                    ))}
                                </Bar>
                                <Line dataKey="MACD" stroke="#0f62fe" strokeWidth={1} dot={false} isAnimationActive={false} />
                                <Line dataKey="Signal_Line" stroke="#f97316" strokeWidth={1} dot={false} isAnimationActive={false} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
