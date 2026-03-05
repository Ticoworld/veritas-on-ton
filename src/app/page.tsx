import { TruthConsole } from "@/components/truth/TruthConsole";

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 flex flex-col items-center justify-start pt-12 px-4 pb-8">
      {/* Header + Hero */}
      <div className="text-center mb-8 w-full max-w-lg">
        <img 
          src="/images/logo.png" 
          alt="Veritas" 
          className="h-12 mx-auto mb-4"
        />
        <p className="text-[#A1A1AA] text-sm text-center max-w-md mx-auto">
          Paste a TON contract address to verify on-chain data and detect visual scams.
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


