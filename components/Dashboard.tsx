"use client";

import { useTranslations } from "next-intl";
import { useState, useEffect } from "react";
import { useSupraWallet } from "@/context/SupraWalletContext";

export default function Dashboard({ setActiveSection }: { setActiveSection: (s: string) => void }) {
  const t = useTranslations("Dashboard");
  const { rpcUrl } = useSupraWallet();
  const [networkStatus, setNetworkStatus] = useState("Checking...");
  const [timeToNext, setTimeToNext] = useState("...");
  const [estimatedFee, setEstimatedFee] = useState("...");
  
  useEffect(() => {
    let nextEpochTime: number | null = null;
    let countdownInterval: any;

    const fetchEpochData = async () => {
      try {
        const isMainnet = rpcUrl.includes("mainnet");
        const proxyPathV2 = isMainnet ? "/api/rpc-v2/mainnet" : "/api/rpc-v2/testnet";

        const response = await fetch(`${proxyPathV2}/accounts/1/resources/0x1%3A%3Areconfiguration%3A%3AConfiguration`);
        const data = await response.json();
        if (data.data) {
          const lastReconfig = parseInt(data.data.last_reconfiguration_time);
          const epochInterval = 7200;
          nextEpochTime = Math.floor(lastReconfig / 1000000) + epochInterval;
          setNetworkStatus("Connected");
        }
      } catch (e) {
        setNetworkStatus("Error");
      }
    };

    const fetchFee = async () => {
      try {
        const isMainnet = rpcUrl.includes("mainnet");
        const proxyPathV2 = isMainnet ? "/api/rpc-v2/mainnet" : "/api/rpc-v2/testnet";

        const response = await fetch(`${proxyPathV2}/view`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            function: "0x1::automation_registry::estimate_automation_fee",
            type_arguments: [],
            arguments: ["5000"]
          })
        });
        const data = await response.json();
        if (data.result && data.result[0]) {
          setEstimatedFee((parseInt(data.result[0]) / 1000000).toFixed(2));
        }
      } catch (e) {
        setEstimatedFee("Error");
      }
    };

    const updateCountdown = () => {
      if (!nextEpochTime) return;
      const now = Math.floor(Date.now() / 1000);
      const timeLeft = Math.max(0, nextEpochTime - now);
      
      if (timeLeft <= 0) {
        setTimeToNext("Epoch ended");
        fetchEpochData();
      } else {
        const h = Math.floor(timeLeft / 3600);
        const m = Math.floor((timeLeft % 3600) / 60);
        const s = timeLeft % 60;
        setTimeToNext(h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`);
      }
    };

    fetchEpochData();
    fetchFee();
    
    countdownInterval = setInterval(updateCountdown, 1000);
    const updateInterval = setInterval(() => {
      fetchEpochData();
      fetchFee();
    }, 15000);

    return () => {
      clearInterval(countdownInterval);
      clearInterval(updateInterval);
    };
  }, [rpcUrl]);

  return (
    <section id="dashboardSection" className="content-section active p-4 sm:p-6 max-w-7xl mx-auto flex-1">
      {/* Network Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-[#121526] p-6 rounded-xl border border-gray-800 shadow-lg">
          <div className="flex items-center gap-3 mb-4 text-gray-400 font-medium">
            <span className="text-xl">🌐</span>
            <span>{t("networkStatus")}</span>
          </div>
          <div className={`text-2xl font-bold ${networkStatus === 'Connected' ? 'text-green-500' : 'text-red-500'}`} id="networkStatus">
            {networkStatus}
          </div>
        </div>
        
        <div className="bg-[#121526] p-6 rounded-xl border border-gray-800 shadow-lg">
          <div className="flex items-center gap-3 mb-4 text-gray-400 font-medium">
            <span className="text-xl">⏱️</span>
            <span>{t("nextEpochIn")}</span>
          </div>
          <div className="text-2xl font-bold" id="timeToNext">
            {timeToNext}
          </div>
        </div>
        
        <div className="bg-[#121526] p-6 rounded-xl border border-gray-800 shadow-lg">
          <div className="flex items-center gap-3 mb-4 text-gray-400 font-medium">
            <span className="text-xl">💰</span>
            <span>{t("automationFee")}</span>
          </div>
          <div className="text-2xl font-bold" id="estimatedFee">
            {estimatedFee} SUPRA
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-col sm:flex-row gap-4 mt-8">
        <button 
          className="flex-1 bg-[#DD1438] hover:bg-[#B0102C] text-white py-3 px-6 rounded-xl font-semibold transition-colors shadow-[0_0_15px_rgba(221,20,56,0.3)]"
          onClick={() => setActiveSection('automation')}
        >
          {t("createTask")}
        </button>
        <button 
          className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-3 px-6 rounded-xl font-semibold transition-colors"
          onClick={() => setActiveSection('marketplace')}
        >
          {t("marketplace")}
        </button>
        <button 
          className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-3 px-6 rounded-xl font-semibold transition-colors"
          onClick={() => setActiveSection('tasks')}
        >
          {t("myTasks")}
        </button>
      </div>
    </section>
  );
}
