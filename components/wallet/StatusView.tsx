// src/components/wallet/StatusView.tsx
import React from 'react';
import { motion } from 'framer-motion';
import { Loader2, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import { WALLET_INFO } from './wallet-constants';

// --- Types ---
type ConnectionStage = 'idle' | 'connecting' | 'signing' | 'success' | 'error' | 'connected-not-signed';
type WalletType = keyof typeof WALLET_INFO;

interface StatusViewProps { 
  stage: ConnectionStage; 
  walletType: WalletType | null;
  error?: string 
}

export const StatusView: React.FC<StatusViewProps> = ({ 
  stage, 
  walletType,
  error 
}) => {
  const info = walletType ? WALLET_INFO[walletType] : null;

  const config = {
    connecting: {
      title: `Connecting to ${info?.name}`,
      desc: 'Please confirm the connection in your wallet extension.',
      color: 'border-blue-500/50',
      icon: <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
    },
    signing: {
      title: 'Verify Ownership',
      desc: 'Please sign the message to authenticate securely.',
      color: 'border-purple-500/50',
      icon: <div className="relative">
        <Loader2 className="w-10 h-10 text-purple-400 animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white">SIG</div>
      </div>
    },
    success: {
      title: 'Connected Successfully',
      desc: 'Welcome back!',
      color: 'border-green-500',
      icon: <CheckCircle2 className="w-10 h-10 text-green-400" />
    },
    error: {
      title: 'Connection Failed',
      desc: error || 'Something went wrong. Please try again.',
      color: 'border-red-500',
      icon: <X className="w-10 h-10 text-red-400" />
    },
    'connected-not-signed': {
        title: 'Partially Connected',
        desc: 'Wallet connected but authentication was skipped.',
        color: 'border-yellow-500',
        icon: <AlertCircle className="w-10 h-10 text-yellow-400" />
    },
    idle: { title: '', desc: '', color: '', icon: null }
  };

  const current = config[stage];

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center py-10 text-center space-y-6"
    >
      <div className={`relative w-24 h-24 rounded-full border-4 ${current.color} bg-gray-900/50 flex items-center justify-center shadow-2xl`}>
        {info && (
          <img 
            src={info.icon} 
            alt={info.name} 
            className="absolute inset-0 w-full h-full object-cover opacity-20 rounded-full grayscale" 
          />
        )}
        <div className="z-10">{current.icon}</div>
      </div>
      
      <div className="space-y-2 max-w-[80%]">
        <h3 className="text-xl font-semibold text-white">{current.title}</h3>
        <p className="text-sm text-gray-400 leading-relaxed">{current.desc}</p>
      </div>
    </motion.div>
  );
};
