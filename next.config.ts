// next.config.ts

import type { NextConfig } from "next";
// Importa el plugin
import createNextIntlPlugin from 'next-intl/plugin';

// ¡LA CORRECCIÓN ESTÁ AQUÍ!
// Pásale la ruta a tu archivo de configuración de i18n.
const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/rpc/mainnet/:path*",
        destination: `${process.env.NEXT_PUBLIC_RPC_URL_MAINNET || "https://rpc-mainnet.supra.com"}/rpc/v1/:path*`,
      },
      {
        source: "/api/rpc/testnet/:path*",
        destination: `${process.env.NEXT_PUBLIC_RPC_URL_TESTNET || "https://rpc-testnet.supra.com"}/rpc/v1/:path*`,
      },
      {
        source: "/api/rpc-v2/mainnet/:path*",
        destination: `${process.env.NEXT_PUBLIC_RPC_URL_MAINNET || "https://rpc-mainnet.supra.com"}/rpc/v2/:path*`,
      },
      {
        source: "/api/rpc-v2/testnet/:path*",
        destination: `${process.env.NEXT_PUBLIC_RPC_URL_TESTNET || "https://rpc-testnet.supra.com"}/rpc/v2/:path*`,
      },
      {
        source: "/api/rpc-v3/mainnet/:path*",
        destination: `${process.env.NEXT_PUBLIC_RPC_URL_MAINNET || "https://rpc-mainnet.supra.com"}/rpc/v3/:path*`,
      },
      {
        source: "/api/rpc-v3/testnet/:path*",
        destination: `${process.env.NEXT_PUBLIC_RPC_URL_TESTNET || "https://rpc-testnet.supra.com"}/rpc/v3/:path*`,
      },
    ];
  },
  images: {
    minimumCacheTTL: 31536000, // 1 año de caché para imágenes IPFS (son inmutables)
    remotePatterns: [
      { protocol: 'https', hostname: 'w3s.link' }, // Gateway para web3.storage (path-based)
      { protocol: 'https', hostname: '**.w3s.link' }, // Gateway para web3.storage (subdomain-based)
      { protocol: 'https', hostname: 's2.coinmarketcap.com' }, // Logos de criptomonedas
      { protocol: 'https', hostname: 'arweave.net' },          // Imágenes desde Arweave
      { protocol: 'https', hostname: 'www.arweave.net' }, // 👈 agrega este
      { protocol: 'https', hostname: 'media.giphy.com' },        // GIFs para contenido dinámico
      { protocol: 'https', hostname: 'cloudflare-ipfs.com' },
      { protocol: 'https', hostname: 'ipfs.io' },
      { protocol: 'https', hostname: 'dweb.link' },
      { protocol: 'https', hostname: 'gateway.pinata.cloud' },
      { protocol: 'https', hostname: 'gateway.lighthouse.storage' },
      { protocol: 'https', hostname: 'ipfs.hoglet.xyz' },
    ],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

// Exporta la configuración final envuelta en el plugin
export default withNextIntl(nextConfig);