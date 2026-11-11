'use client';

import { useState, useEffect } from 'react';
import { resolveSupraName, getSyncCachedSupraName } from '@snabur/hoglet-frontend/supra';

export function useSupraName(address: string | null | undefined, network?: string | null) {
  // 1. Synchronously grab cached name on initial mount!
  // If present in cache (positive or negative), snsName and isLoading are resolved on the VERY FIRST FRAME (0ms, NO FLICKER)
  const initialCached = getSyncCachedSupraName(address, network);
  const isInitiallyCached = initialCached !== undefined;

  const [snsName, setSnsName] = useState<string | null>(() => (isInitiallyCached ? initialCached : null));
  const [isLoading, setIsLoading] = useState<boolean>(!isInitiallyCached && !!address);

  useEffect(() => {
    let isCancelled = false;

    if (!address || !address.startsWith('0x')) {
      setSnsName(null);
      setIsLoading(false);
      return;
    }

    // Check synchronous cache immediately
    const cached = getSyncCachedSupraName(address, network);
    if (cached !== undefined) {
      setSnsName(cached);
      setIsLoading(false);
      // Background revalidation (only fires on network if positive cache is stale, respects negative TTL)
      resolveSupraName(address, network)
        .then((freshName) => {
          if (!isCancelled && freshName !== cached) {
            setSnsName(freshName);
          }
        })
        .catch(() => {});
      return;
    }

    // Cold lookup: query RPC
    setIsLoading(true);
    resolveSupraName(address, network)
      .then((name) => {
        if (!isCancelled) {
          setSnsName(name);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setSnsName(null);
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [address, network]);

  const shortAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : '';

  const displayName = snsName || shortAddress;

  return {
    snsName,
    shortAddress,
    displayName,
    isLoading,
    // Backward compatibility for components expecting `name`
    name: snsName,
  };
}

