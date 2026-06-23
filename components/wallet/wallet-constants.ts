// src/components/wallet/wallet-constants.ts
import starkeyIcon from '@/public/walletIcons/Starkey.png';
import ribbitIcon from '@/public/walletIcons/Ribbit.jpg';

// --- Constants & Config ---
export const RECENT_WALLET_KEY = 'recent_wallet_type';
export const TIMINGS = {
  MIN_LOADING: 300, // Minimum time to show loading state for UX
  SUCCESS_DISPLAY: 1000, // How long to show success message
  ERROR_DISPLAY: 3000,
};

export const WALLET_INFO = {
  starkey: {
    name: 'Starkey Wallet',
    icon: starkeyIcon.src,
    downloadUrl: 'https://chromewebstore.google.com/detail/starkey-wallet-the-offici/hcjhpkgbmechpabifbggldplacolbkoh',
  },
  ribbit: {
    name: 'Ribbit Wallet',
    icon: ribbitIcon.src,
    downloadUrl: 'https://ribbitwallet.com',
  },
} as const;
