"use client";

import { Home, Code2, Search, Menu, X, Coins, ShieldCheck, KeyRound, Boxes, BookOpen, ArrowUpRight, Terminal } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { VAULT_STANDARD_DOCS_URL } from "@/config/links";

export default function Sidebar() {
  const [isExpanded, setIsExpanded] = useState(false);
  const pathname = usePathname();
  const t = useTranslations("Nav");

  const menuItems = [
    { id: "home", href: "/", icon: Home, key: "navHome", color: "text-white" },
    { id: "interactor", href: "/interactor", icon: Code2, key: "navInteractor", color: "text-amm-pink" },
    { id: "inspector", href: "/inspector", icon: Coins, key: "navInspector", color: "text-cyan-400" },
    // The vault is its own destination because it does a different thing with a different risk than
    // Account Control: it governs modules the vault owns, and the actions it offers are irreversible
    // in one path.
    { id: "deploy", href: "/deploy", icon: ShieldCheck, key: "navVault", color: "text-emerald-400" },
    { id: "scripts", href: "/scripts", icon: Terminal, key: "navScripts", color: "text-purple-400" },
    { id: "my-contracts", href: "/my-contracts", icon: Boxes, key: "navMyContracts", color: "text-cyan-400" },
    { id: "account-control", href: "/account-control", icon: KeyRound, key: "navAccountControl", color: "text-rose-400" },
  ];

  return (
    <>
      {/* Desktop Sidebar */}
      {/* 272 rather than 240: at 240 the inner width left ~127px for the label, so every three-word
          name ("Asset Inspector", "Deploy Contract", "Account Control") and the standard below were
          clipped by their own overflow-hidden. The extra 32px is what a three-word label needs. */}
      <motion.aside 
        initial={{ width: 80 }}
        animate={{ width: isExpanded ? 272 : 80 }}
        className="hidden sm:flex bg-black border-r border-white/5 h-screen relative z-50 flex-col items-center py-6 transition-all duration-300"
      >
        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className="mb-12 p-3 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
        >
          {isExpanded ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>

        <nav className="flex flex-col gap-4 w-full px-4">
          {menuItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`group relative flex items-center p-3 rounded-2xl transition-all duration-300 ${
                  isActive 
                    ? "bg-white/10 shadow-[0_0_15px_rgba(255,255,255,0.05)]" 
                    : "hover:bg-white/5"
                }`}
              >
                <div className={`shrink-0 flex items-center justify-center w-10 h-10 rounded-xl transition-colors ${
                  isActive ? item.color : "text-gray-500 group-hover:text-gray-300"
                }`}>
                  <item.icon className="w-6 h-6" />
                </div>

                {/* Expanded Label */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.span
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: "auto" }}
                      exit={{ opacity: 0, width: 0 }}
                      className="ml-4 font-bold whitespace-nowrap overflow-hidden text-gray-300 group-hover:text-white"
                    >
                      {t(item.key)}
                    </motion.span>
                  )}
                </AnimatePresence>

                {/* Tooltip for collapsed state */}
                {!isExpanded && (
                  <div className="absolute left-full ml-4 px-3 py-2 bg-zinc-900 border border-white/10 text-white text-sm font-bold rounded-lg opacity-0 pointer-events-none group-hover:opacity-100 group-hover:translate-x-2 transition-all duration-300 z-50 whitespace-nowrap">
                    {t(item.key)}
                  </div>
                )}
              </Link>
            );
          })}
        </nav>

        {/*
          The standard, kept apart from the tools above and pinned to the bottom.

          Apart because it is not a route: it leaves the app for the docs site, and a seventh entry in the
          list would read as another tool. Pinned because it should be findable without ever being in the
          way of someone here to deploy.
        */}
        <div className="mt-auto w-full px-4">
          <a
            href={VAULT_STANDARD_DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative flex items-center rounded-2xl p-3 transition-all duration-300 hover:bg-white/5"
          >
            <div className="shrink-0 flex items-center justify-center w-10 h-10 rounded-xl text-gray-500 transition-colors group-hover:text-emerald-300">
              <BookOpen className="w-6 h-6" />
            </div>

            <AnimatePresence>
              {isExpanded && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  className="ml-4 flex items-center gap-1.5 font-bold whitespace-nowrap overflow-hidden text-gray-300 group-hover:text-white"
                >
                  {t("navStandard")}
                  <ArrowUpRight className="w-3.5 h-3.5 shrink-0 text-gray-500 group-hover:text-emerald-300" />
                </motion.span>
              )}
            </AnimatePresence>

            {!isExpanded && (
              <div className="absolute left-full ml-4 px-3 py-2 bg-zinc-900 border border-white/10 text-white text-sm font-bold rounded-lg opacity-0 pointer-events-none group-hover:opacity-100 group-hover:translate-x-2 transition-all duration-300 z-50 whitespace-nowrap">
                {t("navStandard")}
              </div>
            )}
          </a>
        </div>
      </motion.aside>
    </>
  );
}
