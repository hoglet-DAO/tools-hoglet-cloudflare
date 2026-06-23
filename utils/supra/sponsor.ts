import { BCS, HexString, TxnBuilderTypes } from 'supra-l1-sdk';
import { Buffer } from 'buffer'; // Node.js Buffer, assumed to be polyfilled or available in Next.js edge runtime

// Assuming these are available from your bcs.ts or can be imported
// import { serializeValueByType, serializeArgsFromTypes } from './bcs';

interface FeePayerAddressResponse {
    address: number[];
}

interface SignSponsorTransactionResponse {
    feePayerAuthenticatorHex: string;
    feePayerPublicKeyHex: string;
    error?: string;
}

const remove0xPrefix = (hexString: string) => {
    return hexString.startsWith("0x") ? hexString.slice(2) : hexString;
};

// --- CACHE OPTIMIZATION ---
// We cache the fee payer address in memory to avoid an extra HTTP roundtrip on every transaction.
let cachedFeePayerAddress: Uint8Array | null = null;
let feePayerFetchPromise: Promise<Uint8Array> | null = null;

export async function getFeePayerAddress(): Promise<Uint8Array> {
    if (cachedFeePayerAddress) return cachedFeePayerAddress;
    if (feePayerFetchPromise) return feePayerFetchPromise;

    feePayerFetchPromise = (async () => {
        try {
            const response = await fetch("/api/get-fee-payer-address");
            if (!response.ok) throw new Error("Failed to fetch fee payer address");
            
            const { address: feePayerAccountAddressArray }: FeePayerAddressResponse = await response.json();
            const addressBytes = new Uint8Array(feePayerAccountAddressArray);
            
            cachedFeePayerAddress = addressBytes;
            return addressBytes;
        } catch (error) {
            feePayerFetchPromise = null;
            throw error;
        }
    })();

    return feePayerFetchPromise;
}

interface SupraRawTransactionPayload {
    sender: string;
    sequenceNumber: bigint;
    moduleAddress: string;
    moduleName: string;
    functionName: string;
    typeArguments: string[]; // Generic type strings
    args: Uint8Array[];      // Already BCS serialized arguments
    walletType: string; // Add walletType for internal sponsor logic
    rpcUrl: string; // Add rpcUrl for SupraClient initialization
    chainId: string; // Add chainId for RawTransaction construction
}

