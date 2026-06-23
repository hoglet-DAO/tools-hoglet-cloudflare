'use client';

import { useEffect } from 'react';
import { useNetwork } from '@/context/NetworkContext';
import { useSupraWallet } from '@/context/SupraWalletContext';

export const WalletNetworkSync = () => {
  const { network } = useNetwork();
  const { switchToChain, walletCapabilities, selectedWallet, updateBalance } = useSupraWallet();

  useEffect(() => {
    const syncChain = async () => {
      const targetChainId = network === 'supra-mainnet' ? '8' : '6';
      
      if (selectedWallet === 'starkey' && walletCapabilities.networkSwitching) {
        try {
          await switchToChain(targetChainId);
          // Wait briefly for wallet's internal state to settle before fetching balance
          setTimeout(() => {
            updateBalance();
          }, 500);
        } catch (error) {
          console.error("Failed to sync wallet network:", error);
        }
      } else {
        // Trigger balance update for wallets that don't support manual network switching (like Ribbit)
        updateBalance();
      }
    };

    syncChain();
  }, [network, switchToChain, selectedWallet, walletCapabilities, updateBalance]);

  return null;
};
