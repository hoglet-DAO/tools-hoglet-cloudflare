import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Geist_Mono } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { getMessages, getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { NetworkProvider } from "@/context/NetworkContext";
import { SupraWalletProvider } from "@/context/SupraWalletContext";
import { LegalModal } from "@/components/ui/LegalModal";
import "../globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({ 
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  
  // Wait for i18n
  const t = await getTranslations({ locale, namespace: "metadata" });

  const title = t("title");
  const description = t("description");
  const keywords = t("keywords");
  const url = "https://tools.hoglet.xyz";
  const twitterHandle = "@hoglet_DAO";

  return {
    title,
    description,
    keywords,
    authors: [{ name: "Hoglet DAO" }],
    openGraph: {
      title,
      description,
      url,
      siteName: title,
      images: [
        {
          url: "/og-image.jpg",
          width: 1200,
          height: 630,
          alt: "Supra Interact Preview",
        },
      ],
      locale,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og-image.jpg"],
      creator: twitterHandle,
    },
    icons: {
      icon: "/hoglet.webp",
    },
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <html lang={locale} className={`${inter.variable} ${jetbrainsMono.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[#0B0D17] text-white">
        <NextIntlClientProvider messages={messages}>
          <NetworkProvider>
            <SupraWalletProvider>
              <LegalModal />
              {children}
              <footer className="mt-auto py-6 text-center text-[11px] text-zinc-500">
                Hoglet Tools is a non-custodial infrastructure. Provided As-Is without warranties. <a href="https://github.com/SNABUR/tools-hoglet-cloudflare/blob/main/DISCLAIMER.md" target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-300 transition-colors">Read our Open-Source Terms</a>.
              </footer>
            </SupraWalletProvider>
          </NetworkProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
