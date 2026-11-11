'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSupraWallet } from '@/context/SupraWalletContext';
import {
  isUSTimezone,
  getUserTimezone,
  hasUserSignedConsent,
  saveUserSignedConsent,
  LEGAL_CONSENT_MESSAGE,
} from '@/lib/compliance';
import { toast } from 'sonner';

export function useLegalCompliance() {
  const { accounts, signMessage } = useSupraWallet();
  const currentAccount = accounts[0] || '';

  const [hasConsent, setHasConsent] = useState<boolean>(false);
  const [isUSDetected, setIsUSDetected] = useState<boolean>(false);
  const [userTimezone, setUserTimezone] = useState<string>('');
  const [isSigningConsent, setIsSigningConsent] = useState<boolean>(false);
  const [showConsentModal, setShowConsentModal] = useState<boolean>(false);

  useEffect(() => {
    setIsUSDetected(isUSTimezone());
    setUserTimezone(getUserTimezone());
  }, []);

  useEffect(() => {
    if (currentAccount) {
      const consentSigned = hasUserSignedConsent(currentAccount);
      setHasConsent(consentSigned);
      // Auto prompt if connected, no consent, and not detected as US
      if (!consentSigned && !isUSTimezone()) {
        setShowConsentModal(true);
      }
    } else {
      setHasConsent(false);
      setShowConsentModal(false);
    }
  }, [currentAccount]);

  // Support opening the modal programmatically via custom event
  useEffect(() => {
    const handleOpen = () => {
      if (isUSTimezone()) {
        toast.error('Access restricted: United States jurisdiction detected.');
      } else {
        setShowConsentModal(true);
      }
    };

    window.addEventListener('open-legal-consent-modal', handleOpen);
    return () => window.removeEventListener('open-legal-consent-modal', handleOpen);
  }, []);

  const requestSignConsent = useCallback(async (): Promise<boolean> => {
    if (!currentAccount) {
      toast.error('Connect wallet first.');
      return false;
    }
    if (isUSTimezone()) {
      toast.error('Access restricted: US timezone detected.');
      return false;
    }

    setIsSigningConsent(true);
    try {
      const nonce = Math.floor(Date.now() / 1000).toString();
      const res = await signMessage(LEGAL_CONSENT_MESSAGE, nonce);

      if (res?.signature) {
        saveUserSignedConsent(currentAccount, res.signature);
        setHasConsent(true);
        setShowConsentModal(false);
        toast.success('Jurisdiction certification verified.');
        return true;
      }
    } catch (err: any) {
      toast.error(err?.message || 'Signature rejected by user.');
    } finally {
      setIsSigningConsent(false);
    }
    return false;
  }, [currentAccount, signMessage]);

  return {
    currentAccount,
    isUSDetected,
    userTimezone,
    hasConsent,
    isSigningConsent,
    showConsentModal,
    setShowConsentModal,
    requestSignConsent,
  };
}
