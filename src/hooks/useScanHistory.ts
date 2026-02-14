"use client";

import { useState, useEffect } from "react";
import type { AuditResult } from "@/types";

const MAX_HISTORY_SIZE = 10;
const STORAGE_KEY = "veritas_history";

export function useScanHistory() {
  const [history, setHistory] = useState<AuditResult[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const loadHistory = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setHistory(JSON.parse(stored));
      }
    } catch (e) {
      console.error("[useScanHistory] Failed to load history", e);
    }
  };

  // Load on mount and listen for updates
  useEffect(() => {
    loadHistory();
    setIsLoaded(true);

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) loadHistory();
    };

    const handleCustomUpdate = () => loadHistory();

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("veritas-history-update", handleCustomUpdate);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("veritas-history-update", handleCustomUpdate);
    };
  }, []);

  const addScan = (scan: AuditResult) => {
    // Read fresh from localStorage to avoid stale state in closures
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const currentHistory: AuditResult[] = stored ? JSON.parse(stored) : [];
      
      const filtered = currentHistory.filter(item => item.tokenData.address !== scan.tokenData.address);
      const newHistory = [scan, ...filtered].slice(0, MAX_HISTORY_SIZE);
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory));
      setHistory(newHistory); // Update local state
      
      // Dispatch event for other hook instances
      window.dispatchEvent(new Event("veritas-history-update"));
    } catch (e) {
      console.error("Failed to add scan", e);
    }
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event("veritas-history-update"));
  };

  return { history, addScan, clearHistory, isLoaded };
}
