'use client';
import { useState, useEffect } from "react";
import Image from "next/image";
import { FaSignOutAlt, FaWallet, FaCopy, FaCheck } from 'react-icons/fa';
import { useSupraWallet } from "@/context/SupraWalletContext";
import { useWallet as useWalletAPT } from "@aptos-labs/wallet-adapter-react";
import { useNetwork } from "@/context/NetworkContext";
import { useTranslations } from 'next-intl';
import { ConnectWalletHandler } from '@/components/wallet/ConnectWalletHandler';
import { useSupraPrice } from '@snabur/hoglet-frontend/supra';
import { useSupraName } from '@snabur/hoglet-frontend/supra';

interface WalletConnectProps {
  // No props needed, it manages its own state via hooks
}

export default function WalletConnect() {
  const [showDisconnect, setShowDisconnect] = useState(false);
  const [visibleWallets, setVisibleWallets] = useState(false);
  const [showUsd, setShowUsd] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const { network } = useNetwork();
  const { disconnect } = useWalletAPT();
  const { accounts, balance, disconnect: supraDisconnect } = useSupraWallet();
  const walletAddress = accounts[0] || null;
  const { price } = useSupraPrice();
  const { snsName, shortAddress } = useSupraName(walletAddress, network);
  
  const t = useTranslations('translation');

  useEffect(() => {
    const handleOpenModal = () => setVisibleWallets(true);
    window.addEventListener('open-wallet-modal', handleOpenModal);
    return () => window.removeEventListener('open-wallet-modal', handleOpenModal);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const closeDropdown = (event: any) => {
      const isDisconnectButton = event.target.closest(".disconnect-button");
      const isDisconnectDropdown = event.target.closest(".disconnect-dropdown");
      
      if (!isDisconnectButton && !isDisconnectDropdown) {
        setShowDisconnect(false);
      }
    };
    document.addEventListener("click", closeDropdown);
    return () => document.removeEventListener("click", closeDropdown);
  }, []);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (walletAddress) {
      navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const numericBalance = balance ? parseFloat(balance.split(' ')[0]) : 0;
  const rawUsd = (price && numericBalance) ? numericBalance * price : 0;

  const formatUsd = (val: number) => {
    if (val === 0) return "$0.00";
    if (val < 0.01) return "< $0.01";
    return `$${val.toFixed(2)}`;
  };

  const formatSupra = (val: number) => {
    if (val === 0) return "0";
    if (val < 0.001) return "<0.001";
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(val);
  };

  useEffect(() => {
    if (showUsd) {
      const timer = setTimeout(() => setShowUsd(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showUsd]);

  return (
    <>
      {walletAddress ? (
        <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-2.5">
          {/* Balance Pill with USD Expandable */}
          <div className="relative hidden md:inline-flex flex-col items-center">
            <div 
              className="group flex items-center justify-center px-3 py-1.5 sm:py-1 min-h-[32px] sm:min-h-[36px] bg-[#0B121C]/80 hover:bg-[#111B2B] rounded-full border border-cyan-500/20 hover:border-cyan-500/40 backdrop-blur-md cursor-pointer transition-colors duration-300 shadow-inner z-10"
              onClick={(e) => { e.stopPropagation(); setShowUsd(!showUsd); }}
            >
              <div className="flex items-center gap-1.5 shrink-0">
                <Image src="/supra.webp" alt="Supra" width={14} height={14} className="rounded-full shadow-[0_0_8px_rgba(255,255,255,0.2)]" />
                <span className="text-xs sm:text-sm font-semibold text-slate-200 tracking-wide">
                  {formatSupra(numericBalance)}
                </span>
              </div>
            </div>
            
            {/* Expandable USD section (Below) */}
            <div 
              className={`absolute top-[100%] mt-1.5 overflow-hidden transition-all duration-300 ease-in-out bg-[#0B121C]/95 border border-cyan-500/20 rounded-lg backdrop-blur-md shadow-lg ${
                showUsd ? "max-h-[30px] opacity-100 py-1 px-3 border-opacity-100" : "max-h-0 opacity-0 py-0 px-3 border-opacity-0"
              }`}
            >
              <span className="text-[11px] sm:text-xs text-emerald-400 font-medium whitespace-nowrap">
                {formatUsd(rawUsd)}
              </span>
            </div>
          </div>

          {/* Identity Pill */}
          <div className="relative inline-block">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowDisconnect(!showDisconnect);
              }}
              className="disconnect-button group flex items-center gap-2.5 px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-medium bg-[#0B121C]/90 hover:bg-[#111B2B] text-slate-200 border border-cyan-500/30 hover:border-cyan-400/70 shadow-[0_0_12px_rgba(6,182,212,0.15)] hover:shadow-[0_0_18px_rgba(6,182,212,0.3)] backdrop-blur-md transition-all duration-300 ease-in-out"
            >
              {snsName ? (
                <>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400" />
                  </span>
                  <span className="font-mono font-semibold text-cyan-300 tracking-tight truncate max-w-[130px] sm:max-w-[170px]" title={walletAddress}>
                    {snsName}
                  </span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 ring-4 ring-emerald-500/20 shrink-0" />
                  <span className="font-mono text-slate-300">
                    {shortAddress}
                  </span>
                </>
              )}
            </button>

            {showDisconnect && (
              <div className="disconnect-dropdown absolute right-0 mt-2 w-56 sm:w-64 bg-[#0B121C]/95 backdrop-blur-xl rounded-2xl shadow-[0_10px_35px_rgba(0,0,0,0.8),0_0_15px_rgba(6,182,212,0.2)] border border-cyan-500/30 p-2.5 z-[1100]">
                <div className="p-2.5 mb-2 bg-[#060B12] rounded-xl border border-slate-800/80 flex flex-col gap-1.5">
                  {snsName && (
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-wider text-cyan-400 font-bold">Supra Name</span>
                      <span className="text-xs text-cyan-200 font-mono font-semibold truncate max-w-[140px]">{snsName}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-0.5">
                    <span className="text-xs text-slate-400 font-mono">{shortAddress}</span>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="p-1.5 text-slate-400 hover:text-cyan-300 hover:bg-cyan-950/40 rounded-md transition"
                      title="Copy full address"
                    >
                      {copied ? <FaCheck className="text-emerald-400 text-xs" /> : <FaCopy className="text-xs" />}
                    </button>
                  </div>
                  <div className="flex items-center justify-between pt-0.5 border-t border-slate-800/60 mt-0.5">
                    <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Balance</span>
                    <span className="text-xs text-slate-200 font-semibold whitespace-nowrap">
                      {formatSupra(numericBalance)} SUPRA
                      <span className="text-emerald-400 ml-1.5">{formatUsd(rawUsd)}</span>
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { 
                    supraDisconnect?.(); 
                    disconnect?.(); 
                    setShowDisconnect(false); 
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs sm:text-sm font-semibold text-rose-300 hover:text-white bg-rose-950/30 hover:bg-rose-600/80 border border-rose-500/20 hover:border-rose-500/40 transition-all duration-200 shadow-sm"
                >
                  <FaSignOutAlt className="text-xs" aria-hidden="true" />
                  <span>Disconnect</span>
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setVisibleWallets(true)}
          className="group relative flex items-center justify-center gap-2 px-5 py-2 sm:px-6 sm:py-2.5 rounded-full font-semibold text-white text-xs sm:text-sm bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:via-blue-500 hover:to-indigo-500 shadow-[0_0_18px_rgba(6,182,212,0.35)] hover:shadow-[0_0_24px_rgba(6,182,212,0.55)] transition-all duration-300 ease-in-out transform hover:-translate-y-0.5 active:translate-y-0"
        >
          <FaWallet className="text-sm transition-transform duration-300 group-hover:scale-110" aria-hidden="true" />
          <span className="hidden sm:inline">Connect Wallet</span>
          <span className="sm:hidden">Connect</span>
        </button>
      )}

      <ConnectWalletHandler 
          isOpen={visibleWallets} 
          onClose={() => setVisibleWallets(false)} 
      />
    </>
  );
}
