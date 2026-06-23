//source @/context/NetworkContext.tsx
'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation'; // Importamos todo de aquí

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
    const newNetwork = (urlNetwork && VALID_NETWORKS.includes(urlNetwork as NetworkType))
      ? urlNetwork as NetworkType
      : DEFAULT_NETWORK;

    if (newNetwork !== currentNetwork) {
      setNetworkState(newNetwork); // Cambia SOLO el estado interno, no hace push al router
    }
  }, [searchParams, setNetworkState, currentNetwork]);

  return null; // Este componente no renderiza nada, solo ejecuta lógica.
}


export const NetworkProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [network, setNetworkState] = useState<NetworkType>(DEFAULT_NETWORK);
  const router = useRouter();
  const pathname = usePathname();

  const changeNetwork = useCallback((newNetwork: NetworkType) => {
    if (!VALID_NETWORKS.includes(newNetwork)) return;

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
