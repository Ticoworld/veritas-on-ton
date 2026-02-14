import { TruthConsole } from "@/components/truth/TruthConsole";

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-8">
      {/* Header + Hero */}
      <div className="text-center mb-10">
        <img 
          src="/images/logo.png" 
          alt="Veritas" 
          className="h-12 mx-auto mb-4"
        />
        <h1 className="text-[#FAFAFA] text-xl font-medium mb-2">
          Analyze TON tokens for scams before you buy
        </h1>
        <p className="text-[#71717A] text-sm max-w-md mx-auto">
          Paste a token contract address → we analyze on-chain data, socials &amp; website → you get a verdict
        </p>
      </div>

      {/* Console */}
      <TruthConsole />

      {/* Footer */}
      <footer className="fixed bottom-4 text-center text-zinc-700 text-xs font-mono">
        Trust no one. Verify everything.
        <span className="block mt-1 text-zinc-600">Powered by Google Gemini 3</span>
      </footer>
    </main>
  );
}


