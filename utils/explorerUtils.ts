// src/app/utils/explorerUtils.ts

export type ExplorerEntityType = 'address' | 'object' | 'transaction' | 'token'; // Añade más según necesites

export interface ExplorerConfig {
  baseUrl: string;
  pathTemplates: {
    [key in ExplorerEntityType]?: string; // e.g., "address/{hash}", "object/{hash}"
  };
  networkQueryParam?: (network: string) => string | undefined; // Función para generar el query param si es necesario
}

// Mapeo de redes a sus configuraciones de explorador
const EXPLORER_CONFIGS: Record<string, ExplorerConfig> = {
  "supra-mainnet": { // O como se llame tu red en `pool.network`
    baseUrl: 'https://suprascan.io', // o explorer.sui.io
    pathTemplates: {
      object: 'object/{hash}',
      address: 'address/{hash}', // En Sui, las direcciones también son objetos, pero a veces se listan bajo /address
      transaction: 'tx/{hash}',
    },
    // networkQueryParam: (network) => `network=${network.toLowerCase().replace('sui_', '')}` // Suiscan no lo necesita en la URL base
  },
  "supra-testnet": {
    baseUrl: 'https://testnet.suprascan.io',
    pathTemplates: {
      object: 'object/{hash}',
      address: 'address/{hash}',
      transaction: 'tx/{hash}',
    },
  },
  manta_pacific_mainnet: { // Asumiendo que así se llama tu red
    baseUrl: 'https://pacific-explorer.manta.network',
    pathTemplates: {
      address: 'address/{hash}',
      token: 'token/{hash}', // Si tienen una ruta específica para tokens
      transaction: 'tx/{hash}',
    },
  },
  // ... otras redes ...
  default: { // Fallback genérico
    baseUrl: 'https://your-default-explorer.com',
    pathTemplates: {
      address: 'address/{hash}',
    },
  }
};

export const getExplorerUrl = (
  network: string, 
  entityType: ExplorerEntityType, 
  hash: string
): string | null => {
  const networkKey = network.toLowerCase(); // Normalizar
  const config = EXPLORER_CONFIGS[networkKey] || EXPLORER_CONFIGS['default'];
  
  const pathTemplate = config.pathTemplates[entityType];
  if (!pathTemplate || !hash) {
    return null; 
  }

  let url = `${config.baseUrl}/${pathTemplate.replace('{hash}', hash)}`;
  
  if (config.networkQueryParam) {
    const query = config.networkQueryParam(network);
    if (query) {
      url += `?${query}`;
    }
  }
  return url;
};

export const getHolderAddressUrl = (address: string): string => {
  return `https://suprascan.io/address/${address}/f?tab=tokens&pageNo=1&rows=10&tokenType=fa`;
};
