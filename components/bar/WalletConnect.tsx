'use client';
import { useState, useEffect } from "react";
import Image from "next/image";
import { FaSignOutAlt, FaWallet } from 'react-icons/fa';
import { useSupraWallet } from "@/context/SupraWalletContext";
import { useWallet as useWalletAPT } from "@aptos-labs/wallet-adapter-react";
import { useTranslations } from 'next-intl';
import { ConnectWalletHandler } from '@/components/wallet/ConnectWalletHandler';
import { useSupraPrice } from '@/hooks/features/token/useSupraPrice';

interface WalletConnectProps {
  // No props needed, it manages its own state via hooks
}

export default function WalletConnect() {
  const [showDisconnect, setShowDisconnect] = useState(false);
  const [visibleWallets, setVisibleWallets] = useState(false);
  const [showUsd, setShowUsd] = useState(false);
  
  const { disconnect } = useWalletAPT();
  const { accounts, balance, disconnect: supraDisconnect } = useSupraWallet();
  const walletAddress = accounts[0] || null;
  const { price } = useSupraPrice();
  
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

  const shortAccount = walletAddress
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    : "";

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
        <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3">
          <div className="relative inline-flex flex-col items-center">
            <div 
              className="group flex items-center justify-center px-3 py-1.5 sm:py-1 min-h-[32px] sm:min-h-[36px] bg-black/40 rounded-full border border-gray-800/80 backdrop-blur-md cursor-pointer transition-colors duration-300 hover:bg-black/60 shadow-inner z-10"
              onClick={(e) => { e.stopPropagation(); setShowUsd(!showUsd); }}
            >
              <div className="flex items-center gap-1.5 shrink-0">
                <Image src="/supra.webp" alt="Supra" width={14} height={14} className="rounded-full shadow-[0_0_8px_rgba(255,255,255,0.2)]" />
                <span className="text-xs sm:text-sm font-semibold text-gray-100 tracking-wide">
                  {formatSupra(numericBalance)}
                </span>
              </div>
            </div>
            
            {/* Expandable USD section (Below) */}
            <div 
              className={`absolute top-[100%] mt-1.5 overflow-hidden transition-all duration-300 ease-in-out bg-black/80 border border-gray-700/80 rounded-lg backdrop-blur-sm shadow-lg ${
                showUsd ? "max-h-[30px] opacity-100 py-1 px-3 border-opacity-100" : "max-h-0 opacity-0 py-0 px-3 border-opacity-0"
              }`}
            >
              <span className="text-[11px] sm:text-xs text-green-400/90 font-medium whitespace-nowrap">
                {formatUsd(rawUsd)}
              </span>
            </div>
          </div>
          <div className="relative inline-block">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowDisconnect(!showDisconnect);
              }}
              className="disconnect-button bg-gradient-to-r from-[#DD1438] to-[#FF6B6B] text-white font-medium py-1.5 px-3 sm:py-2 sm:px-4 rounded-full shadow-lg hover:shadow-[0_0_20px_rgba(255,107,0,0.7)] transition-all duration-300 ease-in-out text-xs sm:text-sm"
            >
              {shortAccount}
            </button>
            {showDisconnect && (
              <div className="disconnect-dropdown absolute right-0 mt-2 w-40 sm:w-48 bg-black/90 rounded-xl shadow-[0_0_15px_rgba(0,191,255,0.5)] border border-blue-500/50 z-[1100] overflow-hidden">
                <button
                  onClick={() => { 
                    supraDisconnect?.(); 
                    disconnect?.(); 
                    setShowDisconnect(false); 
                  }}
                  className="w-full text-center text-white py-3 px-4 bg-gradient-to-r from-red-600 to-pink-500 font-semibold rounded-xl flex items-center justify-center gap-2 hover:from-pink-500 hover:to-red-600 transition-all duration-300 ease-in-out shadow-[0_0_10px_rgba(255,107,0,0.5)] text-sm"
                >
                  <FaSignOutAlt className="text-sm" /> Disconnect
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <button
          onClick={() => setVisibleWallets(true)}
          className="bg-gradient-to-r from-[#DD1438] to-[#FF6B6B] text-white font-semibold py-2 px-4 sm:px-6 rounded-full shadow-xl hover:bg-gradient-to-r hover:from-[#FF6B6B] hover:to-[#DD1438] transition-all duration-300 ease-in-out flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(0,191,255,0.5)] text-sm sm:text-base"
        >
          <FaWallet className="text-sm" /> Connect Wallet
        </button>
      )}

      <ConnectWalletHandler 
          isOpen={visibleWallets} 
          onClose={() => setVisibleWallets(false)} 
      />
    </>
  );
}