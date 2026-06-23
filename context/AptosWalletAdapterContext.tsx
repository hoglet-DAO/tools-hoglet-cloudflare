"use client";

import { PropsWithChildren, useEffect, useState, useMemo } from "react";
import { useNetwork, NetworkType } from "./NetworkContext"; // Importa el contexto de red

// Este componente ahora es un WRAPPER que configura el Provider de la librería dinámicamente
export const AptosWalletProviderWrapper = ({ children }: PropsWithChildren) => {
  const { network, isAptosNetwork } = useNetwork();
  const [modules, setModules] = useState<any>(null);

  useEffect(() => {
    // Importación dinámica para evitar incluir el SDK pesado en el bundle del servidor
    const loadModules = async () => {
        try {
            const [
                { AptosWalletAdapterProvider },
                { AptosConfig, Network },
                { PontemWallet },
                { PetraWallet }
            ] = await Promise.all([
                import("@aptos-labs/wallet-adapter-react"),
                import("@aptos-labs/ts-sdk"),
                import("@pontem/wallet-adapter-plugin"),
                import("petra-plugin-wallet-adapter")
            ]);

            setModules({
                AptosWalletAdapterProvider,
                AptosConfig,
                Network,
                PontemWallet,
                PetraWallet
            });
        } catch (error) {
            console.error("Failed to load Aptos modules:", error);
        }
    };

    loadModules();
  }, []);

  // Lógica de configuración memoizada (solo se ejecuta cuando los módulos están cargados)
  const aptosConfig = useMemo(() => {
    if (!modules) return null;

    const { AptosConfig, Network } = modules;

    // Define las URLs para cada red Aptos/Move que soportes
    // Movemos esto dentro para acceder al Enum 'Network' cargado dinámicamente
    const APTOS_CONFIGS: Partial<Record<NetworkType, { network: any; fullnode: string; faucet?: string; networkName?: string }>> = {
      'aptos-testnet': {
        network: Network.TESTNET,
        fullnode: 'https://fullnode.testnet.aptoslabs.com/v1',
        faucet: 'https://faucet.testnet.aptoslabs.com',
      },
      'aptos-mainnet': {
        network: Network.MAINNET,
        fullnode: 'https://fullnode.mainnet.aptoslabs.com/v1',
      },
      'move-testnet': {
        network: Network.CUSTOM, 
        networkName: 'move-testnet',
        fullnode: 'https://testnet.bardock.movementnetwork.xyz/v1',
        faucet: 'https://faucet.testnet.bardock.movementnetwork.xyz/'
      },
      'move-mainnet': {
        network: Network.MAINNET, // Fallback o correcto según tu lógica
        networkName: 'move-mainnet',
        fullnode: 'https://mainnet.movementnetwork.xyz/v1',
      },
    };

    const configData = APTOS_CONFIGS[network];

    if (!configData) {
        const fallbackConfig = APTOS_CONFIGS['aptos-testnet'];
        if (!fallbackConfig) throw new Error("Fallback Aptos config not found!");
        return new AptosConfig(fallbackConfig);
    }

    return new AptosConfig(configData);

  }, [network, isAptosNetwork, modules]);


  if (!modules || !aptosConfig) {
      // Renderizar hijos directamente mientras carga (SSR / Initial Client)
      return <>{children}</>;
  }

  const { AptosWalletAdapterProvider, PetraWallet, PontemWallet } = modules;

  return (
    <AptosWalletAdapterProvider
      key={`${network}-${isAptosNetwork}`}
      dappConfig={aptosConfig}
      optInWallets={["Petra", "Pontem"]} // Aseguramos que los nombres coincidan con los plugins si es necesario
      autoConnect={false}
      disableTelemetry={true}
      onError={(error: any) => {
        console.error("[AptosWrapper onError] Aptos Adapter Error:", error?.message || error);
      }}
    >
      {children}
    </AptosWalletAdapterProvider>
  );
};

