'use client';
import { useState, useCallback } from "react";
import { useNetwork } from '@/context/NetworkContext';
import { useLocale } from 'next-intl';

// Existing Local Components
import NetworkSwitchButton from '@/components/EnvironmentToggleButton';

// Adapted Components from src/components/bar
import LanguageSelector from '@/components/bar/LanguageSelector';
import WalletConnect from '@/components/bar/WalletConnect';
import TestnetIndicator from '@/components/bar/TestnetIndicator';
import { LanguageMenu } from '@snabur/hoglet-frontend/i18n';

export default function Bar() {
  const activeLocale = useLocale();
  const [language, setLanguage] = useState(activeLocale);
  const { network } = useNetwork();

  const handleLanguageChange = useCallback((newLang: string) => {
    setLanguage(newLang);
    // Note: The LanguageSelector component handles routing internally.
    // The useCallback here is for consistency if language state is passed down.
  }, []);

  return (
    <div className="flex flex-col w-full z-50">
      <header className="relative w-full bg-black font-bold flex md:justify-center justify-between items-center py-4">
        <div className="z-10 flex items-center w-full md:w-auto max-w-screen-xl mx-auto px-4 z-40">
          {/* Desktop Navigation */}
          <div className="hidden md:flex flex-grow justify-center items-center gap-4">
            <NetworkSwitchButton />
            <LanguageSelector language={language} setLanguage={handleLanguageChange} />
            <WalletConnect /> {/* WalletConnect is self-contained */}
          </div>

          {/* Móvil: logo (tocar = home, mantener = cambiar red) + idioma + conectar. */}
          <div className="flex md:hidden w-full items-center justify-between gap-2">
            <NetworkSwitchButton />
            <div className="flex items-center gap-1 ml-auto">
              <LanguageMenu placement="down" />
              <WalletConnect />
            </div>
          </div>
        </div>
      </header>

      {/* Testnet Faucet Banner */}
      <TestnetIndicator network={network} /> {/* TestnetIndicator is self-contained */}
    </div>
  );
}
