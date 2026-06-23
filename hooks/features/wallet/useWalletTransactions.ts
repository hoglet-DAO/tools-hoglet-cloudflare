import { useCallback } from 'react';
import { WalletType } from '@/utils/types';
import { WALLET_CONFIGS } from '@/utils/supra/wallet-configs';
import { serializeTransactionArgs } from '@/utils/supra/abi';
import { sendStarkeyTransaction } from '@/utils/supra/starkeyPayload';
import { sendRibbitTransaction } from '@/utils/supra/ribbitPayload';

interface TransactionOptions {
  isSponsored?: boolean;
}

export const useWalletTransactions = (
  provider: any,
  walletType: WalletType,
  account: string,
  rpcUrl: string, // Add rpcUrl as parameter
  refreshBalance?: () => Promise<void> // Optional callback to refresh balance
) => {

  const sendRawTransaction = useCallback(async (
    moduleAddress: string,
    moduleName: string,
    functionName: string,
    params: any[],
    runTimeParams: any[] = [],
    options: TransactionOptions = {} // Default options
  ) => {
    if (!provider || !account) return;

    // Detect environment properly from RPC to map the correct chain ID
    // Default to testnet (6) unless the RPC URL explicitly matches mainnet
    const isMainnet = 
      rpcUrl === process.env.NEXT_PUBLIC_RPC_URL_MAINNET || 
      rpcUrl.includes("mainnet");
    const chainIdStr = isMainnet ? '8' : '6';

    // Serialize arguments using BCS
    let serializedParams = params;
    try {
      if (params.length > 0) {
        console.log("Serializing arguments to BCS...");
        serializedParams = await serializeTransactionArgs(
          params,
          moduleAddress,
          moduleName,
          functionName,
          rpcUrl
        );
        console.log("Serialized payload:", serializedParams);
      }
    } catch (e) {
      console.warn("Failed to serialize arguments, using raw strings. Might fail on-chain:", e);
    }

    // Check capabilities
    if (!WALLET_CONFIGS[walletType].capabilities.rawTransactions) {
      throw new Error('Raw transactions not supported by selected wallet.');
    }

    const enableSponsorFromEnv = process.env.NEXT_PUBLIC_ENABLE_SPONSOR_TX !== 'false';
    const shouldAttemptSponsor = (options.isSponsored ?? true) && enableSponsorFromEnv;

    try {
      let txHash;
      if (walletType === 'starkey') {
        txHash = await sendStarkeyTransaction({
          provider,
          account,
          moduleAddress,
          moduleName,
          functionName,
          runTimeParams,
          serializedParams,
          rpcUrl,
          chainIdStr,
          shouldAttemptSponsor,
          walletType,
        });
      } else if (walletType === 'ribbit') {
        txHash = await sendRibbitTransaction({
          provider,
          account,
          moduleAddress,
          moduleName,
          functionName,
          runTimeParams,
          serializedParams,
          chainIdStr,
        });
      }
      
      // Auto-refresh balance if transaction succeeded
      if (txHash && refreshBalance) {
          // Delay briefly to allow chain propagation before fetching balance
          setTimeout(() => refreshBalance(), 2000);
      }
      
      return txHash;
    } catch (error) {
      console.error("Transaction failed:", error);
      throw error;
    }
  }, [provider, walletType, account, rpcUrl, refreshBalance]);

  return {
    sendRawTransaction
  };
};
