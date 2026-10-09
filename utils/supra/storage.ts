import { WalletType } from '@/utils/types';
import { STORAGE_KEYS } from '@/lib/storage';

/**
 * The selected wallet, with a fallback chain.
 *
 * Unlike the app's own preferences this one has to survive storage being unavailable, because the Supra
 * SDK reads it to decide which provider to restore. Hence three tiers — localStorage, sessionStorage, then
 * a cookie — rather than the single `writeStored` the registry offers. The key still comes from the
 * registry so it cannot drift from the rest.
 */
const STORAGE_KEY = STORAGE_KEYS.selectedWallet;

const getCookie = (name: string) => {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split('; ')
    .find((r) => r.startsWith(name + '='));
  return match
    ? decodeURIComponent(match.split('=').slice(1).join('='))
    : null;
};

export const setStoredWalletType = (walletType: WalletType) => {
  try {
    // Try localStorage first
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(STORAGE_KEY, walletType);
      return;
    }
  } catch (e) {
    console.warn('localStorage not available');
  }

  try {
    // Fallback to sessionStorage
    if (typeof window !== 'undefined' && window.sessionStorage) {
      sessionStorage.setItem(STORAGE_KEY, walletType);
      return;
    }
  } catch (e) {
    console.warn('sessionStorage not available');
  }

  try {
    // Fallback to cookie
    if (typeof document !== 'undefined') {
      document.cookie = `${STORAGE_KEY}=${walletType}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
      return;
    }
  } catch (e) {
    console.warn('cookies not available');
  }
};

export const getStoredWalletType = (): WalletType => {
  if (typeof window === 'undefined') return 'starkey';

  try {
    // Try localStorage first
    if (window.localStorage) {
      const stored = localStorage.getItem(STORAGE_KEY) as WalletType;
      if (stored && ['starkey', 'ribbit'].includes(stored)) {
        return stored;
      }
    }
  } catch (e) {
    console.warn('localStorage read failed');
  }

  try {
    // Fallback to sessionStorage
    if (window.sessionStorage) {
      const stored = sessionStorage.getItem(STORAGE_KEY) as WalletType;
      if (stored && ['starkey', 'ribbit'].includes(stored)) {
        return stored;
      }
    }
  } catch (e) {
    console.warn('sessionStorage read failed');
  }

  try {
    // Fallback to cookie
    if (typeof document !== 'undefined') {
      const stored = getCookie(STORAGE_KEY) as WalletType;
      if (stored && ['starkey', 'ribbit'].includes(stored)) {
        return stored;
      }
    }
  } catch (e) {
    console.warn('cookie read failed');
  }

  return 'starkey'; // Default fallback
};

export const clearStoredWalletType = () => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (e) {
    // Silent fail
  }

  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch (e) {
    // Silent fail
  }

  try {
    if (typeof document !== 'undefined') {
      document.cookie = `${STORAGE_KEY}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    }
  } catch (e) {
    // Silent fail
  }
};
