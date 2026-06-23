// src/app/utils/numberUtils.ts

/**
 * Formats a number into a compact string representation with metric suffixes (K, M, B).
 * The function applies suffixes for numbers greater than or equal to 1000.
 *
 * @param num The number to format. Can be a number or string.
 * @param precision The number of decimal places for the formatted number with a suffix. Defaults to 2.
 * @returns A formatted string (e.g., "999", "1.23K", "5.4M").
 */
export const formatCompactNumber = (num: number | string, precision: number = 2): string => {
  const number = Number(num);

  if (isNaN(number)) {
    return '0';
  }

  if (number < 1000) {
    // For numbers less than 1000, return a clean string representation.
    return parseFloat(number.toPrecision(4)).toString();
  }

  const tiers = [
    { value: 1e9, symbol: 'B' },
    { value: 1e6, symbol: 'M' },
    { value: 1e3, symbol: 'K' },
  ];

  const tier = tiers.find(t => number >= t.value);

  if (tier) {
    const formattedNum = (number / tier.value).toFixed(precision);
    // Remove trailing .00 if it exists by converting to float and back to string
    return `${parseFloat(formattedNum)}${tier.symbol}`;
  }

  // Fallback for numbers that didn't match, though the < 1000 check should handle it.
  return number.toString();
};
