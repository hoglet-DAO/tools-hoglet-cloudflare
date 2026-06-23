'use client';

import { useEffect, useRef } from 'react';
import { useNetwork } from '@/context/NetworkContext';
import { useSupraWallet } from '@/context/SupraWalletContext';

export const WalletNetworkSync = () => {
  const { network } = useNetwork();
  const { disconnect, accounts } = useSupraWallet();
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Avoid disconnecting on initial page load
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    // Only disconnect if there is actually a connected wallet
    if (accounts && accounts.length > 0) {
      disconnect();
    }
  }, [network, disconnect, accounts]);

  return null;
};
