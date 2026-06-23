"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";

interface ModuleData {
  id?: string;
  name: string;
  creator?: string;
  contributor: string;
  description: string;
  category: string;
  address: string;
  module: string;
  githubRepo?: string;
  verified?: boolean;
}

const LOCAL_JSON_URL = "/modules.json";

export default function Marketplace({ onUseModule }: { onUseModule: (module: ModuleData) => void }) {
  const t = useTranslations("Dashboard");
  const [modules, setModules] = useState<ModuleData[]>([]);
  const [filteredModules, setFilteredModules] = useState<ModuleData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [category, setCategory] = useState("all");

  useEffect(() => {
    async function fetchModules() {
      try {
        const res = await fetch(LOCAL_JSON_URL, { cache: 'no-cache' });
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();
        if (data && data.modules) {
          setModules(data.modules);
          setFilteredModules(data.modules);
        }
      } catch (err) {
        console.error("Failed to load modules:", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchModules();
  }, []);

  useEffect(() => {
    const lowerSearch = searchTerm.toLowerCase();
    const filtered = modules.filter(m => {
      const matchesSearch = m.name.toLowerCase().includes(lowerSearch) || m.description.toLowerCase().includes(lowerSearch);
      const matchesCategory = category === "all" || m.category === category;
      return matchesSearch && matchesCategory;
    });
    setFilteredModules(filtered);
  }, [searchTerm, category, modules]);

  return (
    <div className="p-6 max-w-7xl mx-auto flex-1">
      <h2 className="text-3xl font-bold mb-6">{t("marketplace")}</h2>
      
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-8">
        <input 
          type="text" 
          placeholder="Search modules..." 
          className="flex-1 bg-[#121526] border border-gray-800 rounded-lg px-4 py-2 text-white"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <select 
          className="bg-[#121526] border border-gray-800 rounded-lg px-4 py-2 text-white"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="all">All Categories</option>
          <option value="DeFi">DeFi</option>
          <option value="NFT">NFT</option>
          <option value="Gaming">Gaming</option>
          <option value="Utility">Utility</option>
        </select>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Loading modules...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredModules.map((mod, idx) => (
            <div key={idx} className="bg-[#121526] p-6 rounded-xl border border-gray-800 shadow-lg flex flex-col h-full">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-bold">{mod.name} {mod.verified && <span className="text-green-500">✓</span>}</h3>
                <span className="text-xs bg-gray-800 px-2 py-1 rounded-full">{mod.category}</span>
              </div>
              <p className="text-gray-400 text-sm mb-6 flex-1">{mod.description}</p>
              
              <div className="space-y-2 mb-6 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Module:</span>
                  <span className="text-gray-300">{mod.module}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Address:</span>
                  <span className="text-gray-300" title={mod.address}>
                    {mod.address.slice(0, 6)}...{mod.address.slice(-4)}
                  </span>
                </div>
              </div>
              
              <div className="flex gap-2 mt-auto">
                <button 
                  className="flex-1 bg-[#DD1438] hover:bg-[#B0102C] text-white py-2 rounded-lg font-semibold transition-colors"
                  onClick={() => onUseModule(mod)}
                >
                  ⚡ Use
                </button>
                {mod.githubRepo && (
                  <button 
                    className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-2 rounded-lg font-semibold transition-colors"
                    onClick={() => window.open(mod.githubRepo, "_blank")}
                  >
                    Code
                  </button>
                )}
              </div>
            </div>
          ))}
          {filteredModules.length === 0 && (
             <div className="col-span-full text-center py-12 text-gray-400">No modules found</div>
          )}
        </div>
      )}
    </div>
  );
}
