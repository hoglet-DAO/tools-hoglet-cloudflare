import { WalletType } from '@/utils/types';
import { STORAGE_KEY } from './constants';

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
