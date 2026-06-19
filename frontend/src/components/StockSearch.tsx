import { useState, useEffect, useRef } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Search } from "lucide-react";
import { Card } from "./ui/card";
import stockList from "@/lib/stocks.json";
import usStockList from "@/lib/us_stocks.json";

interface StockSearchProps {
    onSearch: (symbol: string, exchange: string) => void;
    isLoading?: boolean;
}

const STOCK_LIST = stockList;
const US_STOCK_LIST = usStockList;

export function StockSearch({ onSearch, isLoading }: StockSearchProps) {
    const [query, setQuery] = useState("");
    const [exchange, setExchange] = useState("NSE");
    const [suggestions, setSuggestions] = useState<typeof STOCK_LIST>([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (query.trim().length > 0) {
            const lowerQuery = query.toLowerCase();
            const currentList = exchange === "US" ? US_STOCK_LIST : STOCK_LIST;
            const filtered = currentList.filter(stock =>
                stock.symbol.toLowerCase().includes(lowerQuery) ||
                stock.name.toLowerCase().includes(lowerQuery)
            ).slice(0, 50);
            setSuggestions(filtered);
        } else {
            setSuggestions([]);
            setShowDropdown(false);
        }
    }, [query, exchange]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setShowDropdown(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [wrapperRef]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (query.trim()) {
            onSearch(query.trim().toUpperCase(), exchange);
            setShowDropdown(false);
        }
    };

    const selectSuggestion = (symbol: string) => {
        setQuery(symbol);
        onSearch(symbol, exchange);
        setShowDropdown(false);
    };

    return (
        <div className="relative w-full max-w-md flex gap-2" ref={wrapperRef}>
            <select
                value={exchange}
                onChange={(e) => setExchange(e.target.value)}
                className="bg-card text-foreground border border-border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary h-9"
            >
                <option value="NSE">NSE</option>
                <option value="BSE">BSE</option>
                <option value="US">US (NASDAQ/NYSE)</option>
            </select>
            <form onSubmit={handleSearch} className="flex-1 flex items-center space-x-2">
                <Input
                    type="text"
                    placeholder="Search Stock (e.g. RELIANCE)"
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        if (e.target.value.trim().length > 0) setShowDropdown(true);
                    }}
                    onFocus={() => query.trim().length > 0 && setShowDropdown(true)}
                    className="flex-1"
                />
                <Button type="submit" disabled={isLoading} size="icon">
                    {isLoading ? "..." : <Search className="h-4 w-4" />}
                </Button>
            </form>

            {showDropdown && suggestions.length > 0 && (
                <Card className="absolute top-full left-16 mt-1 w-[calc(100%-4rem)] z-50 max-h-60 overflow-auto bg-popover shadow-md border-border">
                    <ul className="py-1">
                        {suggestions.map((stock) => (
                            <li
                                key={stock.symbol}
                                className="px-4 py-2 hover:bg-muted cursor-pointer text-sm flex justify-between items-center"
                                onClick={() => selectSuggestion(stock.symbol)}
                            >
                                <span className="font-semibold text-foreground">{stock.symbol}</span>
                                <span className="text-muted-foreground text-xs truncate ml-2">{stock.name}</span>
                            </li>
                        ))}
                    </ul>
                </Card>
            )}
        </div>
    )
}
