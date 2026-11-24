"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface FunctionResultConsoleProps {
  result: any;
  error: string | null;
}

export function FunctionResultConsole({ result, error }: FunctionResultConsoleProps) {
  const [copied, setCopied] = useState(false);

  if (!result && !error) return null;

  const handleCopy = () => {
    const textToCopy = error
      ? error
      : typeof result === "string"
      ? result
      : JSON.stringify(result, null, 2);
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const displayText = error
    ? error
    : typeof result === "string"
    ? result
    : JSON.stringify(result, null, 2);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`mt-6 rounded-lg overflow-hidden border ${
          error ? "border-amm-pink/50" : "border-green-500/30"
        }`}
      >
        <div
          className={`px-4 py-2 text-xs font-bold uppercase tracking-wider flex items-center justify-between gap-2 ${
            error ? "bg-amm-red/20 text-amm-pink" : "bg-green-500/20 text-green-400"
          }`}
        >
          <span>{error ? "Error / Execution Failed" : "Success / Response"}</span>
          <button
            type="button"
            onClick={handleCopy}
            className={`px-2 py-1 rounded transition-colors flex items-center gap-1.5 cursor-pointer border ${
              copied
                ? "bg-green-500/30 text-green-300 border-green-500/50"
                : "bg-black/20 hover:bg-black/40 border-white/10 hover:border-white/20"
            }`}
            title="Copy to clipboard"
          >
            {copied ? (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                Copy
              </>
            )}
          </button>
        </div>
        <pre className="p-4 bg-black text-sm text-gray-200 font-mono whitespace-pre-wrap max-h-[300px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/20">
          {displayText}
        </pre>
      </motion.div>
    </AnimatePresence>
  );
}
