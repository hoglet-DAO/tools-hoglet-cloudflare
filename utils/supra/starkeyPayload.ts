import { executeSponsoredTransactionFlow } from '@/utils/supra/sponsor';

export async function sendStarkeyTransaction({
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
}: {
  provider: any;
  account: string;
  moduleAddress: string;
  moduleName: string;
  functionName: string;
  runTimeParams: any[];
  serializedParams: any[];
  rpcUrl: string;
  chainIdStr: string;
  shouldAttemptSponsor: boolean;
  walletType: string;
}) {
  // --- SPONSORED TRANSACTION LOGIC ---
  if (shouldAttemptSponsor) {
    console.log("Attempting sponsored transaction for Starkey...");
    try {
      let sequenceNumber: bigint = BigInt(0);
      try {
        const accountInfo = await provider.account();
        if (accountInfo && accountInfo.sequenceNumber) {
          sequenceNumber = BigInt(accountInfo.sequenceNumber);
        } else if (accountInfo && accountInfo.address && provider.getSequenceNumber) {
          sequenceNumber = await provider.getSequenceNumber(account);
        }
      } catch (e) {
        console.warn("Could not fetch sequence number from provider. Using 0.", e);
      }

      const txHash = await executeSponsoredTransactionFlow(
        provider,
        account,
        {
          sender: account,
          sequenceNumber: sequenceNumber,
          moduleAddress,
          moduleName,
          functionName,
          typeArguments: runTimeParams,
          args: serializedParams,
          walletType,
          rpcUrl,
          chainId: chainIdStr,
        }
      );
      console.log("Sponsored transaction successful:", txHash);
      return txHash;

    } catch (sponsorError: any) {
      console.warn("Sponsored transaction flow failed, falling back to regular (if applicable):", sponsorError);
      const errorMessage = sponsorError instanceof Error ? sponsorError.message : String(sponsorError);

      const isUserRejection =
        errorMessage.includes("Rejected by user") ||
        errorMessage.includes("User rejected") ||
        errorMessage.includes("User cancelled") ||
        errorMessage.includes("User denied") ||
        errorMessage.includes("User failed to sign") ||
        errorMessage.includes("Signing response was incomplete") ||
        errorMessage.includes("4001") ||
        (sponsorError as any).code === 4001;
      
      if (isUserRejection) {
        console.log("User rejected sponsored transaction. Aborting fallback.");
        throw sponsorError;
      }
    }
  }

  // --- REGULAR TRANSACTION LOGIC ---
  const { SupraClient } = await import('supra-l1-sdk');
  const supraClient = await SupraClient.init(rpcUrl);
  let dynamicGasPrice = 100000;
  try {
    dynamicGasPrice = Number(await supraClient.getMinGasUnitPrice());
    console.log("DEBUG - Dynamic Gas Price for Starkey:", dynamicGasPrice);
  } catch (e) {
    console.warn("Could not fetch dynamic gas price, falling back to 100k", e);
  }

  const currentChainId = await provider.getChainId();
  if (String(currentChainId.chainId) !== chainIdStr) {
    console.log("DEBUG - Requesting network change from", currentChainId.chainId, "to", chainIdStr);
    await provider.changeNetwork({ chainId: chainIdStr });
  }

  const rawTxPayload = [
    account,
    0, // sequence number - Starkey handles this usually for non-sponsored
    moduleAddress,
    moduleName,
    functionName,
    runTimeParams,
    serializedParams,
    {},
  ];

  console.log("DEBUG - Starkey RawTxPayload:", JSON.stringify(rawTxPayload));

  const data = await provider.createRawTransactionData(rawTxPayload);
  console.log("DEBUG - Starkey Created Data:", data);
  console.log("DEBUG - Sending Transaction with ChainID:", chainIdStr);

  const txHash = await provider.sendTransaction({
    data,
    from: account,
    to: moduleAddress,
    chainId: chainIdStr,
    value: '0',
    maxGasAmount: '200000',
    gasUnitPrice: dynamicGasPrice.toString(),
  });
  return txHash;
}
