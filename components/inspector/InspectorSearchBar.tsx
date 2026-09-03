import { motion } from "framer-motion";
import { Search, Loader2, Clock, Share2, Check } from "lucide-react";
import { useState } from "react";

interface InspectorSearchBarProps {
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  handleInspect: () => void;
  isScanning: boolean;
  recentSearches: string[];
  handleRecentClick: (query: string) => void;
}

export const InspectorSearchBar = ({
  searchQuery,
  setSearchQuery,
  handleInspect,
  isScanning,
  recentSearches,
  handleRecentClick,
}: InspectorSearchBarProps) => {
  const [copiedShare, setCopiedShare] = useState(false);

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedShare(true);
    setTimeout(() => setCopiedShare(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.1 }}
      className="relative group mb-8"
    >
      <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition duration-500 pointer-events-none"></div>
      <div className="relative z-10 flex items-center bg-zinc-900/80 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-sm pr-2 sm:pr-3">
        <div className="pl-6 pr-4">
          <Search className="w-5 h-5 sm:w-6 sm:h-6 text-zinc-500 group-focus-within:text-cyan-400 transition-colors" />
        </div>
        <input
          type="text"
          placeholder="Enter Token Address..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleInspect()}
          className="w-full bg-transparent py-4 sm:py-5 pl-2 text-sm sm:text-lg text-white placeholder-zinc-500 focus:outline-none"
        />
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleShare}
            className="p-1.5 sm:p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors flex items-center justify-center cursor-pointer"
            title="Share this token analysis URL"
          >
            {copiedShare ? <Check className="w-4 h-4 sm:w-5 sm:h-5 text-green-400" /> : <Share2 className="w-4 h-4 sm:w-5 sm:h-5" />}
          </button>
          <button 
            onClick={handleInspect}
            disabled={isScanning || !searchQuery}
            className="px-4 sm:px-6 py-1.5 sm:py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-black font-bold transition-colors flex items-center gap-2 cursor-pointer text-sm sm:text-base"
          >
            {isScanning ? <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" /> : "Inspect"}
          </button>
        </div>
      </div>
      
      {/* Recent Searches History */}
      {recentSearches.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center gap-2 mt-4 px-2 relative z-10"
        >
          <span className="text-xs text-gray-500 font-bold flex items-center gap-1 uppercase tracking-wider">
            <Clock className="w-3 h-3" /> Recent:
          </span>
          {recentSearches.map((recent, idx) => (
            <button
              key={idx}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                handleRecentClick(recent);
              }}
              className="text-xs text-gray-400 bg-white/5 hover:bg-white/10 hover:text-white border border-white/5 hover:border-white/20 rounded-full px-3 py-1 transition-all flex items-center gap-1 cursor-pointer"
              title={recent}
              disabled={isScanning}
            >
              {recent.length > 10 ? `${recent.slice(0, 6)}...${recent.slice(-4)}` : recent}
            </button>
          ))}
        </motion.div>
      )}
    </motion.div>
  );
};
