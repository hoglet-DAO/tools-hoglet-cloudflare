// Ruta: src/app/constants/swapConstants.ts

export interface Token { // Exportar la interfaz
    symbol: string;
    module: string;
    contract: string;
    color: string;
    decimals: number;
  }
  
  export const tokens: Token[] = [ // Exportar la constante
    {
      symbol: 'SUPRA',
      module: '0x1',
      contract: '0x1::supra_coin::SupraCoin',
      color: 'bg-red-500',
      decimals: 8,
    },
    {
      symbol: 'SPIKE',
      module: '0x1::coin',
      contract: '0x0fec116479f1fd3cb9732cc768e6061b0e45b178a610b9bc23c2143a6493e794::memecoins::SPIKE',
      color: 'bg-yellow-500',
      decimals: 3,
    }
    // ...otros tokens si los tienes
  ];
  
  export const SWAP_ROUTER_ADDRESS = "0x0dc694898dff98a1b0447e0992d0413e123ea80da1021d464a4fbaf0265870d8"; // Exportar la constante
