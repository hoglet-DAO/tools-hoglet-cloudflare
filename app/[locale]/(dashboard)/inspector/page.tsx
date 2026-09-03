import { Metadata } from "next";
import Inspector from "@/components/Inspector";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";

export const metadata: Metadata = {
  title: "Token Inspector & Auditor | Hoglet",
  description: "Audit Supra Fungible Assets and Legacy Coins. View token supply, metadata, and mathematically verify if a token's admin powers (Mint, Burn, Freeze, Transfer) are 100% renounced on-chain.",
  keywords: ["Supra", "Token Inspector", "Fungible Asset", "Move Smart Contract", "Token Audit", "Renounced Token", "Crypto Security"],
  openGraph: {
    title: "Token Inspector & Auditor | Hoglet",
    description: "Scan Supra tokens to uncover admin capabilities and verify on-chain safety.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Token Inspector & Auditor | Hoglet",
    description: "Audit Supra Fungible Assets and verify if admin powers are 100% renounced on-chain.",
  }
};

export default function InspectorPage() {
  return (
    <Suspense 
      fallback={
        <div className="flex-1 flex items-center justify-center min-h-screen">
          <Loader2 className="w-8 h-8 text-amm-pink animate-spin" />
        </div>
      }
    >
      <Inspector />
    </Suspense>
  );
}
