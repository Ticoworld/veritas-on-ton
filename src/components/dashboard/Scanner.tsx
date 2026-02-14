"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { CryptoLoader } from "@/components/ui/CryptoLoader";
import { UnifiedResultCard } from "./UnifiedResultCard";
import { useScanner } from "@/hooks/useScanner";

export function Scanner() {
  const [address, setAddress] = useState("");
  const { loading, error, result, scanToken, reset } = useScanner();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address.trim()) return;
    await scanToken(address);
  };

  const handleReset = () => {
    setAddress("");
    reset();
  };

  return (
    <div className="space-y-8">
      {/* Scanner Input - Always visible unless we have a result */}
      {!result && (
        <section>
          <form onSubmit={handleSubmit}>
            <div className="flex gap-3">
              <div className="flex-1">
                <Input
                  variant="command"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Paste TON explorer link or contract address..."
                  showPrompt
                  disabled={loading}
                />
              </div>
              <Button
                type="submit"
                variant="primary"
                size="lg"
                disabled={!address.trim() || loading}
                className="px-6"
              >
                <Search className="w-4 h-4" strokeWidth={1.5} />
                <span>Scan</span>
              </Button>
            </div>
            
            {/* Error message */}
            {error && (
              <p className="mt-3 text-sm text-danger font-mono">{error}</p>
            )}
          </form>
        </section>
      )}

      {/* Content area */}
      <div className="min-h-[400px]">
        {loading ? (
          <CryptoLoader message="Sherlock is investigating..." />
        ) : result ? (
          <UnifiedResultCard result={result} onReset={handleReset} />
        ) : (
          <div className="flex items-center justify-center h-[400px] text-zinc-600 font-mono text-sm">
            Enter an address to scan
          </div>
        )}
      </div>
    </div>
  );
}

