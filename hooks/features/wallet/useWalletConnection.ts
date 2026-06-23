import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { WalletType } from '@/utils/types';
import { WALLET_CONFIGS } from '@/utils/supra/wallet-configs';
import { getStoredWalletType, setStoredWalletType, clearStoredWalletType } from '@/utils/supra/storage';
import { useNetwork } from '@/context/NetworkContext';
import type { DappMetadata, WalletInfo, WalletBalanceRequest } from 'ribbit-wallet-connect';

export const useWalletConnection = () => {
  const [selectedWallet, setSelectedWallet] = useState<WalletType>(getStoredWalletType);
  const [accounts, setAccounts] = useState<string[]>([]);
  const [balance, setBalance] = useState<string>('');
  const [networkData, setNetworkData] = useState<any>({});
  const [isExtensionInstalled, setIsExtensionInstalled] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [provider, setProvider] = useState<any>(null);
  const { network } = useNetwork();
  const currentChainId = network === 'supra-testnet' ? 6 : 8;

  // Helper to get the current provider instance based on state or fresh call
  const getProvider = useCallback(async (type: WalletType = selectedWallet) => {
    return await WALLET_CONFIGS[type].provider();
  }, [selectedWallet]);

  const updateBalance = useCallback(async (currentProvider: any, wallet: WalletType, accountAddress: string) => {
    if (!currentProvider || !accountAddress) return;
    try {
      switch (wallet) {
        case 'starkey': {
          const bal = await currentProvider.balance();
          if (bal) {
            setBalance(`${bal.formattedBalance} ${bal.displayUnit}`);
          }
          break;
        }
        case 'ribbit': {
          const walletBalanceRequest: WalletBalanceRequest = {
            chainId: currentChainId,
            resourceType: '0x1::supra_coin::SupraCoin',
            decimals: 7,
          };
          const balanceStr = await currentProvider.getWalletBalance(walletBalanceRequest);
          setBalance(`${balanceStr.balance || 0} SUPRA`);
          break;
        }
      }
    } catch (error) {
      console.error('Error updating balance:', error);
      setBalance('');
    }
  }, [currentChainId]);

  const getNetworkData = useCallback(async (currentProvider: any, wallet: WalletType) => {
      if (!currentProvider) return {};
      try {
        if (wallet === 'starkey') {
            const data = await currentProvider.getChainId();
            setNetworkData(data || {});
            return data;
        } else {
             // Ribbit doesn't have network switching built-in like Starkey, mock it to mainnet (8)
             // actual tx uses dynamic chainId in useWalletTransactions based on user's NetworkContext switch
             const chainId = 8;
             const mockNetworkData = { chainId: chainId.toString() };
             setNetworkData(mockNetworkData);
             return mockNetworkData;
        }
      } catch (error) {
        console.error('Error getting network data:', error);
        return {};
      }
  }, []);


  const checkExtensionInstalled = useCallback(async (type: WalletType = selectedWallet) => {
    const currentProvider = await WALLET_CONFIGS[type].provider();
    
    if (type === 'ribbit') {
         if (!currentProvider) {
            setIsExtensionInstalled(false);
            return false;
         }
         setIsExtensionInstalled(true);
         setProvider(currentProvider);
         return true;
    }

    // Starkey
    setProvider(currentProvider);
    setIsExtensionInstalled(!!currentProvider);
    return !!currentProvider;
  }, [selectedWallet]);

  // Initial check
  useEffect(() => {
    checkExtensionInstalled();
  }, [checkExtensionInstalled]);

  // Smart Balance: Auto-update on network change and poll every 10 seconds
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    const fetchLatestBalance = async () => {
      if (accounts.length > 0 && provider) {
        await updateBalance(provider, selectedWallet, accounts[0]);
        await getNetworkData(provider, selectedWallet);
      }
    };

    // Update immediately when dependencies (like network or accounts) change
    fetchLatestBalance();

    // Set up polling interval (every 30 seconds)
    if (accounts.length > 0 && provider) {
      interval = setInterval(fetchLatestBalance, 30000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [network, accounts, selectedWallet, provider, updateBalance, getNetworkData]);

  const connect = async (walletType?: WalletType) => {
    const targetWallet = walletType || selectedWallet;
    const currentProvider = await WALLET_CONFIGS[targetWallet].provider();

    if (!currentProvider) {
      toast('Extension not installed', {
        description: `Please install the ${targetWallet} extension`,
      });
      return null;
    }

    setLoading(true);
    try {
      let connectedAccount = '';

      if (targetWallet === 'starkey') {
        await currentProvider.connect();
        const responseAcc = await currentProvider.account();
        if (responseAcc.length > 0) {
          connectedAccount = responseAcc[0];
          // Starkey specific local storage
          localStorage.setItem('starkey.accounts.0', connectedAccount);
        }
      } else if (targetWallet === 'ribbit') {
        const dappMetadata: DappMetadata = {
          name: 'multiwallet',
          description: 'Ribbit Wallet Integration',
          logo: window.location.origin + '/favicon.ico',
          url: window.location.origin,
        };
        const response: WalletInfo = await currentProvider.connectToWallet(dappMetadata);
        if (response.connected && response.walletAddress) {
          connectedAccount = response.walletAddress;
        }
      }

      if (connectedAccount) {
        setAccounts([connectedAccount]);
        setProvider(currentProvider);
        setSelectedWallet(targetWallet);
        setStoredWalletType(targetWallet);
        
        // Sync Starkey wallet network with Dapp network on connect
        if (targetWallet === 'starkey' && currentProvider.changeNetwork) {
          try {
            await currentProvider.changeNetwork({ chainId: currentChainId.toString() });
          } catch (e) {
            console.warn("User rejected or failed to sync Starkey network on connect", e);
          }
        }

        await updateBalance(currentProvider, targetWallet, connectedAccount);
        await getNetworkData(currentProvider, targetWallet);
        
        return { account: connectedAccount, provider: currentProvider, walletType: targetWallet };
      } else {
          throw new Error("No account found");
      }

    } catch (error) {
      console.error('Connection error:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const disconnect = async () => {
    const currentProvider = await getProvider();
    try {
        if (currentProvider) {
            await currentProvider.disconnect();
        }
    } catch (e) {
        console.error("Error disconnecting", e);
    }
    
    setAccounts([]);
    setBalance('');
    setProvider(null);
    clearStoredWalletType();
  };

  return {
    selectedWallet,
    accounts,
    balance,
    networkData,
    isExtensionInstalled,
    loading,
    provider,
    connect,
    disconnect,
    checkExtensionInstalled,
    updateBalance: async () => {
      if (accounts[0]) {
        await updateBalance(provider, selectedWallet, accounts[0]);
      }
    }
  };
};
