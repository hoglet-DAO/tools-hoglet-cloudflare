import { useState, useCallback } from "react";
import { useSupraWallet } from "@/context/SupraWalletContext";

export interface TokenData {
  type: string;
  isLegacy: boolean;
  name: string;
  symbol: string;
  decimals: number;
  supply?: string;
  creator?: string;
  isWrapper?: boolean;
  wrappedLegacyCoin?: string;
}

export interface AdminCapability {
  tokenType: string;
  resourcePath: string;
  capabilities: {
    mint: boolean;
    burn: boolean;
    freeze: boolean;
    transfer: boolean;
  };
  faAddress?: string;
}

const hexToString = (hex: string) => {
  if (!hex) return "";
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
  let str = "";
  for (let i = 0; i < cleanHex.length; i += 2) {
    str += String.fromCharCode(parseInt(cleanHex.substring(i, i + 2), 16));
  }
  return str;
};

export function useTokenInspector() {
  const { rpcUrl } = useSupraWallet();
  const [isScanning, setIsScanning] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [ownedTokens, setOwnedTokens] = useState<TokenData[]>([]);
  const [adminCapabilities, setAdminCapabilities] = useState<AdminCapability[]>([]);
  const [renouncedTokens, setRenouncedTokens] = useState<string[]>([]);

  const scanAccount = useCallback(async (address: string) => {
    if (!address) return;
    setIsScanning(true);
    setHasScanned(false);
    setError(null);
    setOwnedTokens([]);
    setAdminCapabilities([]);
    setRenouncedTokens([]);

    try {
      // If the user pasted a full token type (e.g., 0x123...::module::struct), extract just the address
      const targetAddress = address?.includes("::") ? address.split("::")[0] : address;

      const isMainnet = rpcUrl ? rpcUrl?.includes("mainnet") : true;
      const proxyPathV3 = isMainnet ? "/api/rpc-v3/mainnet" : "/api/rpc-v3/testnet";
      
      let allResources: any[] = [];
      let cursor: string | null = null;
      let hasMore = true;
      let pagesFetched = 0;
      const MAX_PAGES = 20; // 2,000 resources max limit to prevent RPC ban and UI lag

      // Fetch all resources with pagination
      while (hasMore && pagesFetched < MAX_PAGES) {
        const url: string = `${proxyPathV3}/accounts/${targetAddress}/resources?count=100${cursor ? `&start=${cursor}` : ""}`;
        // console.log("Fetching resources from URL:", url);
        
        const res: Response = await fetch(url);
        
        if (!res.ok) {
          if (res.status === 404) {
             throw new Error("Account not found on-chain. It may not exist or have any resources.");
          }
          if (res.status === 429) {
             throw new Error("RPC Rate limit exceeded. The account might be too large, please try again later.");
          }
          throw new Error(`Failed to fetch resources: ${res.statusText}`);
        }

        const data = await res.json();
        const resources = data.data || data; // handle unwrapped or wrapped response
        allResources = [...allResources, ...resources];

        cursor = res.headers.get("x-supra-cursor");
        // console.log(`Fetched ${resources?.length} resources. Next cursor:`, cursor);
        
        if (!cursor || resources.length === 0) {
          hasMore = false;
        }

        pagesFetched++;

        // Add a small delay between requests to keep the RPC happy
        if (hasMore && pagesFetched < MAX_PAGES) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      if (pagesFetched >= MAX_PAGES) {
        console.warn(`Reached maximum pagination limit (${MAX_PAGES} pages). Only the first ${allResources.length} resources will be analyzed.`);
        // Note: You could set a warning state here if you want to notify the user in the UI.
      }
      
      // console.log("Total resources fetched:", allResources.length);

      const detectedTokens: TokenData[] = [];
      const detectedAdminCaps: AdminCapability[] = [];
      const detectedRenouncedFAs: string[] = [];

      allResources.forEach((resource: any) => {
        const rType = resource.type;
        const data = resource.data;

        // 1. Detect Legacy Coins
        if (rType?.includes("::coin::CoinInfo")) {
          const typeMatch = rType.match(/<(.+)>/);
          const fullType = typeMatch ? typeMatch[1] : rType;
          
          detectedTokens.push({
            type: fullType,
            isLegacy: true,
            name: data.name,
            symbol: data.symbol,
            decimals: data.decimals,
            supply: data.supply?.vec?.[0]?.integer?.vec?.[0]?.value,
          });
        }

        // 2. Detect Fungible Assets (FA)
        if (rType?.endsWith("::fungible_asset::Metadata")) {
          let isFrameworkWrapper = false;
          let extractedLegacyCoin: string | undefined = undefined;

          allResources.forEach((r: any) => {
            if (r.type?.endsWith("::coin::PairedCoinType")) {
              isFrameworkWrapper = true;
              const typeData = r.data?.type || r.data;
              if (typeData && typeData.account_address) {
                const mod = hexToString(typeData.module_name);
                const str = hexToString(typeData.struct_name);
                extractedLegacyCoin = `${typeData.account_address}::${mod}::${str}`;
              }
            } else if (r.type?.endsWith("::coin::PairedFungibleAssetRefs")) {
              isFrameworkWrapper = true;
            }
          });

          detectedTokens.push({
            type: targetAddress, // the resource is on the object address
            isLegacy: false,
            name: data.name,
            symbol: data.symbol,
            decimals: data.decimals,
            supply: data.supply?.vec?.[0]?.integer?.vec?.[0]?.value,
            creator: data.creator,
            isWrapper: isFrameworkWrapper,
            wrappedLegacyCoin: extractedLegacyCoin,
          });
        }

        // 3. Detect Admin Capabilities (Refs)
        // We scan the JSON structure recursively to find capability fields and check if they are actually active (not Option::none)
        let hasMint = false;
        let hasBurn = false;
        let hasFreeze = false;
        let hasTransfer = false;
        
        // Tracking strictly renounced refs (Option::none) for FA proof
        let renouncedMint = false;
        let renouncedBurn = false;
        let renouncedTransfer = false;
        let renouncedFreeze = false;

        let extractedFaAddress: string | undefined = undefined;

        // Precompile regexes for ultra-fast matching on massive JSONs
        const mintRegex = /mint_?ref|mint_?cap(ability)?/i;
        const burnRegex = /burn_?ref|burn_?cap(ability)?/i;
        const freezeRegex = /freeze_?ref|freeze_?cap(ability)?/i;
        const transferRegex = /transfer_?ref/i;

        const checkCapabilities = (obj: any, depth: number = 0) => {
          // Safety limits to prevent Maximum Call Stack Size Exceeded or UI freezes on huge JSONs
          if (!obj || typeof obj !== 'object' || depth > 10) return;
          
          // Fungible Asset keys always store the target object address inside `metadata.inner`
          if (obj.metadata && typeof obj.metadata.inner === 'string') {
            extractedFaAddress = obj.metadata.inner;
          }

          for (const key in obj) {
            const val = obj[key];
            
            const isMintKey = mintRegex.test(key);
            const isBurnKey = burnRegex.test(key);
            const isFreezeKey = freezeRegex.test(key);
            const isTransferKey = transferRegex.test(key);

            if (isMintKey || isBurnKey || isFreezeKey || isTransferKey) {
              // Check if it's "Option::none", which is represented as { vec: [] } or null
              const isOptionNone = val === null || (val && typeof val === 'object' && Array.isArray(val.vec) && val.vec.length === 0);
              
              if (!isOptionNone) {
                if (isMintKey) hasMint = true;
                if (isBurnKey) hasBurn = true;
                if (isFreezeKey) hasFreeze = true;
                if (isTransferKey) hasTransfer = true;
                
                // If the Ref itself has metadata.inner (another common pattern)
                if (val && val.metadata && typeof val.metadata.inner === 'string') {
                  extractedFaAddress = val.metadata.inner;
                }
              } else {
                // If it is Option::none, track it for Renounce Proof
                if (isMintKey) renouncedMint = true;
                if (isBurnKey) renouncedBurn = true;
                if (isFreezeKey) renouncedFreeze = true;
                if (isTransferKey) renouncedTransfer = true;
              }
            } else if (typeof val === 'object' && val !== null) {
              // Only recurse if it's actually an object to save CPU cycles
              checkCapabilities(val, depth + 1);
            }
          }
        };

        checkCapabilities(data);

        if (hasMint || hasBurn || hasFreeze || hasTransfer) {
          detectedAdminCaps.push({
            tokenType: extractedFaAddress || (rType?.includes('<') ? rType.split('<')[1].replace('>', '') : "Unknown Token"),
            resourcePath: rType,
            capabilities: {
              mint: hasMint,
              burn: hasBurn,
              freeze: hasFreeze,
              transfer: hasTransfer
            },
            faAddress: extractedFaAddress
          });
        }
        
        // If we found ALL 4 core refs strictly set to Option::none, and no active refs, this FA is 100% verified safe
        if (renouncedMint && renouncedBurn && renouncedTransfer && renouncedFreeze && !hasMint && !hasBurn && !hasTransfer && !hasFreeze) {
           // We use extractedFaAddress if available, otherwise fallback to targetAddress (assuming the FA metadata is at this object)
           const faToRenounce = extractedFaAddress || targetAddress;
           if (!detectedRenouncedFAs.includes(faToRenounce)) {
             detectedRenouncedFAs.push(faToRenounce);
           }
        }
      });

      setOwnedTokens(detectedTokens);
      setAdminCapabilities(detectedAdminCaps);
      setRenouncedTokens(detectedRenouncedFAs);

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to scan account.");
    } finally {
      setIsScanning(false);
      setHasScanned(true);
    }
  }, [rpcUrl]);

  return {
    isScanning,
    hasScanned,
    error,
    ownedTokens,
    adminCapabilities,
    renouncedTokens,
    scanAccount,
    network: rpcUrl ? (rpcUrl?.includes("mainnet") ? "mainnet" : "testnet") : "mainnet",
  };
}
