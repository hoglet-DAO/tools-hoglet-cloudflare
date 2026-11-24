'use client';

import React from 'react';
import Image from 'next/image';
import { useLegalCompliance } from '@/hooks/useLegalCompliance';
import {
  ShieldAlert,
  AlertTriangle,
  FileCheck2,
  Lock,
  Globe,
  ExternalLink,
  Loader2,
  X,
  CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function LegalConsentModal() {
  const {
    currentAccount,
    isUSDetected,
    userTimezone,
    hasConsent,
    isSigningConsent,
    showConsentModal,
    setShowConsentModal,
    requestSignConsent,
  } = useLegalCompliance();

  const truncatedAccount = currentAccount
    ? `${currentAccount.slice(0, 6)}...${currentAccount.slice(-4)}`
    : '';

  return (
    <>
      {/* 1. ANTI-VPN / US TIMEZONE RED WARNING BANNER */}
      {isUSDetected && (
        <div className="w-full bg-gradient-to-r from-red-950 via-red-900 to-red-950 border-b border-red-500/50 text-red-200 px-4 py-2 text-xs flex items-center justify-center gap-2.5 z-50 sticky top-0 shadow-lg">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 animate-pulse" />
          <p className="leading-snug text-center">
            <span className="font-bold text-red-100 uppercase tracking-wide">Restricted Jurisdiction:</span>{' '}
            Detected timezone <code className="bg-red-900/60 px-1.5 py-0.5 rounded text-red-100 font-mono text-[11px]">{userTimezone || 'US Timezone'}</code> indicates access from the United States. Smart contract transactions and signatures are disabled.
          </p>
        </div>
      )}

      {/* 2. CLICKWRAP OFF-CHAIN CERTIFICATION MODAL (0 GAS) */}
      <AnimatePresence>
        {showConsentModal && !isUSDetected && currentAccount && !hasConsent && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowConsentModal(false)}
              className="absolute inset-0 bg-black/75 backdrop-blur-md"
            />

            {/* Modal Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative w-full max-w-lg bg-neutral-950/95 border border-neutral-800 p-6 sm:p-7 rounded-3xl shadow-2xl backdrop-blur-2xl overflow-hidden z-10"
            >
              {/* Top Accent Gradient */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-500 via-amber-500 to-cyan-500" />

              {/* Close Button */}
              <button
                type="button"
                onClick={() => setShowConsentModal(false)}
                className="absolute top-4 right-4 p-1.5 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800/60 transition"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Header */}
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 shadow-[0_0_20px_rgba(239,68,68,0.2)] shrink-0">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-white tracking-tight">
                      Jurisdiction Certification
                    </h2>
                    <span className="px-2 py-0.5 text-[10px] font-mono font-medium rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                      0 GAS · OFF-CHAIN
                    </span>
                  </div>
                  <p className="text-xs text-neutral-400">
                    Required prior to smart contract interactions
                  </p>
                </div>
              </div>

              {/* Connected Account Display */}
              <div className="flex items-center justify-between bg-neutral-900/60 border border-neutral-800/80 rounded-xl px-3.5 py-2 mb-4 text-xs">
                <span className="text-neutral-400">Signer Account:</span>
                <span className="font-mono text-neutral-200 font-semibold">{truncatedAccount}</span>
              </div>

              {/* Compliance Terms Warranties */}
              <div className="bg-neutral-900/40 border border-neutral-800/60 rounded-2xl p-4 mb-5 text-xs text-neutral-300 space-y-2.5">
                <div className="flex items-center gap-1.5 text-neutral-400 font-medium text-[11px] uppercase tracking-wider mb-1">
                  <FileCheck2 className="w-3.5 h-3.5 text-red-400" />
                  <span>By signing off-chain, you certify that:</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>
                    You are <strong>NOT</strong> a citizen, resident, or entity located or incorporated in the <strong>United States</strong> or its territories.
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>
                    You are <strong>NOT</strong> located in any comprehensive OFAC-sanctioned jurisdiction (Cuba, Iran, North Korea, Syria, Russia).
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>
                    You are <strong>NOT</strong> using a VPN, proxy, or disguise tool to bypass regional access restrictions.
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>
                    You agree to the Hoglet Protocol Terms of Service and Disclaimers.
                  </span>
                </div>
              </div>

              {/* Notice */}
              <div className="flex items-center gap-2 text-[11px] text-neutral-500 mb-5 bg-neutral-900/20 px-3 py-1.5 rounded-lg border border-neutral-800/40">
                <Lock className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                <span>
                  This signature is an off-chain cryptographic proof. It will <strong>never</strong> cost GAS or execute a blockchain transaction.
                </span>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-2.5">
                <button
                  type="button"
                  disabled={isSigningConsent}
                  onClick={() => requestSignConsent()}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white text-black font-semibold text-sm hover:bg-neutral-200 active:scale-[0.98] transition disabled:opacity-50 disabled:pointer-events-none shadow-lg cursor-pointer"
                >
                  {isSigningConsent ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Requesting Signature...</span>
                    </>
                  ) : (
                    <>
                      <FileCheck2 className="w-4 h-4" />
                      <span>Sign Certification (0 Gas)</span>
                    </>
                  )}
                </button>

                <a
                  href="https://github.com/hoglet-DAO/tools-hoglet-cloudflare/blob/main/DISCLAIMER.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700/80 text-neutral-300 font-medium text-xs transition"
                >
                  <span>Terms & Disclaimer</span>
                  <ExternalLink className="w-3.5 h-3.5 text-neutral-500" />
                </a>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

export default LegalConsentModal;
