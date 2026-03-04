"use client";

import { TonConnectUIProvider } from "@tonconnect/ui-react";

const manifestUrl = "https://veritas-on-ton.vercel.app/tonconnect-manifest.json";

export function TonConnectProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TonConnectUIProvider manifestUrl={manifestUrl}>
      {children}
    </TonConnectUIProvider>
  );
}
