//src/app/utils/types.ts
export interface NFT {
    id: {
      creator: string;
      collection: string;
      name: string;
      property_version: string;
    };
    amount: string;
    uri: string;
    // Opcional: puedes añadir metadata aquí si la precargas o la pasas
    metadata?: {
       name: string;
       image: string;
       description?: string;
    },
  }

  export interface NftForBoostDetails { // Definir este tipo si no lo tienes ya
    collectionOwner: string;
    collectionName: string;
    tokenName: string;
    propertyVersion: string; // o number
  }
  
  export interface NftToken {
    token: {
      collection: { creator: string; name: string };
      name: string;
      propertyVersion: string;
      uri: string;
      cachedUri?: {
        name?: string;
        image?: string;
        description?: string;
        attributes?: Array<{ trait_type: string; value: string }>;
        external_url?: string;
      } | null;
    };
    balance: string;
  }

  export interface TokenInfo {
    id: string;
    network: string;
    name: string | null;
    symbol: string | null;
    decimals: number | null;
    iconUri: string | null;
    projectUri?: string | null;
    originalCoinType?: string;
    metadataStandard?: string;
    verified: boolean;
  }
  
  export interface CreatorInfo {
    walletAddress: string;
    network: string;
    username: string | null;
  }

  export interface EnrichedStakingPool {
    id: number;
    network: string;
    creatorAddress: string;
    stakeTokenAddress: string;
    rewardTokenAddress: string;
    isDynamicPool: boolean;
    initialRewardPerSec: string;
    initialEndTimestamp: string;
    boostEnabled: boolean;
    boostConfigCollectionOwner?: string | null;
    boostConfigCollectionName?: string | null;
    boostConfigPercent?: string | null; // Porcentaje de boost (u128 del evento, guardado como String)
                                      // Podrías convertirlo a number en el frontend si es seguro y necesario para UI
    rewardPerSec: string;
    accumReward: string;
    lastUpdatedTimestamp: string;
    startTimestamp: string;
    endTimestamp: string;
    totalBoosted: string;
    verified: boolean;
    displayOrder?: number | null;
    emergencyLocked: boolean;
    stakesClosed: boolean;
    totalStakedAmount: string;
    createdAt: string;
    cachedApy?: string | null;
    poolType?: string | null;
    cachedTvlUsd?: string | null;
    stakersCount?: number | null;
    
    stakeToken: TokenInfo;
    rewardToken: TokenInfo;
    creator: CreatorInfo | null;
  
    userStakedAmount?: string | null;
  }
  
  export interface AmmPoolInfo {
    id?: number; // Add optional ID for deep linking
    pair: string;
    network: string;
    verified: boolean;
    creator: string;
    displayOrder?: number;
    createdAt: string;
    version: string; // O el tipo Enum correcto si tienes uno
    token0: TokenInfo | null;
    token1: TokenInfo | null;
    reserve0?: string;
    reserve1?: string;
    tvlUsd?: string;
    volumeToken0_24h?: string;
    volumeToken1_24h?: string;
    volumeUsd24h?: string;
    volumeUsd7d?: string;
    volumeUsd30d?: string;
    feesUsd24h?: string;
    feesUsd7d?: string;
    feesUsd30d?: string;
    lpFeePercent?: string;
    apr24h?: string;
    apr7d?: string;
    apyCalculated?: string;
    lastStatsUpdate?: string;
  }
  
  
  
  // Interfaz para la información de paginación
  export interface PaginationInfo {
    page: number;
    limit: number;
    totalItems: number;
  }
  
  // Interfaz para la respuesta completa de la API de AMM pools
  export interface GetAmmPoolsApiResponse {
    data: AmmPoolInfo[];
    pagination?: PaginationInfo; // Usando la interfaz reutilizable
  }

  // src/types/protocol.ts  (o src/interfaces/protocol.ts)

// Basado en tu schema de Prisma, ajusta los tipos si es necesario para Supabase
// (ej. Decimal a string o number, DateTime a string)
export interface ProtocolStatEntry {
  id: number;
  network: string;
  timestamp: string; // Las fechas suelen venir como strings ISO desde la API
  totalTvlUsd?: string | null; // Los decimales pueden venir como string para precisión
  ammTvlUsd?: string | null;
  virtualPoolsTvlUsd?: string | null;
  stakingTvlUsd?: string | null;
  totalVolume24hUsd?: string | null;
  ammVolume24hUsd?: string | null;
  totalUniqueUsers?: number | null;
  totalFeesEarnedUsd24h?: string | null;
  // Asegúrate de que coincida con lo que realmente devuelve Supabase
  // y con las columnas que seleccionas en tu API.
}


export type WalletType = 'starkey' | 'ribbit';

export interface IWalletAccount {
  id?: string;
  username: string;
  avatar?: string;
  isAccountImported?: string;
  address: string;
  networkEnvironment?: string;
  currentNetwork?: {
    walletAddress: string;
    networkName: string;
    rpcNetworkName: string;
    chainId: string;
  };
}

export interface IWalletBalance {
  formattedBalance: string;
  displayUnit: string;
}

export interface WalletCapabilities {
  signMessage: boolean;
  accountSwitching: boolean;
  networkSwitching: boolean;
  rawTransactions: boolean;
  eventListeners: boolean;
  tokenRevalidation: boolean;
}

export interface AvailableWallet {
  type: WalletType;
  name: string;
  isInstalled: boolean;
  capabilities: WalletCapabilities;
}

export interface UserProfile {
  address: string;
  username: string | null;
  profileImage: string | null;
}

export type SlippageRiskLevel = 'none' | 'low' | 'medium' | 'high' | 'extreme';