export async function executeSponsoredTransactionFlow(
    provider: any,
    walletAddress: string,
    rawTxPayload: SupraRawTransactionPayload
): Promise<string> { // Returns transaction hash
    console.log("DEBUG - Starting executeSponsoredTransactionFlow");
    try {
        const { rpcUrl } = rawTxPayload;
        if (!rpcUrl) throw new Error("RPC URL is required for sponsored transactions.");

        // Dynamically import SupraClient to avoid bundling the heavy SDK in the initial chunk
        const { SupraClient } = await import('supra-l1-sdk');

        // 1. Fetch Fee Payer Address (Optimized with Cache)
        console.log("DEBUG - Fetching Fee Payer Address...");
        const feePayerAccountAddressUint8 = await getFeePayerAddress();
        console.log("DEBUG - Fee Payer Address Fetched.");
        const feePayerAccountAddress = new TxnBuilderTypes.AccountAddress(feePayerAccountAddressUint8);
        const feePayerAddressString = HexString.fromUint8Array(feePayerAccountAddressUint8).toString();
        
        // 2. Construct the RawTransaction object using supra-l1-sdk-core types
        const senderAccountAddress = TxnBuilderTypes.AccountAddress.fromHex(rawTxPayload.sender);
        
        // Use SupraClient to get the actual sequence number
        console.log("DEBUG - Initializing SupraClient with RPC:", rpcUrl);
        const supraClient = await SupraClient.init(rpcUrl);
        console.log("DEBUG - Fetching Account Info for sequence number...");
        const currentSequenceNumber = (await supraClient.getAccountInfo(walletAddress)).sequence_number;
        console.log("DEBUG - Sequence Number Fetched:", currentSequenceNumber);

        // Fetch dynamic gas price with fallback
        let gasUnitPrice = BigInt(100000); // New minimum floor as fallback
        try {
            gasUnitPrice = await supraClient.getMinGasUnitPrice();
            console.log("DEBUG - Dynamic Gas Price Fetched:", gasUnitPrice.toString());
        } catch (e) {
            console.warn("DEBUG - Failed to fetch dynamic gas price, using fallback 100,000", e);
        }

        const sequenceNumber = BigInt(currentSequenceNumber);

        const transactionPayloadBCS = new TxnBuilderTypes.TransactionPayloadEntryFunction(
            TxnBuilderTypes.EntryFunction.natural(
                `${rawTxPayload.moduleAddress}::${rawTxPayload.moduleName}`,
                rawTxPayload.functionName,
                rawTxPayload.typeArguments.map(typeStr => new TxnBuilderTypes.TypeTagParser(typeStr).parseTypeTag()),
                rawTxPayload.args // Pass args directly as they are already Uint8Array[]
            )
        );
        
        const rawTransaction = new TxnBuilderTypes.RawTransaction(
            senderAccountAddress,
            sequenceNumber, // Use the fetched sequence number
            transactionPayloadBCS,
            BigInt(50000), // Updated maxGas to prevent excessive fee reservations (reduced from 1M)
            gasUnitPrice,  // Dynamic gas price
            BigInt(Math.floor(Date.now() / 1000) + 600), // Expiration timestamp (10 minutes from now)
            new TxnBuilderTypes.ChainId(Number(rawTxPayload.chainId)) // Use rawTxPayload.chainId
        );

        // 3. Create Fee Payer Raw Transaction Object for backend
        const sponsorTransactionPayloadForBackend = new TxnBuilderTypes.FeePayerRawTransaction(
            rawTransaction,
            [], // Secondary signers (none for now)
            feePayerAccountAddress
        );

        // 4. Serialize to hex to send to backend
        const sponsorTransactionPayloadHex = HexString.fromUint8Array(BCS.bcsToBytes(sponsorTransactionPayloadForBackend)).toString();

        // 5. Request Fee Payer Signature (Backend)
        const signResponse = await fetch("/api/sign-sponsor-transaction", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sponsorTransactionPayloadHex }),
        });

        if (!signResponse.ok) {
            const errorData = await signResponse.json();
            throw new Error(errorData.error || "Failed to sign sponsor transaction by backend");
        }

        const { feePayerAuthenticatorHex, feePayerPublicKeyHex, error: signError }: SignSponsorTransactionResponse = await signResponse.json();

        if (signError) throw new Error(signError);
        if (!feePayerAuthenticatorHex || !feePayerPublicKeyHex) throw new Error("Fee payer authenticator or public key not received from backend");

        // 6. Construct Fee Payer Authenticator
        const feePayerPubKeyBytes = Buffer.from(remove0xPrefix(feePayerPublicKeyHex), "hex");
        const feePayerSignatureBytes = Buffer.from(remove0xPrefix(feePayerAuthenticatorHex), "hex");
        
        const feePayerAuthenticator = new TxnBuilderTypes.AccountAuthenticatorEd25519(
            new TxnBuilderTypes.Ed25519PublicKey(feePayerPubKeyBytes),
            new TxnBuilderTypes.Ed25519Signature(feePayerSignatureBytes)
        );

        // 7. Request User Signature (Wallet Provider) & Send via SDK
        let txHash: string | undefined;

        // Starkey flow for sponsored tx
        if (rawTxPayload.walletType === 'starkey') {
            // Prepare data for signing (FeePayerRawTransaction bytes)
            const txBytesToSign = BCS.bcsToBytes(sponsorTransactionPayloadForBackend);
            
            const networkData = await provider.getChainId();
            const chainIdVal = networkData.chainId;

            const txDataToSignForStarkey = {
                data: txBytesToSign, // Pass Uint8Array directly as it triggers the popup correctly
                from: walletAddress,
                to: rawTxPayload.moduleAddress,
                chainId: chainIdVal,
                value: '0',
            };

            console.log("DEBUG - Signing Transaction with Starkey:", txDataToSignForStarkey);

            // Sign only (do not send yet)
            let signatureResponse;
            try {
              signatureResponse = await provider.signTransaction(txDataToSignForStarkey);
              console.log("DEBUG - FULL SIGNATURE RESPONSE:", JSON.stringify(signatureResponse, null, 2));
            } catch (signError: any) {
                // Check for user rejection specifically from the provider's error
                const errorMessage = signError instanceof Error ? signError.message : String(signError);
                const isUserRejection = 
                    errorMessage.includes("User rejected") || 
                    errorMessage.includes("User cancelled") || 
                    (signError as any).code === 4001; // Common Aptos wallet rejection code
                
                if (isUserRejection) {
                    throw new Error("User rejected the signature for the sponsored transaction.");
                } else {
                    throw new Error(`Signing failed unexpectedly from provider: ${errorMessage}`);
                }
            }

            // Handle Starkey response structure (Ed25519 object or direct properties)
            let userPublicKeyHex = signatureResponse?.publicKey;
            let userSignatureHex = signatureResponse?.signature;

            if (!userPublicKeyHex && signatureResponse?.Ed25519) {
                userPublicKeyHex = signatureResponse.Ed25519.public_key;
                userSignatureHex = signatureResponse.Ed25519.signature;
            }

            if (!userPublicKeyHex || !userSignatureHex) {
                throw new Error("Signing response was incomplete or invalid for the sponsored transaction.");
            }

            // Construct User Authenticator
            const userPubKeyBytes = Buffer.from(remove0xPrefix(userPublicKeyHex), "hex");
            const userSignatureBytes = Buffer.from(remove0xPrefix(userSignatureHex), "hex");

            const sponsorTxSenderAuthenticator = new TxnBuilderTypes.AccountAuthenticatorEd25519(
                new TxnBuilderTypes.Ed25519PublicKey(userPubKeyBytes),
                new TxnBuilderTypes.Ed25519Signature(userSignatureBytes)
            );

            // 8. Send Multi-Agent Transaction using SupraClient
            // We already have supraClient initialized
            const sendResult = await supraClient.sendSponsorTransaction(
                feePayerAddressString,
                [], // secondary signer addresses
                rawTransaction, // The original RawTransaction
                sponsorTxSenderAuthenticator,
                feePayerAuthenticator,
                [], // secondary signer authenticators
                { enableWaitForTransaction: true, enableTransactionSimulation: true }
            );

            if (sendResult.txHash) {
                txHash = sendResult.txHash;
            } else {
                throw new Error("Failed to get transaction hash from sponsored submission.");
            }

        } else if (rawTxPayload.walletType === 'ribbit') {
            throw new Error("Sponsored transactions are not yet supported for Ribbit Wallet through this flow.");
        } else {
             throw new Error("Unsupported wallet type for sponsored transaction.");
        }
        
        if (!txHash) throw new Error("Transaction hash undefined.");
        return txHash;

    } catch (error) {
        console.error("Sponsored Transaction Flow Failed:", error);
        throw error;
    }
}
