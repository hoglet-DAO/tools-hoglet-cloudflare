"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

export default function Sidebar({ activeSection, setActiveSection }: { activeSection: string, setActiveSection: (s: string) => void }) {
  const t = useTranslations("Dashboard");
  const [isOpen, setIsOpen] = useState(false);

  return (
    <aside className={`sidebar ${isOpen ? "open" : ""}`}>
      <div className="sidebar-header flex justify-between items-center p-4">
        <div className="flex items-center gap-3 px-2 text-white">
          <div className="logo-icon w-8 h-8 rounded-full bg-gradient-to-r from-red-500 to-pink-500 shadow-[0_0_15px_rgba(255,0,0,0.5)]"></div>
          <span className="logo-text font-bold text-xl">Supra Interact</span>
        </div>
        <button className="btn-icon-only md:hidden" onClick={() => setIsOpen(!isOpen)}>
          <span>☰</span>
        </button>
      </div>

      <nav className="sidebar-nav flex flex-col gap-2 p-4">
        {[
          /* { id: "dashboard", icon: "☯", label: t("getStarted") }, */
          { id: "automation", icon: "🖱", label: "Contract Explorer" },
          /* { id: "marketplace", icon: "☰", label: t("marketplace") },
          { id: "tasks", icon: "𖣐", label: t("myTasks") }, */
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveSection(item.id)}
            className={`nav-item flex items-center gap-3 p-3 rounded-lg transition-colors ${
              activeSection === item.id ? "bg-[#DD1438] text-white" : "text-gray-400 hover:bg-gray-800 hover:text-white"
            }`}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Hidden docs and support footer
      <div className="sidebar-footer mt-auto p-4 border-t border-gray-800 flex flex-col gap-2">
        <Link href="https://docs.supra.com/automation" target="_blank" className="footer-link flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
          <span className="footer-icon">📚</span>
          <span>Documentation</span>
        </Link>
        <Link href="https://discord.gg/supralabs" target="_blank" className="footer-link flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
          <span className="footer-icon">💬</span>
          <span>Support</span>
        </Link>
      </div>
      */}
    </aside>
  );
}
