import { useState, useEffect, useCallback } from 'react';
import useView from '@/hooks/features/view/useView';
import { useNetwork } from '@/context/NetworkContext';

const ORACLE_ADDRESS_MAINNET = '0xe3948c9e3a24c51c4006ef2acc44606055117d021158f320062df099c4a94150';
const ORACLE_ADDRESS_TESTNET = '0x5615001f63d3223f194498787647bb6f8d37b8d1e6773c00dcdd894079e56190';
const ORACLE_MODULE = 'supra_oracle_storage';
// ID de par oficial en DORA para SUPRA (puedes cambiarlo si resulta ser otro)
const SUPRA_PAIR_ID = 200;

export function useSupraPrice() {
  const { network } = useNetwork();
  const { callView } = useView();
  const [price, setPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchPrice = useCallback(async () => {
    if (!network.startsWith('supra-')) return;
    
    setLoading(true);
    const rpcUrl = network === 'supra-mainnet' 
      ? 'https://rpc-mainnet.supra.com' 
      : 'https://rpc-testnet.supra.com';
    
    const oracleAddress = network === 'supra-mainnet' 
      ? ORACLE_ADDRESS_MAINNET 
      : ORACLE_ADDRESS_TESTNET;

    try {
      const response = await callView(
        rpcUrl,
        oracleAddress,
        ORACLE_MODULE,
        'get_price',
        [],
        [SUPRA_PAIR_ID]
      );
      
      if (response && response.result && Array.isArray(response.result) && response.result.length >= 2) {
        const rawPrice = BigInt(response.result[0]);
        const decimals = Number(response.result[1]);
        const supraPrice = Number(rawPrice) / (10 ** decimals);
        setPrice(supraPrice);
      }
    } catch (e) {
      console.error("Error fetching Supra price from DORA:", e);
    } finally {
      setLoading(false);
    }
  }, [network, callView]);

  useEffect(() => {
    fetchPrice();
    const interval = setInterval(fetchPrice, 60000);
    return () => clearInterval(interval);
  }, [fetchPrice]);

  return { price, loading, refreshPrice: fetchPrice };
}
