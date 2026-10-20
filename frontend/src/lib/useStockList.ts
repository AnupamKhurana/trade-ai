"use client";

import { useEffect, useState } from "react";
import seedStockList from "@/lib/stocks.json";
import usStockList from "@/lib/us_stocks.json";
import { api } from "@/lib/api";

export interface StockListItem {
    symbol: string;
    name: string;
}

// The bundled NSE list is only a seed; the backend refreshes it daily from NSE
// and serves it at /market/symbols. Fetch it once per page load and share it.
let nseListPromise: Promise<StockListItem[]> | null = null;

function loadNseList(): Promise<StockListItem[]> {
    if (!nseListPromise) {
        nseListPromise = api.getSymbols()
            .then(list => (list.length > 0 ? list : seedStockList))
            .catch(() => seedStockList);
    }
    return nseListPromise;
}

export function useStockList(exchange: string): StockListItem[] {
    const [nseList, setNseList] = useState<StockListItem[]>(seedStockList);

    useEffect(() => {
        let active = true;
        loadNseList().then(list => {
            if (active) setNseList(list);
        });
        return () => {
            active = false;
        };
    }, []);

    return exchange === "US" ? usStockList : nseList;
}
