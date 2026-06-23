'use client';

import { useEffect, useRef } from 'react';
import { useNetwork } from '@/context/NetworkContext';
import { useSupraWallet } from '@/context/SupraWalletContext';

export const WalletNetworkSync = () => {
  const { network } = useNetwork();
  const { disconnect, accounts } = useSupraWallet();
  const prevNetwork = useRef(network);

  useEffect(() => {
    // If the network hasn't changed, don't do anything (avoids disconnecting when accounts changes)
    if (prevNetwork.current === network) {
      return;
    }
    
    // Update the previous network to the new one
    prevNetwork.current = network;

    // Only disconnect if there is actually a connected wallet
    if (accounts && accounts.length > 0) {
      disconnect();
    }
  }, [network, disconnect, accounts]);

  return null;
};
