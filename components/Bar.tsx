'use client';
import { useState, useEffect, useCallback } from "react";
import { AiOutlineClose } from "react-icons/ai";
import { HiMenuAlt4 } from "react-icons/hi";
import { useNetwork } from '@/context/NetworkContext';
import { useTranslations } from 'next-intl';

// Existing Local Components
import NetworkSwitchButton from '@/components/EnvironmentToggleButton';

// Adapted Components from src/components/bar
import Navigation from '@/components/bar/Navigation';
import LanguageSelector from '@/components/bar/LanguageSelector';
import WalletConnect from '@/components/bar/WalletConnect';
import MobileMenu from '@/components/bar/MobileMenu';
import TestnetIndicator from '@/components/bar/TestnetIndicator';

export default function Bar() {
  const [toggleMenu, setToggleMenu] = useState(false);
  const [language, setLanguage] = useState('en');
  const { network } = useNetwork();
  const t = useTranslations('translation');

  const handleToggleClick = (e: React.MouseEvent) => {
    e.stopPropagation(); 
    setToggleMenu((prev) => !prev);
  };

  const handleLanguageChange = useCallback((newLang: string) => {
    setLanguage(newLang);
    // Note: The LanguageSelector component handles routing internally.
    // The useCallback here is for consistency if language state is passed down.
  }, []);

  // Effect to close menus on outside click
  useEffect(() => {
    const closeMenus = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest(".toggle-menu") && !target.closest(".toggle-button")) {
        setToggleMenu(false);
      }
      // Note: WalletConnect manages its own dropdown, so no need to handle showDisconnect here.
    };
    document.addEventListener("click", closeMenus);
    return () => document.removeEventListener("click", closeMenus);
  }, []);

  return (
    <div className="flex flex-col w-full z-50">
      <header className="relative w-full bg-black font-bold flex md:justify-center justify-between items-center py-4">
        <div className="z-10 flex items-center w-full md:w-auto max-w-screen-xl mx-auto px-4 z-40">
          {/* Desktop Navigation */}
          <div className="hidden md:flex flex-grow justify-center items-center gap-4">
            <NetworkSwitchButton />
            <Navigation t={t} /> {/* Navigation is adapted to use t */}
            <LanguageSelector language={language} setLanguage={handleLanguageChange} /> {/* handleLanguageChange passed */}
            <WalletConnect /> {/* WalletConnect is self-contained */}
          </div>

          {/* Mobile Toggle */}
          <div className="flex md:hidden w-full justify-between items-center">
            <NetworkSwitchButton />
            <button onClick={handleToggleClick} className="text-white toggle-button cursor-pointer">
              {toggleMenu ? <AiOutlineClose size={28} className="toggle-button" /> : <HiMenuAlt4 size={28} className="toggle-button" />}
            </button>
          </div>

          {/* Mobile Menu */}
          <MobileMenu 
            toggleMenu={toggleMenu}
            setToggleMenu={setToggleMenu}
            language={language}
            setLanguage={handleLanguageChange}
          />
        </div>
      </header>

      {/* Testnet Faucet Banner */}
      <TestnetIndicator network={network} /> {/* TestnetIndicator is self-contained */}      
    </div>
  );
}
