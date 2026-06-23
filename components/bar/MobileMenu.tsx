'use client';
import { Link } from '@/i18n/navigation';
import { AiOutlineClose } from "react-icons/ai";
import { useTranslations } from 'next-intl';
import WalletConnect from './WalletConnect';
import LanguageSelector from './LanguageSelector';

interface MobileMenuProps {
  toggleMenu: boolean;
  setToggleMenu: (toggle: boolean) => void;
  language: string;
  setLanguage: (lang: string) => void;
  // No getLinkHref needed here, as links will be standard and WalletConnect is self-contained.
}

export default function MobileMenu({
  toggleMenu,
  setToggleMenu,
  language,
  setLanguage,
}: MobileMenuProps) {
  const t = useTranslations('translation');

  if (!toggleMenu) return null;

  return (
    <ul className="fixed top-0 right-0 w-[60vw] max-w-xs h-screen shadow-2xl md:hidden flex flex-col justify-start items-center rounded-l-lg bg-black text-white animate-slide-in z-30 p-6 toggle-menu space-y-4">
      <li>
        <AiOutlineClose
          onClick={() => {
            setToggleMenu(false);
          }}
          className="flex text-2xl justify-end cursor-pointer hover:text-gray-400 transition duration-200"
        />
      </li>
      {/* <li><Link href="/trade">{t('trade')}</Link></li> */}
      {/* <li><Link href="/NFT">{t('nft')}</Link></li> */}
      
      <LanguageSelector language={language} setLanguage={setLanguage} isMobile={true} />

      <li className="w-full flex justify-center">
        <WalletConnect />
      </li>
    </ul>
  );
}
