/**
 * Acorta una dirección para mostrarla de forma legible, del tipo `0x1234abcd...5678`.
 *
 * Tres surfaces showed a shortened address and each had written the slice inline — the interactor's
 * address bar, the inspector's search bar and its type labels — with `6` leading and `4` trailing
 * characters. They drifted only in that they were copies, so they are one function now. The asymmetric
 * `head`/`tail` defaults are the shape the UI has always used; the symmetric `chars` form is kept for
 * callers that want the original behaviour.
 *
 * @param address La dirección completa.
 * @param chars Longitud igual para la cabeza y la cola, para el formato simétrico original.
 * @param head Caracteres a mostrar al principio.
 * @param tail Caracteres a mostrar al final.
 */
export const shortenAddress = (address: string, chars?: number, head = 6, tail = 4): string => {
  if (!address) return "";

  // The original symmetric signature: equal heads and tails.
  const [h, t] = typeof chars === "number" ? [chars, chars] : [head, tail];
  if (address.length <= h + t) return address;

  return `${address.substring(0, h)}...${address.substring(address.length - t)}`;
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
