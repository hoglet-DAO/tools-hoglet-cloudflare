export const WALLET_EVENTS = {
  CONNECTED: 'wallet-connected',
  PRESIGNED_STATE: 'presigned-state',
  POSTSIGNED_STATE: 'postsigned-state',
  ERROR: 'wallet-error',
} as const;

export const STORAGE_KEY = 'multiwallet.selectedWallet';

export const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
