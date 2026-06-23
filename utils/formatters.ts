/**
 * Acorta una dirección de wallet para mostrarla de forma más legible.
 * @param address La dirección completa.
 * @param chars El número de caracteres a mostrar al principio y al final.
 * @returns La dirección acortada (ej: "0x1234...5678").
 */
export const shortAddress = (address: string, chars = 4): string => {
  if (!address) return "";
  if (address.length <= chars * 2) {
    return address;
  }
  return `${address.substring(0, chars)}...${address.substring(address.length - chars)}`;
};

/**
 * Formatea un valor BigInt (como string) a un número decimal legible, 
 * considerando el número de decimales del token.
 * @param value El valor en su unidad mínima (ej: "123456789").
 * @param decimals El número de decimales del token (ej: 8).
 * @returns El valor formateado como string (ej: "1.23").
 */
export const formatBigInt = (value: string, decimals: number): string => {
    try {
        const num = BigInt(value);
        const divisor = BigInt(10 ** decimals);
        const integerPart = num / divisor;
        const fractionalPart = num % divisor;

        if (fractionalPart === BigInt(0)) {
            return integerPart.toLocaleString(); // Añade separadores de miles
        }

        // Asegura que la parte fraccional tenga los ceros iniciales necesarios
        const fractionalString = fractionalPart.toString().padStart(decimals, '0').slice(0, 2);
        return `${integerPart.toLocaleString()}.${fractionalString}`;

    } catch (error) {
        console.error("Error formatting BigInt:", error);
        return "0";
    }
};

/**
 * Formatea un número a un string de porcentaje con dos decimales.
 * @param value El número a formatear (ej: 5.1234).
 * @returns El porcentaje como string (ej: "5.12%").
 */
export const formatPercentage = (value: number): string => {
    if (isNaN(value)) {
        return "0.00%";
    }
    return `${value.toFixed(2)}%`;
};
