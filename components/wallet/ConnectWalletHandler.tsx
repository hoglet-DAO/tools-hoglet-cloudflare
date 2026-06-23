'use client';

import { useEffect, useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle } from 'lucide-react';
import logo from '@/public/main/icon.png';

// Import extracted components and constants
import { WALLET_INFO } from './wallet-constants';
import { WalletOption } from './WalletOption';
import { StatusView } from './StatusView';

// Import new hooks
import { useWalletConnectFlow } from '@/hooks/features/wallet/useWalletConnectFlow';
import { useWalletModalState } from '@/hooks/features/wallet/useWalletModalState'; // New hook import

export interface ConnectWalletHandlerProps {
  onConnect?: (account: string) => void;
  onDisconnect?: () => void;
  onClose?: () => void;
  isOpen: boolean;
  children?: (props: {
    isConnected: boolean;
    accounts: string[];
    loading: boolean;
    balance: string;
    userProfile: any; // Simplified for now, adjust based on actual UserProfile type
    handleConnect: () => void;
    handleDisconnect: () => void;
  }) => React.ReactNode;
}

// --- Main Component ---
export const ConnectWalletHandler: React.FC<ConnectWalletHandlerProps> = ({
  onConnect,
  onDisconnect,
  onClose,
  isOpen,
  children,
}) => {
  const {
    stage,
    recentWallet,
    targetWallet,
    userProfile,
    handleConnect,
    handleDisconnect,
    availableWallets,
    isLoadingFlow,
    walletError,
    isConnected,
    accounts,
    walletLoading,
    balance,
  } = useWalletConnectFlow({ onConnect, onDisconnect, onClose }); // Pass parent's onClose directly

  const { showModal, setShowModal, handleModalClose } = useWalletModalState({ isOpen, onClose, stage });

  // Detect Mobile
  const isMobile = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  return (
    <>
      {children && typeof children === 'function' ? (
        children({
          isConnected: isConnected,
          accounts: accounts,
          loading: walletLoading || isLoadingFlow,
          balance: balance,
          userProfile: userProfile,
          handleConnect: () => setShowModal(true), // Use internal setShowModal from useWalletModalState
          handleDisconnect: handleDisconnect,
        })
      ) : null}

      <Dialog open={showModal} onOpenChange={handleModalClose}>
        <VisuallyHidden asChild><DialogTitle>Select Wallet</DialogTitle></VisuallyHidden>
        <VisuallyHidden asChild><DialogDescription>Choose a wallet provider</DialogDescription></VisuallyHidden>
        
        <DialogContent className="sm:max-w-[400px] p-0 bg-gray-950 border border-gray-800 text-white overflow-hidden rounded-3xl shadow-2xl shadow-black/50">
          
          {/* Header / Brand */}
          <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-brand-dark/50 to-transparent pointer-events-none" />
          
          <div className="relative p-6 pt-8">
            
            <AnimatePresence mode="wait">
              {stage === 'idle' ? (
                <motion.div 
                  key="list"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6"
                >
                  <div className="text-center space-y-2 mb-8">
                    <div className="mx-auto w-16 h-16 mb-4 relative">
                        <div className="absolute inset-0 bg-brand-light/10 blur-xl rounded-full" />
                        <img src={logo.src} alt="App Logo" className="relative w-full h-full object-contain" />
                    </div>
                    <h2 className="text-xl font-bold tracking-tight">Connect Wallet</h2>
                    <p className="text-sm text-gray-400">Select a provider to continue</p>
                  </div>

                  <div className="space-y-3">
                    {availableWallets.map((w) => (
                      <WalletOption
                        key={w.type}
                        type={w.type}
                        isInstalled={w.isInstalled}
                        isRecent={recentWallet === w.type}
                        isLoading={false}
                        isMobile={isMobile}
                        onSelect={() => {
                          if (w.isInstalled) {
                              handleConnect(w.type as keyof typeof WALLET_INFO);
                          } else if (isMobile && w.type === 'starkey') {
                              const dappUrl = window.location.href;
                              const encodedDappUrl = encodeURIComponent(dappUrl);
                              window.location.href = `https://starkey.app/dApps?url=${encodedDappUrl}`;
                          } else {
                              window.open(WALLET_INFO[w.type as keyof typeof WALLET_INFO].downloadUrl, '_blank');
                          }
                        }}
                      />
                    ))}
                    
                    {availableWallets.every(w => !w.isInstalled) && (
                      <div className="p-4 rounded-2xl bg-yellow-900/10 border border-yellow-900/30 flex items-center gap-3">
                        <AlertCircle className="w-5 h-5 text-yellow-500" />
                        <p className="text-xs text-yellow-200/80">
                          No supported wallets detected. Please install Starkey or Ribbit wallet.
                        </p>
                      </div>
                    )}
                  </div>
                  
                  <div className="pt-4 text-center">
                    <p className="text-[10px] text-gray-600 uppercase tracking-widest">Secure Connection</p>
                  </div>
                </motion.div>
              ) : (
                <motion.div key="status" className="min-h-[300px] flex items-center justify-center">
                  <StatusView stage={stage} walletType={targetWallet} error={walletError} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ConnectWalletHandler;