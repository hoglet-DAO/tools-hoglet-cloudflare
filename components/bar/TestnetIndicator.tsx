'use client';

import React, { Fragment, useState, useCallback } from 'react';
import Marquee from 'react-fast-marquee';
import { useSupraWallet } from '@/context/SupraWalletContext';
import { useTranslations } from 'next-intl'; // Import useTranslations

interface TestnetIndicatorProps {
  network: string;
}

export default function TestnetIndicator({ network }: TestnetIndicatorProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const { accounts } = useSupraWallet();
  const walletAddress = accounts[0] || null;
  const t = useTranslations('translation'); // Initialize useTranslations

  const fetchFaucet = useCallback(async () => {
    if (!walletAddress) {
      setError("Wallet not connected to request faucet.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/faucet?address=${walletAddress}`, {
        method: "GET",
        headers: { "Accept": "application/json" },
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setResult(JSON.stringify(data));
      console.log("data", data);
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  if (network !== 'supra-testnet') {
    return null;
  }

  const firstItem = { icon: " ⚡ ", label: "TESTNET" };
  const otherItems = Array(7).fill({ icon: " ⚡ ", label: "TESTNET" });
  const items = [firstItem, ...otherItems];

  return (
    <div className="w-full h-7 bg-black text-yellow-300 flex items-center justify-center z-10 shadow-lg overflow-hidden relative group">
      <div className="absolute inset-0 opacity-20" />
      {result && (
        <div className="absolute top-full mt-2 w-full text-center text-md text-white">
          {result}
        </div>
      )}
      {loading ? (
        <button className="absolute z-40 px-4 h-auto w-auto text-md bg-yellow-500 text-black font-bold rounded-full shadow-lg hover:bg-yellow-600 transition duration-300">
          {t('loading')}
        </button>
      ) : (
        <button
          className="absolute z-40 px-4 h-auto w-auto text-md bg-yellow-500 text-black font-bold rounded-full shadow-lg hover:bg-yellow-600 transition duration-300"
          onClick={fetchFaucet}
          disabled={!walletAddress}
        >
          {t('getFreeSupra')}
        </button>
      )}
      {error && (
        <div className="absolute top-full mt-2 w-full text-center text-md text-red-500">
          {error}
        </div>
      )}
      <Marquee
        gradient={true}
        gradientColor="rgb(17, 24, 39)"
        gradientWidth={80}
        speed={40}
        loop={0}
        delay={0}
        pauseOnHover={true}
        aria-label="Indicador de Testnet"
      >
        <div className="flex items-center space-x-8 mx-4">
          {items.map((item, index) => (
            <Fragment key={index}>
              <span className="flex items-center text-sm tracking-wider">
                <span className="mr-3 text-yellow-400 animate-pulse">{item.icon}</span>
                {item.label}
                <span className="ml-3 text-yellow-400 animate-pulse">{item.icon}</span>
              </span>
              {index < items.length - 1 && (
                <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
              )}
            </Fragment>
          ))}
        </div>
      </Marquee>
      <div className="absolute bottom-0 left-0 w-full h-1" />
    </div>
  );
}
