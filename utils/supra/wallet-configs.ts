import { WalletCapabilities, WalletType } from '@/utils/types';
import { initSdk } from 'ribbit-wallet-connect';

interface WalletConfig {
  capabilities: WalletCapabilities;
  provider: () => any | Promise<any>;
}

export const WALLET_CONFIGS: Record<WalletType, WalletConfig> = {
  starkey: {
    capabilities: {
      signMessage: true,
      accountSwitching: true,
      networkSwitching: true,
      rawTransactions: true,
      eventListeners: true,
      tokenRevalidation: true,
    },
    provider: () =>
      typeof window !== 'undefined' && (window as any)?.starkey?.supra,
  },
  ribbit: {
    capabilities: {
      signMessage: true,
      accountSwitching: false, // Ribbit doesn't support account switching
      networkSwitching: false, // Ribbit network switching happens in-app
      rawTransactions: true,
      eventListeners: false,
      tokenRevalidation: false, // Ribbit doesn't support token revalidation
    },
    provider: () => initSdk(),
  },
};
