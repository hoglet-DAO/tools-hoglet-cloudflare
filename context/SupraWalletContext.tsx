'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { useWalletConnection } from '@/hooks/features/wallet/useWalletConnection';
import { useWalletAuth } from '@/hooks/features/wallet/useWalletAuth';
import { useWalletTransactions } from '@/hooks/features/wallet/useWalletTransactions';
import { WalletType, WalletCapabilities } from '@/utils/types';
import { WALLET_CONFIGS } from '@/utils/supra/wallet-configs';
import { useNetwork } from '@/context/NetworkContext'; // Import network context

interface SupraWalletContextType {
  // Connection
  selectedWallet: WalletType;
  accounts: string[];
  balance: string;
  networkData: any;
  isExtensionInstalled: boolean;
  loading: boolean;
  provider: any;
  rpcUrl: string; // Add rpcUrl to interface
  connect: (type?: WalletType) => Promise<any>;
  disconnect: () => Promise<void>;
  
  // Auth
  login: () => Promise<string | undefined>;
  logout: () => Promise<void>;
  signMessage: (message: string, nonce: string) => Promise<any>;
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  isSigning: boolean;

  // Transactions
  sendRawTransaction: (
    moduleAddress: string,
    moduleName: string,
    functionName: string,
    params: any[],
    runTimeParams?: any[],
    options?: { isSponsored?: boolean } // Update signature to include options
  ) => Promise<string | undefined>;

  // Helpers
  walletCapabilities: WalletCapabilities;
  switchToChain: (chainId: string) => Promise<void>;
  getAvailableWallets: () => any[];
}

const SupraWalletContext = createContext<SupraWalletContextType | null>(null);

export const SupraWalletProvider = ({ children }: { children: ReactNode }) => {
  const connection = useWalletConnection();
  const { network } = useNetwork(); // Get network from context
  
  // Determine RPC URL
  const rpcUrl = network === "supra-mainnet" 
      ? process.env.NEXT_PUBLIC_RPC_URL_MAINNET! 
      : process.env.NEXT_PUBLIC_RPC_URL_TESTNET!;

  // Derived state for auth/tx hooks
  const currentAccount = connection.accounts[0] || '';
  
  const auth = useWalletAuth(
    connection.provider,
    connection.selectedWallet,
    currentAccount
  );
  
  const transactions = useWalletTransactions(
    connection.provider,
    connection.selectedWallet,
    currentAccount,
    rpcUrl, // Pass the calculated rpcUrl here
    connection.updateBalance
  );

  const walletCapabilities = WALLET_CONFIGS[connection.selectedWallet as WalletType].capabilities;

  // ... (Event Listeners remain same)

  // Helper for switching chain
  const switchToChain = async (chainId: string) => {
    if (!walletCapabilities.networkSwitching) {
        throw new Error('Network switching not supported');
    }
    if (connection.selectedWallet === 'starkey' && connection.provider) {
        await connection.provider.changeNetwork({ chainId });
        // Connection hook should ideally detect this change, or we force update
    }
  };
  
  const getAvailableWallets = () => {
     return Object.entries(WALLET_CONFIGS).map(([type, config]) => ({
        type: type as WalletType,
        name: type === 'starkey' ? 'Starkey Wallet' : 'Ribbit Wallet',
        isInstalled: !!config.provider(),
        capabilities: config.capabilities
     }));
  };

  const value: SupraWalletContextType = {
    ...connection,
    ...auth,
    ...transactions,
    rpcUrl, // Expose RPC URL
    walletCapabilities,
    switchToChain,
    getAvailableWallets
  };

  return (
    <SupraWalletContext.Provider value={value}>
      {children}
    </SupraWalletContext.Provider>
  );
};

export const useSupraWallet = () => {
  const context = useContext(SupraWalletContext);
  if (!context) {
    throw new Error('useSupraWallet must be used within a SupraWalletProvider');
  }
  return context;
};
