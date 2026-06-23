'use client';

import { useEffect } from 'react';
import { useNetwork } from '@/context/NetworkContext';
import { useSupraWallet } from '@/context/SupraWalletContext';

export const WalletNetworkSync = () => {
  const { network } = useNetwork();
  const { switchToChain, walletCapabilities, selectedWallet } = useSupraWallet();

  useEffect(() => {
    const syncChain = async () => {
      const targetChainId = network === 'supra-mainnet' ? '8' : '6';
      
      if (selectedWallet === 'starkey' && walletCapabilities.networkSwitching) {
        try {
          await switchToChain(targetChainId);
        } catch (error) {
          console.error("Failed to sync wallet network:", error);
        }
      }
    };

    syncChain();
  }, [network, switchToChain, selectedWallet, walletCapabilities]);

  return null;
};
