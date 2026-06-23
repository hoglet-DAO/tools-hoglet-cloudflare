import { RawTxnRequest, RawTransactionResponse, SupraChainId } from 'ribbit-wallet-connect';

export async function sendRibbitTransaction({
  provider,
  account,
  moduleAddress,
  moduleName,
  functionName,
  runTimeParams,
  serializedParams,
  chainIdStr,
}: {
  provider: any;
  account: string;
  moduleAddress: string;
  moduleName: string;
  functionName: string;
  runTimeParams: any[];
  serializedParams: any[];
  chainIdStr: string;
}) {
  const chainIdEnum = chainIdStr === '8' ? SupraChainId.MAINNET : SupraChainId.TESTNET;
  
  const rawTxnRequest: RawTxnRequest = {
    sender: account,
    moduleAddress,
    moduleName,
    functionName,
    typeArgs: runTimeParams,
    args: serializedParams || [], // MUST be BCS serialized (Uint8Array[])
    chainId: chainIdEnum,
  };

  const rawTxnBase64 = await provider.createRawTransactionBuffer(rawTxnRequest);

  const response: RawTransactionResponse = await provider.signAndSendRawTransaction({
    rawTxn: rawTxnBase64,
    chainId: chainIdEnum,
    meta: {
      description: `Call ${moduleName}::${functionName}`,
    },
  });

  console.log("DEBUG - Ribbit Wallet Response:", JSON.stringify(response, null, 2));

  if (response.approved) {
    const hash = response.txHash || (response as any).transactionHash || response.result;
    console.log("DEBUG - Captured Ribbit Hash:", hash);
    return hash;
  } else {
    throw new Error(response.error || 'Transaction rejected');
  }
}
