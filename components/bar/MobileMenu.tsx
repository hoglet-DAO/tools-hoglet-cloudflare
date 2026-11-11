'use client';
import { AiOutlineClose } from "react-icons/ai";
import { BookOpen, ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";
import WalletConnect from './WalletConnect';
import LanguageSelector from './LanguageSelector';
import { VAULT_STANDARD_DOCS_URL } from "@/config/links";

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
  const t = useTranslations("Nav");
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

      {/* The standard. External, so it is styled apart from the wallet controls above rather than
          blending into them as if it were another in-app action. */}
      <li className="w-full">
        <a
          href={VAULT_STANDARD_DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
        >
          <BookOpen className="w-4 h-4" />
          {t("navStandard")}
          <ArrowUpRight className="w-3.5 h-3.5 text-gray-500" />
        </a>
      </li>
    </ul>
  );
}
