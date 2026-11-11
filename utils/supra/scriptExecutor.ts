import { BCS, HexString, SupraClient, TxnBuilderTypes } from "supra-l1-sdk";

export interface ScriptArgInput {
  id: string;
  type: "u8" | "u32" | "u64" | "u128" | "u256" | "bool" | "address" | "u8_vector";
  value: string;
}

/**
 * Parses user input strings into TxnBuilderTypes.TransactionArgument objects
 * suitable for Move script arguments.
 */
export function parseScriptArgument(type: string, val: string): any {
  const cleanVal = val.trim();
  switch (type) {
    case "u8":
      return new TxnBuilderTypes.TransactionArgumentU8(parseInt(cleanVal, 10));
    case "u32":
      return new TxnBuilderTypes.TransactionArgumentU32(parseInt(cleanVal, 10));
    case "u64":
      return new TxnBuilderTypes.TransactionArgumentU64(BigInt(cleanVal));
    case "u128":
      return new TxnBuilderTypes.TransactionArgumentU128(BigInt(cleanVal));
    case "u256":
      return new TxnBuilderTypes.TransactionArgumentU256(BigInt(cleanVal));
    case "bool":
      return new TxnBuilderTypes.TransactionArgumentBool(cleanVal.toLowerCase() === "true" || cleanVal === "1");
    case "address": {
      const addrHex = cleanVal.startsWith("0x") ? cleanVal : `0x${cleanVal}`;
      return new TxnBuilderTypes.TransactionArgumentAddress(
        TxnBuilderTypes.AccountAddress.fromHex(addrHex)
      );
    }
    case "u8_vector": {
      if (cleanVal.startsWith("0x")) {
        const bytes = HexString.ensure(cleanVal).toUint8Array();
        return new TxnBuilderTypes.TransactionArgumentU8Vector(bytes);
      }
      const utf8Bytes = new TextEncoder().encode(cleanVal);
      return new TxnBuilderTypes.TransactionArgumentU8Vector(utf8Bytes);
    }
    default:
      throw new Error(`Unsupported script argument type: ${type}`);
  }
}

/**
 * Builds and signs a Move script payload transaction, sending it through SupraClient.
 */
export async function sendScriptTransaction({
  provider,
  account,
  rpcUrl,
  scriptBytecodeHex,
  typeArgs = [],
  args = [],
}: {
  provider: any;
  account: string;
  rpcUrl: string;
  scriptBytecodeHex: string;
  typeArgs?: string[];
  args?: { type: string; value: string }[];
}): Promise<string> {
  const supraClient = await SupraClient.init(rpcUrl);

  const cleanHex = scriptBytecodeHex.startsWith("0x")
    ? scriptBytecodeHex.slice(2)
    : scriptBytecodeHex;
  const scriptBytecode = new Uint8Array(Buffer.from(cleanHex, "hex"));

  // Parse type arguments (struct tags)
  const parsedTypeTags: any[] = typeArgs.filter(Boolean).map((tagStr) => {
    const cleanTag = tagStr.trim();
    if (cleanTag === "bool") return new TxnBuilderTypes.TypeTagBool();
    if (cleanTag === "u8") return new TxnBuilderTypes.TypeTagU8();
    if (cleanTag === "u64") return new TxnBuilderTypes.TypeTagU64();
    if (cleanTag === "u128") return new TxnBuilderTypes.TypeTagU128();
    if (cleanTag === "address") return new TxnBuilderTypes.TypeTagAddress();
    return new TxnBuilderTypes.TypeTagStruct(
      TxnBuilderTypes.StructTag.fromString(cleanTag)
    );
  });

  // Parse argument values into TransactionArgument instances
  const parsedArgs = (args || []).map((a) => parseScriptArgument(a.type, a.value));

  const senderAddr = new HexString(account);
  const accountInfo = await supraClient.getAccountInfo(senderAddr);
  const sequenceNumber = BigInt(accountInfo.sequence_number);

  // Build the serialized raw transaction object
  const rawTxnBytes = await supraClient.createSerializedScriptTxPayloadRawTxObject(
    senderAddr,
    sequenceNumber,
    scriptBytecode,
    parsedTypeTags,
    parsedArgs
  );

  // Deserialize rawTxn to compute signature message
  const rawTxn = TxnBuilderTypes.RawTransaction.deserialize(
    new BCS.Deserializer(rawTxnBytes)
  );

  const sigMessage = SupraClient.getSupraTransactionSignatureMessage(rawTxn);
  const sigMessageHex = `0x${Buffer.from(sigMessage).toString("hex")}`;

  // Request signature from StarKey or provider
  let signatureHex = "";
  let pubKeyHex = "";

  if (typeof provider?.signHexMessage === "function") {
    const res = await provider.signHexMessage(sigMessageHex);
    signatureHex = res?.signature || res;
    pubKeyHex = res?.publicKey || provider.publicKey || "";
  } else if (typeof provider?.signMessage === "function") {
    const res = await provider.signMessage({ message: sigMessageHex, nonce: "hoglet-script" });
    signatureHex = res?.signature || res;
    pubKeyHex = res?.publicKey || "";
  } else {
    throw new Error("Connected wallet does not support message signing");
  }

  if (!pubKeyHex && provider?.publicKey) {
    pubKeyHex = provider.publicKey;
  }

  const cleanSig = signatureHex.startsWith("0x") ? signatureHex.slice(2) : signatureHex;
  const cleanPubKey = pubKeyHex.startsWith("0x") ? pubKeyHex.slice(2) : pubKeyHex;

  // Dispatch signed transaction
  const txResult = await supraClient.sendTxUsingSerializedRawTransactionAndSignature(
    new HexString(cleanPubKey),
    new HexString(cleanSig),
    rawTxnBytes
  );

  return txResult?.txHash || (typeof txResult === "string" ? txResult : JSON.stringify(txResult));
}
