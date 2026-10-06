export const WALLET_EVENTS = {
  CONNECTED: 'wallet-connected',
  PRESIGNED_STATE: 'presigned-state',
  POSTSIGNED_STATE: 'postsigned-state',
  ERROR: 'wallet-error',
} as const;

export const STORAGE_KEY = 'multiwallet.selectedWallet';

export const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/**
 * `supra_framework::account::ZERO_AUTH_KEY` — the 32 zero bytes an authentication key is rotated to
 * in order to annihilate a private key.
 *
 * It doubles as the "no usable key" marker: a Resource Account is created with this key, so the same
 * value both identifies a keyless account and is what a burn (or renounce) writes.
 */
export const ZERO_AUTH_KEY =
  '0x0000000000000000000000000000000000000000000000000000000000000000';
