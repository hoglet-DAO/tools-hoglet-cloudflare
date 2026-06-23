// src/utils/format.ts (o similar)

import Big from 'big.js';

const DECIMALS = 8; // Tu valor por defecto

/**
 * Formatea un número raw (BigInt o string) a un número legible aplicando los decimales.
 * @param rawValue - El valor raw, ej. 10000000000n
 * @returns El número formateado como string, ej. "100.00"
 */
export const formatTokenAmount = (
  rawValue: bigint | string | number | null,
  decimals: number = DECIMALS,
  fixed: number = 2
): string => {
  if (rawValue === null || rawValue === undefined) {
    return '0.00';
  }

  try {
    const divisor = new Big(10).pow(decimals);
    const formatted = new Big(rawValue.toString()).div(divisor).toFixed(fixed);
    return formatted;
  } catch (e) {
    console.error("Failed to format token amount:", e);
    return '0.00';
  }
};
