import { motion, AnimatePresence } from "framer-motion";
import { ShieldAlert, X, Coins, CheckCircle2, ExternalLink } from "lucide-react";

interface InfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InfoModal = ({ isOpen, onClose }: InfoModalProps) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-zinc-900 border border-white/10 rounded-2xl p-5 sm:p-8 max-w-2xl w-[95%] sm:w-full relative z-10 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar mx-2 sm:mx-0"
          >
            <button 
              onClick={onClose}
              className="absolute top-3 right-3 sm:top-4 sm:right-4 text-gray-500 hover:text-white bg-white/5 hover:bg-white/10 p-2 rounded-full transition-colors"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-5 sm:mb-6 flex items-start sm:items-center gap-3 pr-8">
              <ShieldAlert className="w-6 h-6 sm:w-7 sm:h-7 text-amm-pink flex-shrink-0 mt-0.5 sm:mt-0" /> 
              <span>Understanding Move Security</span>
            </h2>
            
            <div className="space-y-5 sm:space-y-6">
              
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white mb-2 flex items-start gap-2">
                  <span className="bg-cyan-500/20 text-cyan-400 w-6 h-6 rounded-full flex items-center justify-center text-xs sm:text-sm flex-shrink-0 mt-0.5">1</span> 
                  <span>The Master Keys (Refs & Capabilities)</span>
                </h3>
                <p className="text-gray-400 text-xs sm:text-sm leading-relaxed pl-8">
                  Terms like <code>MintRef</code>, <code>BurnRef</code>, or <code>FreezeRef</code> are the <strong>Master Keys</strong>. Whoever holds these keys has absolute power over the token—they can print infinite tokens out of thin air, destroy users' funds, or freeze accounts.
                </p>
              </div>
              
              <div className="bg-orange-500/5 border border-orange-500/20 p-4 sm:p-5 rounded-xl">
                <h3 className="text-base sm:text-lg font-bold text-orange-400 mb-2 flex items-start gap-2">
                  <Coins className="w-5 h-5 text-orange-400 mt-0.5" />
                  <span>Legacy Coins: The Hide-and-Seek Danger</span>
                </h3>
                <p className="text-orange-200/80 text-xs sm:text-sm leading-relaxed pl-8">
                  Legacy Coins are messy. Their Master Keys are scattered and can be hidden in <strong>any wallet or contract</strong> on the blockchain. If our Inspector tells you there are "No Admin Refs" in a wallet, it means <em>that specific wallet</em> is clean. <strong>HOWEVER</strong>, a malicious developer could have hidden them elsewhere. Scanning an address and finding nothing does NOT guarantee a Legacy Coin is 100% safe.
                </p>
              </div>
              
              <div className="bg-green-500/5 border border-green-500/20 p-4 sm:p-5 rounded-xl mt-4 sm:mt-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 rounded-bl-full -mr-16 -mt-16 pointer-events-none"></div>
                <h3 className="text-base sm:text-lg font-bold text-green-400 mb-2 flex items-start gap-2 relative z-10">
                  <CheckCircle2 className="w-5 h-5 text-green-400 mt-0.5" />
                  <span>Fungible Assets (FA): The Ultimate Proof</span>
                </h3>
                <p className="text-green-200/80 text-xs sm:text-sm leading-relaxed pl-8 relative z-10">
                  Fungible Assets (the modern standard) have a centralized Metadata Object. If a developer uses a secure framework to renounce the token, the Master Keys are forced to stay glued to the Metadata Object, but are mathematically destroyed (set to <code>Option::none</code>).
                  <br/><br/>
                  If our Inspector scans an FA and detects these destroyed keys, it will explicitly award a <strong>"✅ 100% Verified Safe"</strong> badge. This is absolute, mathematical proof that the token can never be minted, burned, or frozen again. <em>(Note: If an FA doesn't have this badge, it means the keys are missing and it carries the same Hide-and-Seek danger as a Legacy Coin).</em>
                </p>
              </div>
              
              <div className="pt-2 text-center">
                <a 
                  href="https://docs.hoglet.xyz/docs/products/inspector" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300 transition-colors bg-cyan-500/10 hover:bg-cyan-500/20 px-4 py-2 rounded-lg border border-cyan-500/20"
                >
                  Read full documentation <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
