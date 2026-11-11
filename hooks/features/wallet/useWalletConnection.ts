import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { WalletType } from '@/utils/types';
import { WALLET_CONFIGS } from '@snabur/hoglet-frontend/supra';
import { getStoredWalletType, setStoredWalletType, clearStoredWalletType } from '@snabur/hoglet-frontend/supra';
import { useNetwork } from '@/context/NetworkContext';
import { writeStored, removeStored, STORAGE_KEYS } from '@/lib/storage';
import type { DappMetadata, WalletInfo, WalletBalanceRequest } from 'ribbit-wallet-connect';

export const AUTO_CONNECT_STORAGE_KEY = 'hoglet_wallet_auto_connect';

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
      // Fetch balance via RPC directly to ensure reliability across wallets.
      const rpcUrl = network === 'supra-mainnet'
        ? process.env.NEXT_PUBLIC_RPC_URL_MAINNET
        : process.env.NEXT_PUBLIC_RPC_URL_TESTNET;

      if (rpcUrl) {
        const response = await fetch(`${rpcUrl}/rpc/v1/view`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            function: "0x1::coin::balance",
            type_arguments: ["0x1::supra_coin::SupraCoin"],
            arguments: [accountAddress]
          })
        });

        const data = await response.json();
        if (data && data.result && data.result.length > 0) {
          const rawBal = Number(data.result[0]);
          const formatted = (rawBal / 100000000).toFixed(4); // SUPRA has 8 decimals
          setBalance(`${formatted} SUPRA`);
          return;
        }
      }

      // Fallback if RPC fails for some reason
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
            decimals: 8,
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
  }, [network, currentChainId]);

  const getNetworkData = useCallback(async (currentProvider: any, wallet: WalletType) => {
      if (!currentProvider) return {};
      try {
        if (wallet === 'starkey') {
            const data = await currentProvider.getChainId();
            setNetworkData(data || {});
            return data;
        } else {
             // Ribbit doesn't have network switching built-in like Starkey, mock it to mainnet (8)
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

  // --- EAGER RECONNECTION (AUTO-CONNECT) ---
  useEffect(() => {
    let isCancelled = false;

    const attemptAutoConnect = async () => {
      if (typeof window === 'undefined') return;

      const savedWallet = localStorage.getItem(AUTO_CONNECT_STORAGE_KEY) as WalletType | null;
      if (!savedWallet || !['starkey', 'ribbit'].includes(savedWallet)) {
        return;
      }

      // Retry loop to accommodate browser extension injection latency (100-300ms)
      const waitForProvider = async (wallet: WalletType, maxRetries = 15): Promise<any> => {
        for (let i = 0; i < maxRetries; i++) {
          if (isCancelled) return null;
          const prov = await WALLET_CONFIGS[wallet].provider();
          if (prov) return prov;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        return null;
      };

      try {
        const currentProvider = await waitForProvider(savedWallet);
        if (!currentProvider || isCancelled) return;

        let connectedAccount = '';

        if (savedWallet === 'starkey') {
          // 1. Silent check if already unlocked and authorized
          try {
            const accs: string[] = (await currentProvider.account()) || [];
            if (accs.length > 0) {
              connectedAccount = accs[0];
            } else {
              // 2. Silent connect (no popup if site previously approved)
              await currentProvider.connect();
              const freshAccs: string[] = (await currentProvider.account()) || [];
              if (freshAccs.length > 0) {
                connectedAccount = freshAccs[0];
              }
            }
          } catch {
            // Extension locked or permissions revoked; fail silently
          }
        } else if (savedWallet === 'ribbit') {
          try {
            const info = currentProvider.getWalletInfo?.();
            if (info?.connected && info?.walletAddress) {
              connectedAccount = info.walletAddress;
            }
          } catch {
            // Silent fail
          }
        }

        if (connectedAccount && !isCancelled) {
          setAccounts([connectedAccount]);
          setProvider(currentProvider);
          setSelectedWallet(savedWallet);
          setStoredWalletType(savedWallet);
          setIsExtensionInstalled(true);
          writeStored(STORAGE_KEYS.starkeyAccount, connectedAccount);

          await updateBalance(currentProvider, savedWallet, connectedAccount);
          await getNetworkData(currentProvider, savedWallet);
        }
      } catch (err) {
        console.debug('[Wallet Auto-Connect] Silent auto-connect fallback:', err);
      }
    };

    attemptAutoConnect();

    return () => {
      isCancelled = true;
    };
  }, [updateBalance, getNetworkData]);

  // Smart Balance: Auto-update on network change and poll every 30 seconds
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    const fetchLatestBalance = async () => {
      if (accounts.length > 0 && provider) {
        await updateBalance(provider, selectedWallet, accounts[0]);
        await getNetworkData(provider, selectedWallet);
      }
    };

    fetchLatestBalance();

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
          writeStored(STORAGE_KEYS.starkeyAccount, connectedAccount);
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

        // Store auto-connect preference
        if (typeof window !== 'undefined') {
          localStorage.setItem(AUTO_CONNECT_STORAGE_KEY, targetWallet);
        }
        
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

  const disconnect = useCallback(async () => {
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

    if (typeof window !== 'undefined') {
      localStorage.removeItem(AUTO_CONNECT_STORAGE_KEY);
      removeStored(STORAGE_KEYS.starkeyAccount);
    }
  }, [getProvider]);

  // --- EVENT LISTENERS (Account & Network Switching) ---
  useEffect(() => {
    if (!provider || selectedWallet !== 'starkey') return;

    const handleAccountsChanged = (newAccounts: string[]) => {
      if (newAccounts && newAccounts.length > 0) {
        const nextAccount = newAccounts[0];
        setAccounts([nextAccount]);
        writeStored(STORAGE_KEYS.starkeyAccount, nextAccount);
        updateBalance(provider, 'starkey', nextAccount);
      } else {
        // Disconnected directly from extension
        disconnect();
      }
    };

    const handleNetworkChanged = (data: any) => {
      setNetworkData(data || {});
    };

    try {
      if (typeof provider.on === 'function') {
        provider.on('accountChanged', handleAccountsChanged);
        provider.on('networkChanged', handleNetworkChanged);
      }
    } catch (e) {
      console.debug('Failed to attach Starkey event listeners:', e);
    }

    return () => {
      try {
        if (typeof provider.removeListener === 'function') {
          provider.removeListener('accountChanged', handleAccountsChanged);
          provider.removeListener('networkChanged', handleNetworkChanged);
        } else if (typeof provider.off === 'function') {
          provider.off('accountChanged', handleAccountsChanged);
          provider.off('networkChanged', handleNetworkChanged);
        }
      } catch (e) {
        // Silent fail
      }
    };
  }, [provider, selectedWallet, updateBalance, disconnect]);

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
