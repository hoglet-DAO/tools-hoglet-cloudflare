import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import nacl from 'tweetnacl';
import { WalletType } from '@/utils/types';
import { WALLET_CONFIGS } from '@/utils/supra/wallet-configs';

export const useWalletAuth = (
  provider: any,
  walletType: WalletType,
  account: string
) => {
  const [isSigning, setIsSigning] = useState(false);

  const signMessage = useCallback(async (message: string, nonce: string) => {
    if (!provider || !account) return null;

    setIsSigning(true);
    try {
      // Check capabilities
      if (!WALLET_CONFIGS[walletType].capabilities.signMessage) {
        throw new Error('Signing not supported');
      }

      const hexMessage = '0x' + Buffer.from(message, 'utf8').toString('hex');
      let signatureResponse;
      let verified = false;

      if (walletType === 'starkey') {
        const response = await provider.signMessage({
          message: hexMessage,
          nonce,
        });
        signatureResponse = response;
        
        // Verify locally
        const { publicKey, signature } = response;
        verified = nacl.sign.detached.verify(
          new TextEncoder().encode(message),
          Uint8Array.from(Buffer.from(signature.slice(2), 'hex')),
          Uint8Array.from(Buffer.from(publicKey.slice(2), 'hex'))
        );
      } else {
        // Ribbit doesn't support dynamic chain switching for signing, mock to mainnet
        const chainId = 8;
        const response = await provider.signMessage({
          message: hexMessage,
          nonce: parseInt(nonce),
          chainId,
        });
        
        if (response.approved) {
            signatureResponse = response;
             const { publicKey, signature } = response;
             verified = nacl.sign.detached.verify(
                new TextEncoder().encode(message),
                Uint8Array.from(Buffer.from(signature.slice(2), 'hex')),
                Uint8Array.from(Buffer.from(publicKey.slice(2), 'hex'))
            );
        } else {
            throw new Error(response.error || 'Signing rejected');
        }
      }

      return { ...signatureResponse, verified };

    } catch (error) {
      console.error('Signing error:', error);
      toast.error('Failed to sign message');
      throw error;
    } finally {
      setIsSigning(false);
    }
  }, [provider, walletType, account]);

  const login = useCallback(async () => {
    if (!account || !provider) return;

    try {
        // 1. Get Nonce
        const nonce = await fetch('/api/auth/nonce').then((r) => r.text());
        
        // 2. Sign Message
        const message = 'Sign message to login to multiwallet. By signing this message, you agree to the Terms of Service and Privacy Policy of multiwallet at https://multiwallet.trade/tos';
        const signResult = await signMessage(message, nonce);

        if (!signResult || !signResult.verified) {
            throw new Error("Signature verification failed");
        }

        // 3. Get JWT
        const response = await fetch('/api/auth/create-jwt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              address: account,
              signature: signResult.signature,
              nonce,
            }),
        });

        if (!response.ok) throw new Error('Failed to create JWT');
        const { token } = await response.json();

        // 4. Session Login
        await fetch('/api/auth/wallet-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
        });

        return token;

    } catch (error) {
        console.error("Login failed", error);
        toast.error("Login failed");
        throw error;
    }
  }, [account, provider, signMessage]);

  const logout = useCallback(async () => {
      await fetch('/api/auth/wallet-logout', { method: 'POST' });
  }, []);

  const checkAndRevalidateToken = useCallback(async () => {
    // Skip if capabilities don't allow
    if (!WALLET_CONFIGS[walletType].capabilities.tokenRevalidation) return true;
    
    try {
      const response = await fetch('/api/auth/check', {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        // Token invalid/expired, try to refresh
         const nonce = await fetch('/api/auth/nonce').then((r) => r.text());
         const message = 'Sign message to login to multiwallet. By signing this message, you agree to the Terms of Service and Privacy Policy of multiwallet at https://multiwallet.trade/tos';
         
         const signResult = await signMessage(message, nonce);
         if (!signResult) return false;

         const authResponse = await fetch('/api/auth/create-jwt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              address: account,
              signature: signResult.signature,
              nonce,
            }),
          });

          const { token } = await authResponse.json();
          await fetch('/api/auth/wallet-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
          });
          
          return true;
      }
      return true;
    } catch (error) {
        console.error("Revalidation failed", error);
        return false;
    }
  }, [walletType, account, signMessage]);

  const authFetch = useCallback(async (url: string, options: RequestInit = {}) => {
    const isValid = await checkAndRevalidateToken();
    if (!isValid) {
        throw new Error("Authentication failed");
    }
    return fetch(url, {
        ...options,
        credentials: 'include',
    });
  }, [checkAndRevalidateToken]);

  return {
    login,
    logout,
    signMessage,
    isSigning,
    authFetch,
    checkAndRevalidateToken
  };
};
