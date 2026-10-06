'use client';
import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';

// Props are no longer needed if t is used internally
interface NavigationProps {
  t: (key: string) => string;
}

export default function Navigation({ t }: NavigationProps) {
  return (
    <nav className="hidden md:flex text-white list-none text-xl sm:text-lg md:text-2xl lg:text-3xl xl:text-xl sm:gap-6 md:gap-12 xl:gap-13 gap-3 items-center">
      <Link href="/governance" className="nav-link">{t('governance')}</Link>
      {/* <Link href="/trade" className="nav-link">{t('buySpike')}</Link> */}
      {/* <Link href="/NFT" className="nav-link">{t('nft')}</Link> */}
    </nav>
  );
}
