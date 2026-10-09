"use client";

import { Home, Code2, Search, Menu, X, Coins, ShieldCheck, KeyRound } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, usePathname } from "@/i18n/navigation";

export default function Sidebar() {
  const [isExpanded, setIsExpanded] = useState(false);
  const pathname = usePathname();

  const menuItems = [
    { id: "home", href: "/", icon: Home, label: "Dashboard", color: "text-white" },
    { id: "interactor", href: "/interactor", icon: Code2, label: "Interactor", color: "text-amm-pink" },
    { id: "inspector", href: "/inspector", icon: Coins, label: "Asset Inspector", color: "text-cyan-400" },
    // Governance and Account Control are separate entries because they do different things with
    // different risk: one governs modules the factory owns, the other acts on an account the
    // visitor owns, and only the second one can do something irreversible.
    { id: "governance", href: "/governance", icon: ShieldCheck, label: "Contract Governance", color: "text-emerald-400" },
    { id: "account-control", href: "/account-control", icon: KeyRound, label: "Account Control", color: "text-rose-400" },
  ];

  return (
    <>
      {/* Desktop Sidebar */}
      <motion.aside 
        initial={{ width: 80 }}
        animate={{ width: isExpanded ? 240 : 80 }}
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
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>

                {/* Tooltip for collapsed state */}
                {!isExpanded && (
                  <div className="absolute left-full ml-4 px-3 py-2 bg-zinc-900 border border-white/10 text-white text-sm font-bold rounded-lg opacity-0 pointer-events-none group-hover:opacity-100 group-hover:translate-x-2 transition-all duration-300 z-50 whitespace-nowrap">
                    {item.label}
                  </div>
                )}
              </Link>
            );
          })}
        </nav>
      </motion.aside>

      {/* Mobile Bottom Navigation */}
      <nav className="flex sm:hidden fixed bottom-0 left-0 right-0 h-16 bg-zinc-950/95 backdrop-blur-md border-t border-white/10 z-50 justify-around items-center px-2 pb-safe">
        {menuItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.id}
              href={item.href}
              className={`flex flex-col items-center justify-center w-full h-full gap-1 transition-colors ${
                isActive ? item.color : "text-gray-500 hover:text-gray-300"
              }`}
            >
              <item.icon className={`w-5 h-5 ${isActive ? "scale-110" : ""}`} />
              <span className="text-[10px] font-bold">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
