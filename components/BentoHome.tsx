"use client";

import { motion } from "framer-motion";
import { ArrowRight, Code2, Search, Zap, Blocks, Coins } from "lucide-react";
import { useSupraWallet } from "@/context/SupraWalletContext";
import { useRouter } from "@/i18n/navigation";

export default function BentoHome() {
  const { rpcUrl } = useSupraWallet();
  const isMainnet = rpcUrl?.includes("mainnet");
  const router = useRouter();

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 pt-8">
      {/* Header Section */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-12 flex flex-col items-center text-center"
      >
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 mb-6 backdrop-blur-md">
          <span className={`w-2 h-2 rounded-full ${isMainnet ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-amber-500 shadow-[0_0_8px_#f59e0b]'}`}></span>
          <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">{isMainnet ? 'Supra Mainnet' : 'Supra Testnet'}</span>
        </div>
        <h1 className="text-3xl sm:text-4xl md:text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white via-gray-200 to-gray-500 mb-4 tracking-tight px-4">
          Tools Hoglet Suite
        </h1>
        <p className="text-gray-400 text-sm sm:text-lg max-w-2xl px-4">
          The ultimate multi-tool platform for exploring and interacting with the Supra Blockchain ecosystem.
        </p>
      </motion.div>

      {/* Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 auto-rows-[300px]">
        
        {/* Interactor Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          onClick={() => router.push("/interactor")}
          className="group relative rounded-3xl bg-zinc-900/40 border border-white/10 overflow-hidden cursor-pointer hover:border-amm-pink/50 transition-all duration-500 hover:shadow-[0_0_30px_rgba(255,42,133,0.15)] flex flex-col justify-between"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-amm-pink/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
          
          <div className="p-6 sm:p-8 relative z-10">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-amm-red to-amm-pink flex items-center justify-center mb-4 sm:mb-6 shadow-lg shadow-amm-pink/20">
              <Code2 className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2 sm:mb-3">Smart Contract Interactor</h2>
            <p className="text-sm sm:text-base text-gray-400 font-medium">Read state and write transactions directly to any deployed module.</p>
          </div>

          <div className="p-6 sm:p-8 relative z-10 flex justify-end">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-amm-pink group-hover:text-white transition-all duration-300 group-hover:scale-110">
              <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 group-hover:text-white transition-colors" />
            </div>
          </div>
        </motion.div>

        {/* Inspector Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          onClick={() => router.push("/inspector")}
          className="group relative rounded-3xl bg-zinc-900/40 border border-white/10 overflow-hidden cursor-pointer hover:border-cyan-500/50 transition-all duration-500 hover:shadow-[0_0_30px_rgba(34,211,238,0.15)] flex flex-col justify-between"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
          
          <div className="p-6 sm:p-8 relative z-10">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center mb-4 sm:mb-6 shadow-lg shadow-cyan-500/20">
              <Coins className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2 sm:mb-3">Token & Asset Inspector</h2>
            <p className="text-sm sm:text-base text-gray-400 font-medium">Manage Token metadata, Mint/Burn Refs, and Supply directly.</p>
          </div>

          <div className="p-6 sm:p-8 relative z-10 flex justify-end">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-cyan-500 group-hover:text-white transition-all duration-300 group-hover:scale-110">
              <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 group-hover:text-white transition-colors" />
            </div>
          </div>
        </motion.div>

        {/* Utilities Card (Coming Soon) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="md:col-span-2 rounded-3xl bg-black/40 border border-white/5 overflow-hidden flex flex-col md:flex-row items-center p-6 sm:p-8 gap-4 sm:gap-8 relative text-center md:text-left"
        >
          <div className="flex-1">
            <div className="flex items-center justify-center md:justify-start gap-3 mb-3">
              <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500" />
              <h3 className="text-lg sm:text-xl font-bold text-white">More Tools Coming Soon</h3>
            </div>
            <p className="text-xs sm:text-sm text-gray-500">We are continuously expanding the Hoglet Suite. Faucet, Data Indexers, and ABI code generators are on the roadmap.</p>
          </div>
          
          <div className="shrink-0 flex gap-4 opacity-30 pointer-events-none mt-2 md:mt-0">
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <Blocks className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
