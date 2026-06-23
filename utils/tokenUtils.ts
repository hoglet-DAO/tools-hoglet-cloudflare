// Ruta: src/app/utils/tokenUtils.ts

import { Token, tokens as defaultTokens } from "@/constants/swapConstants"; // Importar Token y la lista de tokens

// Hacemos que getTokenByContract pueda tomar una lista de tokens opcional,
// o usar la lista por defecto si no se provee.
export const getTokenByContract = (
  contractAddress: string,
  tokensList: Token[] = defaultTokens // Usar la lista importada como default
): Token | undefined => {
  return tokensList.find(token => token.contract === contractAddress);
};

export const getFormattedBalance = (
  balanceResult: any,
  tokenContract: string,
  tokensList: Token[] = defaultTokens // Usar la lista importada como default
): string => {
  const token = getTokenByContract(tokenContract, tokensList); // Pasar tokensList
  const decimals = token?.decimals ?? 8;

  if (!balanceResult?.result?.[0] && balanceResult?.result?.[0] !== 0 && balanceResult?.result?.[0] !== BigInt(0)) {
     // Considerar 0 como un balance válido, no solo !balanceResult...
     // Si es null o undefined, retornar "0.00"
     if (balanceResult?.result?.[0] === null || balanceResult?.result?.[0] === undefined) {
         return (0).toFixed(2);
     }
  }

  // Si balanceResult.result[0] es 0, formatearlo correctamente
  if (balanceResult?.result?.[0] === 0 || balanceResult?.result?.[0] === 0 || balanceResult?.result?.[0] === BigInt(0)) {
     return (0).toFixed(2);
  }
  
  // Si no hay resultado válido o es null/undefined (después de chequear el 0), retornar 0.00
  if (!balanceResult?.result?.[0] && balanceResult?.result?.[0] !== 0) { // Modificado para permitir 0
     return (0).toFixed(2);
  }

  try {
    const rawBalance = BigInt(balanceResult.result[0]);
    const divisor = BigInt(10) ** BigInt(decimals);
    const integerPart = rawBalance / divisor;
    const fractionalPart = rawBalance % divisor;
    
    // Asegurar que la parte fraccional tenga la longitud de 'decimals' antes de tomar substring
    const paddedFractional = fractionalPart.toString().padStart(decimals, '0');
    const displayFractional = paddedFractional.substring(0, 2); // Mostrar solo 2 decimales

    return `${integerPart}.${displayFractional}`;
  } catch (e) {
    console.error("Error formatting balance in tokenUtils:", e, balanceResult.result[0]);
    return (0).toFixed(2);
  }
};
