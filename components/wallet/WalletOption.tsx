// src/components/wallet/WalletOption.tsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, ExternalLink } from 'lucide-react';
import { WALLET_INFO } from './wallet-constants';
import { WalletType } from '@/utils/types';

interface WalletOptionProps {
  type: WalletType; 
  isInstalled: boolean; 
  isRecent: boolean; 
  isLoading: boolean; 
  isMobile?: boolean;
  onSelect: () => void; 
}

export const WalletOption: React.FC<WalletOptionProps> = ({ 
  type, 
  isInstalled, 
  isRecent, 
  isLoading, 
  isMobile,
  onSelect 
}) => {
  const info = WALLET_INFO[type];
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.button
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onSelect}
      disabled={isLoading}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`
        w-full px-4 py-3 rounded-2xl border transition-all duration-300 flex items-center gap-4 group relative overflow-hidden
        ${isInstalled 
          ? 'border-gray-800 bg-gray-950/40 hover:bg-gray-900/60 hover:border-gray-700' 
          : 'border-gray-900 bg-gray-950/20 opacity-75 hover:opacity-100'}
      `}
    >
      <div className="relative z-10 flex-shrink-0 w-10 h-10 rounded-full overflow-hidden border border-gray-800 shadow-sm">
        <img src={info.icon} alt={info.name} className="w-full h-full object-cover" />
      </div>

      <div className="flex-1 text-left z-10">
        <h3 className="font-medium text-white text-base">{info.name}</h3>
        {!isInstalled && (
          <p className="text-xs text-gray-500 mt-0.5">
            {isMobile && type === 'starkey' ? "Open App" : "Not installed"}
          </p>
        )}
      </div>

      <div className="flex-shrink-0 z-10">
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-brand-light" />
        ) : isRecent && isInstalled ? (
          <span className="bg-brand-dark/50 text-brand-light text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full border border-brand-light/20">
            Recent
          </span>
        ) : isInstalled ? (
          <motion.div
            animate={{ x: isHovered ? 0 : -5, opacity: isHovered ? 1 : 0 }}
            className="text-brand-light/80 text-sm font-medium"
          >
            Connect
          </motion.div>
        ) : (
          <ExternalLink className="h-4 w-4 text-gray-600" />
        )}
      </div>
    </motion.button>
  );
};
