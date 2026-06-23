"use client";

import { useLocale } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

const localeLabels: Record<string, string> = {
  en: "🇺🇸 EN",
  es: "🇪🇸 ES",
};

export default function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const handleChange = (newLocale: string) => {
    router.replace(pathname, { locale: newLocale });
  };

  return (
    <div className="flex space-x-2">
      {routing.locales.map((loc) => (
        <button
          key={loc}
          id={`lang-btn-${loc}`}
          onClick={() => handleChange(loc)}
          className={`px-3 py-1 text-sm rounded-md transition-colors ${
            locale === loc
              ? "bg-[#DD1438] text-white"
              : "bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white"
          }`}
          aria-label={`Switch to ${loc}`}
        >
          {localeLabels[loc]}
        </button>
      ))}
    </div>
  );
}
