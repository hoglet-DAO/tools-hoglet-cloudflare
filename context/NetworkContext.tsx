//source @/context/NetworkContext.tsx
'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation'; // Importamos todo de aquí
import { trace } from '@/lib/debug';

// Define tipos de red más específicos
export type NetworkType =
  | 'supra-mainnet'
  | 'supra-testnet'
  | 'aptos-mainnet'
  | 'aptos-testnet' // Añadir si necesitas Aptos testnet
  | 'move-mainnet' // Añadimos la red Move específica
  | 'move-testnet'; // Añadimos la red Move específica

// Define una red por defecto si no hay nada en la URL
export const DEFAULT_NETWORK: NetworkType = 'supra-mainnet'; // O la que prefieras

// Define un mapeo para validación (opcional pero útil)
export const VALID_NETWORKS: NetworkType[] = [
  'supra-mainnet',
  'supra-testnet',
  'aptos-mainnet',
  'aptos-testnet',
  'move-mainnet', // Añadimos la red Move específica
  'move-testnet'
];

/**
 * Where the chosen network is remembered between navigations.
 *
 * The `?network=` query parameter alone is not enough: internal links (sidebar, dashboard cards)
 * navigate to bare paths, so every navigation used to fall back to `DEFAULT_NETWORK` and silently
 * drag the user back to mainnet. The parameter still wins when present, which keeps shared links
 * working; otherwise this is the fallback.
 */
const NETWORK_STORAGE_KEY = 'hoglet-network';

function readStoredNetwork(): NetworkType | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(NETWORK_STORAGE_KEY);
    return stored && VALID_NETWORKS.includes(stored as NetworkType)
      ? (stored as NetworkType)
      : null;
  } catch {
    return null;
  }
}

function storeNetwork(network: NetworkType): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(NETWORK_STORAGE_KEY, network);
  } catch {
    /* private mode / storage disabled: the query parameter still works */
  }
}

interface NetworkContextType {
  network: NetworkType;
  setNetwork: (network: NetworkType) => void;
  isSupraNetwork: boolean;
  isAptosNetwork: boolean;
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

// --- ¡NUEVO COMPONENTE INTELIGENTE! ---
function NetworkStateInitializer({ 
  currentNetwork, 
  setNetworkState 
}: { 
  currentNetwork: NetworkType; 
  setNetworkState: (n: NetworkType) => void; 
}) {
  const searchParams = useSearchParams();

  // Este efecto se ejecuta SOLO en el cliente y sincroniza el estado con la URL
  useEffect(() => {
    const urlNetwork = searchParams.get('network') as string | null;
    const explicit =
      urlNetwork && VALID_NETWORKS.includes(urlNetwork as NetworkType)
        ? (urlNetwork as NetworkType)
        : null;

    // Resolution order: explicit ?network= (and remember it) -> the remembered choice -> default.
    // Falling straight to DEFAULT_NETWORK when the parameter is absent is what reset the network on
    // every internal navigation.
    const resolved = explicit ?? readStoredNetwork() ?? DEFAULT_NETWORK;

    if (explicit) storeNetwork(explicit);

    trace('[network] resolve', { urlNetwork, resolved, currentNetwork });

    if (resolved !== currentNetwork) {
      setNetworkState(resolved); // Cambia SOLO el estado interno, no hace push al router
    }
  }, [searchParams, setNetworkState, currentNetwork]);

  return null; // Este componente no renderiza nada, solo ejecuta lógica.
}


export const NetworkProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [network, setNetworkState] = useState<NetworkType>(DEFAULT_NETWORK);
  const router = useRouter();
  const pathname = usePathname();

  const changeNetwork = useCallback((newNetwork: NetworkType) => {
    if (!VALID_NETWORKS?.includes(newNetwork)) return;

    // Remember the choice so bare internal links keep it.
    storeNetwork(newNetwork);

    // NO actualizamos el estado local aquí para evitar conflictos con la URL.
    // Dejamos que el router cambie la URL, y NetworkStateInitializer 
    // detectará el cambio y actualizará el estado interno.
    const currentParams = new URLSearchParams(window.location.search);
    if (newNetwork === DEFAULT_NETWORK) {
      currentParams.delete('network');
    } else {
      currentParams.set('network', newNetwork);
    }
    const search = currentParams.toString();
    const query = search ? `?${search}` : "";
    router.push(`${pathname}${query}`, { scroll: false });
  }, [pathname, router]);

  const isSupraNetwork = network.startsWith('supra-');
  const isAptosNetwork = network.startsWith('aptos-') || network.startsWith('move-');

  return (
    <NetworkContext.Provider
      value={{
        network,
        setNetwork: changeNetwork,
        isSupraNetwork,
        isAptosNetwork,
      }}
    >
      {/* ¡LA MAGIA! Envolvemos el inicializador en Suspense */}
      <Suspense fallback={null}>
        <NetworkStateInitializer currentNetwork={network} setNetworkState={setNetworkState} />
      </Suspense>
      {children}
    </NetworkContext.Provider>
  );
};


export const useNetwork = () => {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error('useNetwork must be used within a NetworkProvider');
  }
  return context;
};
