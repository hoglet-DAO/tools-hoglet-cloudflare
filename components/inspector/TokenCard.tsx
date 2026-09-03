import { motion } from "framer-motion";
import { ShieldCheck, Copy, Check, Search } from "lucide-react";
import { TechnicalIdentifierBlock } from "./TechnicalIdentifierBlock";

interface TokenInfo {
  type: string;
  name: string;
  symbol: string;
  decimals: number;
  supply?: string;
  isLegacy: boolean;
  creator?: string;
  isWrapper?: boolean;
  wrappedLegacyCoin?: string;
}

interface TokenCardProps {
  token: TokenInfo;
  getExplorerLink: (typeString: string, forcedType?: "address" | "fa" | "coin") => string;
  shortenType: (typeStr: string) => string;
  copiedType: string | null;
  handleCopy: (e: React.MouseEvent, text: string) => void;
  isFullyRenounced?: boolean;
  onInspect?: (address: string) => void;
}

export const TokenCard = ({ 
  token, 
  getExplorerLink, 
  shortenType, 
  copiedType, 
  handleCopy,
  isFullyRenounced = false,
  onInspect
}: TokenCardProps) => {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`bg-zinc-900/50 border ${isFullyRenounced ? 'border-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.1)]' : 'border-white/10'} rounded-2xl p-6 relative overflow-hidden`}
    >
      {isFullyRenounced && (
        <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 rounded-bl-full -mr-16 -mt-16 pointer-events-none"></div>
      )}
      <div className="flex flex-col sm:flex-row sm:justify-between items-start gap-3 mb-4 relative z-10">
        <div>
          <h3 className="text-xl sm:text-2xl font-bold text-white break-words max-w-full">{token.name}</h3>
          <p className="text-cyan-400 font-mono text-xs sm:text-sm">{token.symbol}</p>
        </div>
        <span className="px-3 py-1 rounded-full bg-white/5 text-[10px] sm:text-xs text-gray-300 border border-white/10 whitespace-nowrap">
          {token.isLegacy ? "Legacy Coin" : "Fungible Asset"}
        </span>
      </div>
      
      {isFullyRenounced && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.9, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.5, type: "spring" }}
          className="mb-4 relative z-10 overflow-hidden rounded-xl border border-green-400/40 p-3 sm:p-4 group"
        >
          {/* Animated glowing background */}
          <div className="absolute inset-0 bg-gradient-to-r from-green-500/10 via-emerald-400/5 to-green-500/10" />
          <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(74,222,128,0.1)_50%,transparent_75%)] bg-[length:250%_250%] animate-[shimmer_3s_infinite_linear]" />
          <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/20 rounded-bl-full -mr-16 -mt-16 blur-2xl pointer-events-none group-hover:bg-green-500/30 transition-colors duration-500" />
          
          <div className="flex items-start gap-3 relative z-10">
            <div className="relative">
              <div className="absolute inset-0 bg-green-400 blur-md opacity-40 animate-pulse" />
              <ShieldCheck className="w-6 h-6 sm:w-7 sm:h-7 text-green-400 relative z-10" />
            </div>
            <div>
              <p className="text-xs sm:text-sm font-bold text-green-400 uppercase tracking-widest mb-1 flex items-center gap-2">
                100% Verified Safe
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
              </p>
              <p className="text-[10px] sm:text-xs text-green-100/90 leading-relaxed font-medium">
                All administrative powers (Mint, Burn, Transfer) are explicitly destroyed. <strong className="text-white bg-green-500/20 px-1 rounded">This badge is the ONLY way to know a token is 100% safe from manipulation</strong>, a mathematical guarantee unique to the Fungible Asset design.
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {!token.isLegacy && (token.isWrapper || (token.creator && (token.creator === "0x1" || token.creator === "0x0000000000000000000000000000000000000000000000000000000000000001"))) && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 relative z-10 overflow-hidden rounded-xl border border-orange-500/40 bg-orange-500/10 p-4"
        >
          <div className="flex flex-col gap-3">
            <p className="text-sm font-bold text-orange-400 uppercase tracking-widest flex items-center gap-2">
              ⚠️ Framework-Generated Wrapper
            </p>
            <p className="text-xs text-orange-200/90 leading-relaxed">
              This Fungible Asset was generated internally by the core blockchain framework (<code>0x1</code>). <strong>It is highly likely to be a wrapper for a Legacy Coin</strong> or a native gas token. Its true Mint/Burn capabilities might be hidden on the original Legacy Coin architecture. Auditing this object alone is insufficient to guarantee safety.
            </p>
            
            {token.wrappedLegacyCoin && (
              <div className="mt-2 p-3 bg-orange-950/50 rounded-lg border border-orange-500/20">
                <p className="text-[10px] text-orange-300/70 font-bold uppercase mb-2">Original Legacy Coin Detected:</p>
                <div className="flex items-center justify-between gap-2 bg-black/40 p-2 rounded-md border border-orange-500/10">
                  <span className="text-xs font-mono text-orange-200 truncate">{shortenType(token.wrappedLegacyCoin)}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <button 
                      onClick={(e) => handleCopy(e, token.wrappedLegacyCoin!)}
                      className="p-1.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 rounded transition-colors"
                      title="Copy Address"
                    >
                      {copiedType === token.wrappedLegacyCoin ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                    {onInspect && (
                      <button 
                        onClick={(e) => {
                          e.preventDefault();
                          onInspect(token.wrappedLegacyCoin!);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-black rounded transition-colors text-xs font-bold"
                      >
                        <Search className="w-3 h-3" /> Inspect
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
      
      <div className="grid grid-cols-2 gap-3 mb-4 relative z-10">
        <div className="bg-white/5 border border-white/5 p-3 rounded-xl flex flex-col justify-center">
          <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Decimals</span>
          <span className="text-white font-mono text-base sm:text-lg">{token.decimals}</span>
        </div>
        {token.supply && (
          <div className="bg-white/5 border border-white/5 p-3 rounded-xl flex flex-col justify-center min-w-0 overflow-hidden">
            <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">Raw Supply</span>
            <span 
              className="text-white font-mono text-base sm:text-lg truncate" 
              title={token.supply}
            >
              {token.supply}
            </span>
          </div>
        )}
      </div>
      
      <div className="pt-2 border-t border-white/10 relative z-10">
        <h4 className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-3">Technical Identifier</h4>
        <TechnicalIdentifierBlock 
          typeString={token.type} 
          getExplorerLink={getExplorerLink} 
          shortenType={shortenType} 
          copiedType={copiedType} 
          handleCopy={handleCopy} 
        />
      </div>
    </motion.div>
  );
};
