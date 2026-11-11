import React from 'react';
import Image from 'next/image';
import { ShieldAlert, Globe, ExternalLink, FileText, AlertTriangle } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Restricted Access | Hoglet Protocol',
  description: 'Access to this decentralized application interface is restricted in your region.',
  robots: { index: false, follow: false },
};

export default function GeoblockedPage() {
  return (
    <main className="min-h-screen w-full bg-black text-white flex flex-col justify-between items-center relative overflow-hidden px-4 py-8 sm:py-12">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] sm:w-[600px] h-[350px] sm:h-[600px] bg-gradient-to-tr from-red-950/30 via-red-900/10 to-transparent rounded-full blur-3xl pointer-events-none" />

      {/* Brand Header */}
      <header className="w-full max-w-4xl flex items-center justify-between z-10 py-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 relative rounded-xl overflow-hidden bg-black/60 border border-red-500/30 p-1.5 shadow-[0_0_15px_rgba(220,38,38,0.2)]">
            <Image src="/main/icon.png" alt="Hoglet Logo" width={40} height={40} className="object-contain" priority />
          </div>
          <div>
            <span className="font-extrabold tracking-wider text-sm sm:text-base text-gray-100 uppercase">
              Hoglet <span className="text-red-500">Protocol</span>
            </span>
            <p className="text-[10px] text-gray-500 tracking-wider">COMPLIANCE & RISK ENGINE</p>
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-mono font-medium">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-ping inline-block" />
          <span>ACCESS RESTRICTED</span>
        </div>
      </header>

      {/* Legal Shield Card */}
      <div className="w-full max-w-2xl my-auto z-10 py-8">
        <div className="relative rounded-3xl bg-neutral-950/80 border border-neutral-800/80 p-6 sm:p-10 shadow-2xl backdrop-blur-xl overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-red-500 to-transparent opacity-80" />

          <div className="flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-500 mb-6 shadow-[0_0_30px_rgba(239,68,68,0.25)]">
              <ShieldAlert className="w-10 h-10 animate-pulse" />
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-3">
              Restricted Jurisdiction
            </h1>
            
            <p className="text-sm sm:text-base text-gray-300 leading-relaxed mb-6 max-w-xl">
              Access to this decentralized interface is not available for persons or entities located in, 
              incorporated in, or residents of the <span className="text-white font-semibold">United States</span> and other 
              restricted territories, in accordance with applicable regulatory frameworks and our Terms of Service.
            </p>

            <div className="w-full text-left bg-neutral-900/60 rounded-2xl border border-neutral-800 p-4 sm:p-5 mb-8">
              <div className="flex items-center gap-2 text-xs font-semibold text-gray-300 uppercase tracking-wider mb-3">
                <Globe className="w-4 h-4 text-red-400" />
                <span>Geographical Restrictions Include:</span>
              </div>
              <ul className="text-xs sm:text-sm text-gray-400 space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-red-400 font-bold">•</span>
                  <span>United States of America and its territories (Puerto Rico, U.S. Virgin Islands, Guam, American Samoa, Northern Mariana Islands).</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400 font-bold">•</span>
                  <span>Jurisdictions subject to OFAC and comprehensive international sanctions (Cuba, Iran, North Korea, Syria, Russia / Crimea).</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400 font-bold">•</span>
                  <span>Use of Virtual Private Networks (VPN) or proxy servers to circumvent regional access controls is strictly prohibited.</span>
                </li>
              </ul>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-gray-500 mb-8 bg-neutral-900/40 px-4 py-2 rounded-xl border border-neutral-800/40">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <span>Underlying smart contracts on the blockchain remain public and autonomous. This interface restriction applies exclusively to this hosted front-end.</span>
            </div>

            {/* Links informativos (ESTRICTAMENTE SIN BOTÓN DE WALLET) */}
            <div className="w-full flex flex-col sm:flex-row items-center justify-center gap-3">
              <a
                href="https://hoglet.xyz"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white text-black font-semibold text-sm hover:bg-gray-200 transition shadow-lg"
              >
                <span>Hoglet Portal</span>
                <ExternalLink className="w-4 h-4" />
              </a>

              <a
                href="https://github.com/hoglet-DAO/tools-hoglet-cloudflare/blob/main/DISCLAIMER.md"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-gray-200 font-medium text-sm transition"
              >
                <FileText className="w-4 h-4 text-gray-400" />
                <span>Terms of Service</span>
              </a>
            </div>
          </div>
        </div>
      </div>

      <footer className="w-full max-w-4xl text-center z-10 pt-4 border-t border-neutral-900 text-xs text-gray-600 flex flex-col sm:flex-row items-center justify-between gap-2">
        <p>© {new Date().getFullYear()} Hoglet Ecosystem. All rights reserved.</p>
        <p className="font-mono text-[11px]">Enforced by Cloudflare Edge Policy</p>
      </footer>
    </main>
  );
}
