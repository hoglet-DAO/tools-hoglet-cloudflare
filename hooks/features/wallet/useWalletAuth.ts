import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import nacl from 'tweetnacl';
import { WalletType } from '@/utils/types';
import { WALLET_CONFIGS } from '@/utils/supra/wallet-configs';
import { trace, traceWarn } from "@/lib/debug";

/** An Ed25519 signature is 64 bytes and a public key 32, both as `0x`-prefixed hex. */
const ED25519_SIG_HEX_CHARS = 128;
const ED25519_PUBKEY_HEX_CHARS = 64;

const hexChars = (value: unknown): number =>
  typeof value === 'string' ? value.replace(/^0x/, '').length : -1;

/**
 * Rejects a wallet response that is missing or malformed before it can be attached to a transaction.
 *
 * The failure this guards against is silent and expensive: an empty signature makes the transaction
 * well-formed but useless, so the framework rejects it on-chain with an opaque proof error. Catching
 * it here turns that into a precise message naming the wallet.
 */
function validateSignature(response: any, walletType: string) {
  const signature = response?.signature;
  const publicKey = response?.publicKey;

  if (!signature || !publicKey) {
    const keys = response && typeof response === 'object' ? Object.keys(response).join(', ') : typeof response;
    console.error(`[signRawHex] ${walletType} returned no signature/publicKey`, response);
    throw new Error(
      `${walletType} returned no signature (fields present: ${keys}). ` +
        `The raw-byte signing request may have been rejected, or the wallet uses different field names.`
    );
  }

  const sigChars = hexChars(signature);
  const pkChars = hexChars(publicKey);

  if (sigChars !== ED25519_SIG_HEX_CHARS || pkChars !== ED25519_PUBKEY_HEX_CHARS) {
    console.error(`[signRawHex] ${walletType} returned unexpected sizes`, {
      signatureChars: sigChars,
      publicKeyChars: pkChars,
      signature,
      publicKey,
    });
    throw new Error(
      `${walletType} returned a malformed signature (sig ${sigChars} hex chars, key ${pkChars}; expected ${ED25519_SIG_HEX_CHARS} and ${ED25519_PUBKEY_HEX_CHARS}).`
    );
  }

  return { signature: signature as string, publicKey: publicKey as string };
}

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

  /**
   * Signs raw bytes, handed over as a `0x` hex string, with the wallet key.
   *
   * Distinct from `signMessage`, which UTF-8 encodes its input because it is meant for human-readable
   * login strings. Framework challenges are BCS payloads, so every byte has to survive untouched —
   * that is the whole point of this separate entry.
   */
  const signRawHex = useCallback(async (hex: string, nonce = "0") => {
    if (!provider || !account) throw new Error('Wallet not connected');
    if (!WALLET_CONFIGS[walletType].capabilities.signMessage) {
      throw new Error('Signing not supported by this wallet');
    }

    setIsSigning(true);
    try {
      trace('[signRawHex] requesting signature', {
        walletType,
        account,
        hexChars: hex.length - 2,
        bytes: (hex.length - 2) / 2,
        nonce,
      });

      if (walletType === 'starkey') {
        // `signMessage` signs hex-encoded UTF-8 bytes: it decodes the hex and treats it as text, so a
        // BCS challenge (arbitrary binary, leading 0x00 bytes) cannot survive it and the wallet
        // resolves { signature: null }. Starkey ships `signHexMessage` precisely for raw bytes —
        // "sent to the wallet as-is, not re-encoded" — so use that whenever it is present.
        if (typeof provider.signHexMessage === 'function') {
          trace('[signRawHex] starkey: using signHexMessage (raw bytes)');
          const response = await provider.signHexMessage({ message: hex });
          trace('[signRawHex] starkey signHexMessage response', response);
          if (response === null) throw new Error('Signing was cancelled in the wallet.');
          return validateSignature(response, 'starkey');
        }

        console.warn(
          '[signRawHex] starkey.signHexMessage is unavailable; falling back to signMessage, which may reject non-UTF-8 payloads'
        );
        const response = await provider.signMessage({ message: hex, nonce });
        trace('[signRawHex] starkey signMessage response', response);
        if (response === null) throw new Error('Signing was cancelled in the wallet.');
        return validateSignature(response, 'starkey');
      }

      // Ribbit does not support dynamic chain switching for signing, so mirror the mock used for
      // login and target mainnet's chain id.
      const chainId = 8;
      const response = await provider.signMessage({
        message: hex,
        nonce: nonce ? parseInt(nonce, 10) : 0,
        chainId,
      });
      trace('[signRawHex] ribbit full response', response);
      if (response.approved === false) {
        throw new Error(response.error || 'Signing rejected');
      }
      return validateSignature(response, 'ribbit');
    } catch (e) {
      console.error('[signRawHex] FAILED', e);
      throw e;
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
    signRawHex,
    isSigning,
    authFetch,
    checkAndRevalidateToken
  };
};
