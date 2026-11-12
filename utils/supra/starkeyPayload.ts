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
        errorMessage?.includes("Rejected by user") ||
        errorMessage?.includes("User rejected") ||
        errorMessage?.includes("User cancelled") ||
        errorMessage?.includes("User denied") ||
        errorMessage?.includes("User failed to sign") ||
        errorMessage?.includes("Signing response was incomplete") ||
        errorMessage?.includes("4001") ||
        (sponsorError as any).code === 4001;
      
      if (isUserRejection) {
        console.log("User rejected sponsored transaction. Aborting fallback.");
        throw sponsorError;
      }
    }
  }

  // --- REGULAR TRANSACTION LOGIC ---
  const { SupraClient, BCS, HexString, TxnBuilderTypes } = await import('supra-l1-sdk');
  const supraClient = await SupraClient.init(rpcUrl);
  let gasUnitPrice = BigInt(100000);
  try {
    gasUnitPrice = BigInt(await supraClient.getMinGasUnitPrice());
    console.log("DEBUG - Dynamic Gas Price for Starkey:", gasUnitPrice.toString());
  } catch (e) {
    console.warn("Could not fetch dynamic gas price, falling back to 100k", e);
  }

  const currentChainId = await provider.getChainId();
  if (String(currentChainId.chainId) !== chainIdStr) {
    console.log("DEBUG - Requesting network change from", currentChainId.chainId, "to", chainIdStr);
    await provider.changeNetwork({ chainId: chainIdStr });
  }

  // StarKey's `createRawTransactionData` is deprecated: the transaction is built here with the SDK
  // and handed over as unprefixed hex, which is what the extension validates before prompting.
  const accountInfo = await supraClient.getAccountInfo(account);
  const rawTransaction = new TxnBuilderTypes.RawTransaction(
    TxnBuilderTypes.AccountAddress.fromHex(account),
    BigInt(accountInfo.sequence_number),
    new TxnBuilderTypes.TransactionPayloadEntryFunction(
      TxnBuilderTypes.EntryFunction.natural(
        `${moduleAddress}::${moduleName}`,
        functionName,
        (runTimeParams || []).map((type: string) =>
          new TxnBuilderTypes.TypeTagParser(type).parseTypeTag()
        ),
        serializedParams
      )
    ),
    BigInt(200000),
    gasUnitPrice,
    BigInt(Math.floor(Date.now() / 1000) + 600),
    new TxnBuilderTypes.ChainId(Number(chainIdStr))
  );

  const data = HexString.fromUint8Array(BCS.bcsToBytes(rawTransaction)).noPrefix();
  console.log("DEBUG - Sending Starkey transaction, chain", chainIdStr);

  const result: any = await provider.sendTransaction({
    data,
    from: account,
    to: moduleAddress,
    chainId: chainIdStr,
    value: '0',
    // Return as soon as the hash exists; the UI reports "submitted", not "executed".
    options: { waitForTransaction: false },
  });

  // Versions of the extension return a hash, `{ hash }` or an error object.
  const txHash = typeof result === 'string' ? result : result?.hash ?? result?.txHash;
  if (!txHash) {
    const reason = result?.error || result?.message || JSON.stringify(result);
    throw new Error(`StarKey returned no transaction hash: ${reason}`);
  }
  return txHash;
}
