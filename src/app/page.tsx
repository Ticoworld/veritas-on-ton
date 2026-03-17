import Image from "next/image";
import { TruthConsole } from "@/components/truth/TruthConsole";

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 flex flex-col items-center justify-start pt-12 px-4 pb-8">
      {/* Header + Hero */}
      <div className="text-center mb-8 w-full max-w-lg">
        <Image
          src="/images/logo.png"
          alt="Veritas"
          width={176}
          height={48}
          className="h-12 w-auto mx-auto mb-4"
          priority
        />
        <p className="text-[#A1A1AA] text-sm text-center max-w-md mx-auto">
          Check whether a project&apos;s website claims are supported by token truth and prior Veritas records.
        </p>
      </div>

      {/* Console */}
      <TruthConsole />

      {/* Footer */}
      <footer className="fixed bottom-4 text-center text-zinc-700 text-xs font-mono">
        Telegram-native TON trust investigation
      </footer>
    </main>
  );
}


