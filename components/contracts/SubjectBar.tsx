"use client";

import { motion } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { Check, Clock, Loader2, Search, Share2 } from "lucide-react";
import { shortenAddress } from "@/utils/formatters";
import { routing } from "@/i18n/routing";

/**
 * The two things you can do with a Supra address once you have one.
 *
 * They are separate pages with separate bodies — one answers "who controls this token", the other "how do
 * I call this module" — but they are the same question at the front door, and they had the same bar
 * implemented twice. This bar is the front door, and the mode only says which body is below it.
 */
export type SubjectMode = "audit" | "interact" | "source";

const ROUTES: Record<SubjectMode, string> = {
  audit: "inspector",
  interact: "interactor",
  source: "verify",
};

/** Framework addresses worth offering to someone about to call a Move function. */
const POPULAR = ["0x1", "0x3", "0x4"];

/** Prefixes a route with the active locale, so switching mode does not drop the visitor out of their language. */
export function localeHref(locale: string, route: string): string {
  return locale && (routing.locales as readonly string[]).includes(locale) ? `/${locale}/${route}` : `/${route}`;
}

interface SubjectBarProps {
  mode: SubjectMode;
  /** The field's contents. Typed into, not committed — that is `onSubmit`. */
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isScanning: boolean;
  /** Addresses committed recently, from either mode. */
  recents: string[];
  onPickRecent: (address: string) => void;
  /** Hint shown while the field is empty. Defaults to the raw hex prompt. */
  placeholder?: string;
  /**
   * The interactor's framework shortlist.
   *
   * Opt-in because these are only meaningful to someone about to call a function; the same row in the
   * audit view would be three addresses that are not the token being audited.
   */
  showPopular?: boolean;
}

/**
 * The address bar shared by the inspector and the interactor.
 *
 * Unified deliberately, and only at this level. The two surfaces differ in what they do with an address —
 * one reads capabilities, the other builds transactions — so the bodies stayed separate, while the
 * controls that decide *which* address is in play became one thing. That fixed the two real costs of the
 * split: the recents did not travel between the surfaces, and the only way from an audit to the matching
 * interactor was a button buried in a capability card. Now there is one recents list, and the mode switch
 * is the handoff in both directions.
 *
 * Switching carries `?address` across. Both surfaces read that parameter on arrival and scan it, so
 * moving between them keeps looking at the same address instead of dropping back to an empty field.
 */
export function SubjectBar({
  mode,
  value,
  onChange,
  onSubmit,
  isScanning,
  recents,
  onPickRecent,
  placeholder = "0x...",
  showPopular = false,
}: SubjectBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [copiedShare, setCopiedShare] = useState(false);

  const locale = pathname.split("/")[1];

  const switchMode = useCallback(
    (target: SubjectMode) => {
      if (target === mode) return;
      router.push(`${localeHref(locale, ROUTES[target])}${value ? `?address=${value}` : ""}`);
    },
    [router, locale, mode, value]
  );

  const handleShare = useCallback(() => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedShare(true);
    setTimeout(() => setCopiedShare(false), 2000);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.1 }}
      className="relative group mb-8"
    >
      <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition duration-500 pointer-events-none" />

      <div className="relative z-10 flex flex-col lg:flex-row items-stretch lg:items-center gap-2 bg-zinc-900/80 border border-white/10 rounded-2xl p-2 backdrop-blur-sm lg:p-0 lg:pl-2 lg:pr-3">
        {/* Which body is below. Segmented rather than a nav link so the shared address is visibly shared. */}
        <div
          role="tablist"
          aria-label="Surface"
          className="flex items-center gap-1 rounded-xl border border-white/10 bg-black/40 p-1 shrink-0"
        >
          {(["audit", "interact", "source"] as const).map((m) => (
            <button
              key={m}
              role="tab"
              type="button"
              aria-selected={m === mode}
              onClick={() => switchMode(m)}
              className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                m === mode ? "bg-cyan-500/15 text-cyan-300" : "text-gray-500 hover:text-gray-200"
              }`}
            >
              {m === "audit" ? "Audit" : m === "interact" ? "Interact" : "Source"}
            </button>
          ))}
        </div>

        <div className="relative flex-1 flex items-center">
          <Search className="w-5 h-5 sm:w-6 sm:h-6 text-zinc-500 group-focus-within:text-cyan-400 transition-colors absolute left-4 pointer-events-none" />
          <input
            type="text"
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSubmit();
            }}
            aria-label="Contract address"
            className="w-full bg-transparent pl-11 pr-4 py-3.5 sm:py-4 text-sm sm:text-lg font-mono text-white placeholder-zinc-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={handleShare}
            className="p-1.5 sm:p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors flex items-center justify-center cursor-pointer"
            title="Copy a link to this address"
          >
            {copiedShare ? <Check className="w-4 h-4 sm:w-5 sm:h-5 text-green-400" /> : <Share2 className="w-4 h-4 sm:w-5 sm:h-5" />}
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isScanning || !value}
            className="px-4 sm:px-6 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-black font-bold transition-colors flex items-center gap-2 cursor-pointer text-sm sm:text-base"
          >
            {isScanning ? <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" /> : mode === "audit" ? "Inspect" : mode === "source" ? "Verify" : "Scan"}
          </button>
        </div>
      </div>

      {recents.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center gap-2 mt-4 px-2 relative z-10"
        >
          <span className="text-xs text-gray-500 font-bold flex items-center gap-1 uppercase tracking-wider">
            <Clock className="w-3 h-3" /> Recent:
          </span>
          {recents.map((recent) => (
            <button
              key={recent}
              type="button"
              onClick={() => onPickRecent(recent)}
              className="text-xs text-gray-400 bg-white/5 hover:bg-white/10 hover:text-white border border-white/5 hover:border-white/20 rounded-full px-3 py-1 transition-all flex items-center gap-1 cursor-pointer font-mono"
              title={recent}
              disabled={isScanning}
            >
              {shortenAddress(recent)}
            </button>
          ))}
        </motion.div>
      )}

      {showPopular && (
        <div className="flex gap-2 flex-wrap items-center mt-4 px-2 relative z-10">
          <span className="text-gray-500 text-xs font-bold uppercase tracking-wider mr-1">Popular:</span>
          {POPULAR.map((addr) => (
            <button
              key={addr}
              type="button"
              onClick={() => onPickRecent(addr)}
              className="px-3 py-1.5 bg-black/40 hover:bg-cyan-500/20 border border-white/10 hover:border-cyan-400/50 rounded-full text-[10px] sm:text-xs font-mono text-gray-400 hover:text-cyan-200 transition-all cursor-pointer"
            >
              {addr}
            </button>
          ))}
        </div>
      )}
    </motion.div>
  );
}