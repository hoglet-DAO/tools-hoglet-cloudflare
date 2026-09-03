import { motion } from "framer-motion";
import { ShieldAlert, ExternalLink, Copy, Check, ArrowRight } from "lucide-react";
import { TechnicalIdentifierBlock } from "./TechnicalIdentifierBlock";

interface TokenInfo {
  type: string;
  name: string;
  symbol: string;
  decimals: number;
  supply?: string;
  isLegacy: boolean;
}

interface CapabilityCardProps {
  cap: {
    resourcePath: string;
    capabilities: { [key: string]: boolean };
    faAddress?: string;
  };
  matchedToken: TokenInfo | undefined;
  getExplorerLink: (typeString: string) => string;
  shortenType: (typeStr: string) => string;
  copiedType: string | null;
  handleCopy: (e: React.MouseEvent, text: string) => void;
  handleGoToInteractor: (resourcePath: string) => void;
}

export const CapabilityCard = ({
  cap,
  matchedToken,
  getExplorerLink,
  shortenType,
  copiedType,
  handleCopy,
  handleGoToInteractor
}: CapabilityCardProps) => {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-zinc-900/50 border border-amm-pink/20 rounded-2xl p-6 relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 w-32 h-32 bg-amm-pink/5 rounded-bl-full -mr-16 -mt-16 pointer-events-none"></div>
      <div className="mb-4">
        <h3 className="text-lg font-bold text-white mb-2">
          {matchedToken ? `Powers for ${matchedToken.name} (${matchedToken.symbol})` : "Capabilities Detected"}
        </h3>
        {matchedToken && (
          <div className="flex flex-wrap items-center gap-2">
            <a 
              href={getExplorerLink(matchedToken.type)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex flex-wrap items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 hover:border-cyan-500/40 text-xs text-cyan-400 font-mono transition-colors group/type max-w-full break-words" 
              title={matchedToken.type}
            >
              <span className="text-cyan-500/50">Type:</span> 
              <span className="break-all">{shortenType(matchedToken.type)}</span>
              <ExternalLink className="w-3 h-3 opacity-50 group-hover/type:opacity-100 flex-shrink-0 mt-0.5" />
            </a>
            <button 
              onClick={(e) => handleCopy(e, matchedToken.type)}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white transition-colors"
              title="Copy full Type"
            >
              {copiedType === matchedToken.type ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        )}
      </div>
      <div className="mb-6">
        <h4 className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-3">Technical Identifier</h4>
        <TechnicalIdentifierBlock 
          typeString={cap.resourcePath} 
          getExplorerLink={getExplorerLink} 
          shortenType={shortenType} 
          copiedType={copiedType} 
          handleCopy={handleCopy} 
        />
      </div>
      
      <div className="flex flex-col gap-3">
        {Object.entries(cap.capabilities).map(([key, value]) => {
          if (!value) return null;
          const getIconAndColor = (k: string) => {
            if (k === 'mint') return { icon: "🟢", color: "border-green-500/30 bg-green-500/10 text-green-400", desc: "Can create infinite new tokens out of thin air (High Inflation Risk)." };
            if (k === 'burn') return { icon: "🔥", color: "border-orange-500/30 bg-orange-500/10 text-orange-400", desc: "Can destroy tokens directly from users' wallets without permission." };
            if (k === 'freeze') return { icon: "❄️", color: "border-blue-500/30 bg-blue-500/10 text-blue-400", desc: "Can freeze accounts, preventing users from selling or transferring." };
            return { icon: "🔄", color: "border-purple-500/30 bg-purple-500/10 text-purple-400", desc: "Can forcefully move tokens between users' accounts." };
          };
          const style = getIconAndColor(key);
          return (
            <div key={key} className={`flex items-start gap-3 p-3 rounded-xl border ${style.color}`}>
              <span className="text-xl mt-0.5 leading-none">{style.icon}</span>
              <div className="flex flex-col">
                <span className="font-bold capitalize text-sm">{key} Ref</span>
                <span className="text-xs opacity-80 mt-1 leading-relaxed">{style.desc}</span>
              </div>
            </div>
          );
        })}
      </div>
      
      {(() => {
        const activePowers = Object.entries(cap.capabilities)
          .filter(([_, value]) => value)
          .map(([key]) => key.toUpperCase());
        
        if (activePowers.length > 0) {
          const tokenNameDisplay = matchedToken 
            ? `${matchedToken.name} (${matchedToken.symbol})` 
            : (cap.resourcePath.includes('<') ? cap.resourcePath.split('<')[1].replace('>', '') : 'specified above');

          const isFrameworkComponent = cap.resourcePath.startsWith("0x1::") || cap.resourcePath.startsWith("0x2::") || cap.resourcePath.startsWith("0x3::");

          if (isFrameworkComponent) {
            return (
              <div className="mt-5 p-4 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-blue-400 mb-1">FRAMEWORK COMPONENT</p>
                  <p className="text-xs text-blue-200/80 leading-relaxed">
                    This capability for <strong className="text-blue-300 break-all">{tokenNameDisplay}</strong> is currently held by the official blockchain framework (<code>{cap.resourcePath.split("::")[0]}</code>). Because it is inside an immutable framework vault and not a user's wallet, it is generally considered <strong>safe and renounced</strong> from human manipulation.
                  </p>
                </div>
              </div>
            );
          }

          return (
            <div className="mt-5 p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-red-400 mb-1">CRITICAL WARNING</p>
                <p className="text-xs text-red-200/80 leading-relaxed">
                  The owner of this address has active capabilities to <strong>{activePowers.join(", ")}</strong> the token <strong className="text-red-300 break-all">{tokenNameDisplay}</strong>. This token is NOT renounced. They can manipulate the supply and control user assets at any time. Exercise extreme caution.
                </p>
              </div>
            </div>
          );
        }
        return null;
      })()}
      
      <button 
        onClick={() => handleGoToInteractor(cap.resourcePath)}
        className="mt-6 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-amm-pink hover:bg-amm-red text-white font-bold transition-colors cursor-pointer"
      >
        Go to Interactor <ArrowRight className="w-4 h-4" />
      </button>
    </motion.div>
  );
};
