import { useState, useEffect, useCallback } from 'react';

const ORACLE_ADDRESS_MAINNET = '0xe3948c9e3a24c51c4006ef2acc44606055117d021158f320062df099c4a94150';
const ORACLE_MODULE = 'supra_oracle_storage';
// In DORA on Supra mainnet: pair 201 is the active real-time SUPRA/USD feed
const SUPRA_PAIR_ID = 201;

let memoryPrice: number | null = null;
let lastFetchTime = 0;

export function useSupraPrice() {
  const [price, setPrice] = useState<number | null>(memoryPrice);
  const [loading, setLoading] = useState<boolean>(false);

  const fetchPrice = useCallback(async () => {
    // Cache for 60 seconds across all components
    if (memoryPrice && Date.now() - lastFetchTime < 60000) {
      setPrice(memoryPrice);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('https://rpc-mainnet.supra.com/rpc/v1/view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          function: `${ORACLE_ADDRESS_MAINNET}::${ORACLE_MODULE}::get_price`,
          type_arguments: [],
          arguments: [SUPRA_PAIR_ID],
        }),
      });

      if (!response.ok) return;

      const data: any = await response.json();
      if (data?.result && Array.isArray(data.result) && data.result.length >= 2) {
        const rawPrice = BigInt(data.result[0]);
        const decimals = Number(data.result[1]);
        const calculated = Number(rawPrice) / (10 ** decimals);
        memoryPrice = calculated;
        lastFetchTime = Date.now();
        setPrice(calculated);
      }
    } catch {
      // Quiet fallback
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrice();
    const interval = setInterval(fetchPrice, 60000);
    return () => clearInterval(interval);
  }, [fetchPrice]);

  return { price, loading, refreshPrice: fetchPrice };
}
