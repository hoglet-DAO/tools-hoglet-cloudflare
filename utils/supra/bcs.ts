import { BCS, TxnBuilderTypes } from 'supra-l1-sdk';

// Convert a human-readable string to Uint8Array
export const stringToUint8Array = (humanReadableStr: string) => {
    return BCS.bcsToBytes(new TxnBuilderTypes.Identifier(humanReadableStr));
};

export const serializeString = (humanReadableStr: string) => {
    return BCS.bcsSerializeStr(humanReadableStr);
};

// Convert a crypto address to Uint8Array
export const addressToUint8Array = (cryptoAddress: string) => {
    return BCS.bcsToBytes(TxnBuilderTypes.AccountAddress.fromHex(cryptoAddress));
};

export const deserializeString = (uint8Array: string) => {
    return BCS.bcsSerializeStr(uint8Array);
};

export const deserializeVector = (uint8Array: Uint8Array) => {
    const deserializer = new BCS.Deserializer(uint8Array);
    return BCS.deserializeVector(deserializer, BCS.bcsSerializeU8);
};

// Serialize a uint8 value
export const serializeUint8 = (value: number | string) => {
    const num = typeof value === 'string' ? parseInt(value, 10) : value;
    if (num < 0 || num > 255) {
        throw new Error(`u8 value out of range: ${num}`);
    }
    return BCS.bcsSerializeU8(num);
};

// Serialize a uint16 value
export const serializeUint16 = (value: number | string | bigint) => {
    let num: number;
    if (typeof value === 'string') {
        num = parseInt(value, 10);
    } else if (typeof value === 'bigint') {
        num = Number(value);
    } else {
        num = value;
    }
    if (num < 0 || num > 65535) {
        throw new Error(`u16 value out of range: ${num}`);
    }
    return BCS.bcsSerializeU16(num);
};

// Serialize a uint32 value
export const serializeUint32 = (value: number | string | bigint) => {
    let num: number;
    if (typeof value === 'string') {
        num = parseInt(value, 10);
    } else if (typeof value === 'bigint') {
        num = Number(value);
    } else {
        num = value;
    }
    if (num < 0 || num > 4294967295) {
        throw new Error(`u32 value out of range: ${num}`);
    }
    return BCS.bcsSerializeU32(num);
};

// Serialize a uint64 value
export const serializeUint64 = (value: number | string | bigint) => {
    let num: bigint;
    try {
        if (typeof value === 'string') {
            if (!value.trim()) throw new Error("Empty string");
            // Remove decimal part if present just in case, though caller should handle it
            const safeValue = value.split('.')[0];
            num = BigInt(safeValue);
        } else if (typeof value === 'number') {
            if (isNaN(value)) throw new Error("Value is NaN");
            if (!Number.isInteger(value)) console.warn("serializeUint64 received float, truncating:", value);
            num = BigInt(Math.floor(value));
        } else {
            num = value;
        }
        if (num < 0) {
            throw new Error(`u64 value cannot be negative: ${num}`);
        }
        return BCS.bcsSerializeUint64(num);
    } catch (e) {
        console.error(`Failed to serialize uint64: ${value}`, e);
        throw new Error(`Invalid u64 value: ${value}`);
    }
};

// Serialize a uint128 value
export const serializeUint128 = (value: number | string | bigint) => {
    let num: bigint;
    try {
        if (typeof value === 'string') {
            if (!value.trim()) throw new Error("Empty string");
            const safeValue = value.split('.')[0];
            num = BigInt(safeValue);
        } else if (typeof value === 'number') {
            if (isNaN(value)) throw new Error("Value is NaN");
            num = BigInt(Math.floor(value));
        } else {
            num = value;
        }
        if (num < 0) {
            throw new Error(`u128 value cannot be negative: ${num}`);
        }
        return BCS.bcsSerializeU128(num);
    } catch (e) {
        console.error(`Failed to serialize uint128: ${value}`, e);
        throw new Error(`Invalid u128 value: ${value}`);
    }
};

export const serializeU256 = (value: bigint) => {
    return BCS.bcsSerializeU256(value);
};

export const serializeBool = (value: boolean) => {
    return BCS.bcsSerializeBool(value);
};

export const serializeVector = (values: any[], type: 'u8' | 'u64' | 'bool' | 'string' | 'address') => {
    const serializer = new BCS.Serializer();
    serializer.serializeU32AsUleb128(values.length);
    
    values.forEach(value => {
        if (type === 'u64') {
            serializer.serializeU64(value as bigint);
        } else if (type === 'bool') {
            serializer.serializeBool(value as boolean);
        } else if (type === 'string') {
            serializer.serializeStr(value as string);
        } else if (type === 'address') {
            const accountAddress = TxnBuilderTypes.AccountAddress.fromHex(value as string);
            serializer.serializeFixedBytes(accountAddress.address);
        } else {
            serializer.serializeStr(value as string);
        }
    });
    return serializer.getBytes();
};

export const hexToString = (hex: string, type: string) => {
    if (!hex) {
        return '';
    }
    
    if (type !== "String") {
        // For numeric types, convert hex to decimal string
        try {
            return BigInt(hex).toString();
        } catch (error) {
            console.error('Error converting hex to string:', error);
            return hex;
        }
    }
    
    try {
        // Remove the '0x' prefix
        const cleanHex = hex.slice(2);
        // Convert hex to string and remove the first character (length prefix)
        return Buffer.from(cleanHex, 'hex').toString().slice(1);
    } catch (error) {
        console.error('Error converting hex to string:', error);
        return hex;
    }
};

export const stringToHex = (str: string) => {
    // Convert string to UTF-8 encoded bytes
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    
    // Convert bytes to hex string
    let hexString = '';
    for (let i = 0; i < bytes.length; i++) {
      const hex = bytes[i].toString(16).padStart(2, '0');
      hexString += hex;
    }
    
    return hexString;
};

// Serializes a single value based on its Move type
export const serializeValueByType = (
    value: any, 
    type: string, 
    serializer?: any
): Uint8Array => {
    const ser = serializer || new BCS.Serializer();
    const shouldReturnBytes = !serializer; // Only return bytes if we created the serializer

    // Handle Option<T>
    if (type.startsWith('0x1::option::Option<')) {
        if (value === null || value === undefined) {
            ser.serializeU8(0);
        } else {
            ser.serializeU8(1);
            const innerType = type.slice(21, -1); // Remove "0x1::option::Option<" and ">"
            serializeValueByType(value, innerType, ser);
        }
        return shouldReturnBytes ? ser.getBytes() : new Uint8Array(0);
    }

    // Handle vector<T>
    if (type.startsWith('vector<')) {
        // Use regex to extract inner type (handles nested vectors better)
        const vectorMatch = type.match(/vector<(.+)>$/);
        if (!vectorMatch) {
            throw new Error(`Invalid vector type format: ${type}`);
        }
        const innerType = vectorMatch[1];

        // Special handling for vector<u8> - accepts string, Uint8Array, or number[]
        if (innerType === 'u8') {
            let bytes: Uint8Array;

            if (typeof value === 'string') {
                // Hex string - convert to Uint8Array
                const cleanHex = value.startsWith('0x') ? value.slice(2) : value;
                bytes = new Uint8Array(
                    cleanHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
                );
            } else if (value instanceof Uint8Array) {
                // Uint8Array - use directly
                bytes = value;
            } else if (Array.isArray(value)) {
                // Number array - convert to Uint8Array
                bytes = new Uint8Array(
                    value.map((item) => {
                        const u8 = typeof item === 'string' ? parseInt(item, 10) : item;
                        if (u8 < 0 || u8 > 255) {
                            throw new Error(`u8 value out of range in vector: ${u8}`);
                        }
                        return u8;
                    })
                );
            } else {
                throw new Error(
                    `Expected string, Uint8Array, or number[] for vector<u8>, got ${typeof value}`
                );
            }

            // Serialize vector<u8> as length + bytes
            ser.serializeU32AsUleb128(bytes.length);
            for (let i = 0; i < bytes.length; i++) {
                ser.serializeU8(bytes[i]);
            }
        } else {
            // Regular vector handling
            if (!Array.isArray(value)) {
                throw new Error(
                    `Expected array for vector<${innerType}>, got ${typeof value}`
                );
            }
            ser.serializeU32AsUleb128(value.length);
            for (const item of value) {
                serializeValueByType(item, innerType, ser);
            }
        }
        return shouldReturnBytes ? ser.getBytes() : new Uint8Array(0);
    }

    // Handle 0x1::object::Object<T> - treat as address
    if (type.startsWith('0x1::object::Object')) {
        if (typeof value !== 'string') {
            throw new Error(`Expected string for Object, got ${typeof value}`);
        }
        const objectAddress = TxnBuilderTypes.AccountAddress.fromHex(value);
        ser.serializeFixedBytes(objectAddress.address);
        return shouldReturnBytes ? ser.getBytes() : new Uint8Array(0);
    }

    // Handle primitive types
    switch (type) {
        case 'address':
            if (typeof value !== 'string') {
                throw new Error(`Expected string for address, got ${typeof value}`);
            }
            const accountAddress = TxnBuilderTypes.AccountAddress.fromHex(value);
            ser.serializeFixedBytes(accountAddress.address);
            break;

        case 'u8':
            const u8 = typeof value === 'string' ? parseInt(value, 10) : value;
            if (u8 < 0 || u8 > 255) {
                throw new Error(`u8 value out of range: ${u8}`);
            }
            ser.serializeU8(u8);
            break;

        case 'u16':
            const u16 =
                typeof value === 'string'
                    ? parseInt(value, 10)
                    : typeof value === 'bigint'
                      ? Number(value)
                      : value;
            if (u16 < 0 || u16 > 65535) {
                throw new Error(`u16 value out of range: ${u16}`);
            }
            ser.serializeU16(u16);
            break;

        case 'u32':
            const u32 =
                typeof value === 'string'
                    ? parseInt(value, 10)
                    : typeof value === 'bigint'
                      ? Number(value)
                      : value;
            if (u32 < 0 || u32 > 4294967295) {
                throw new Error(`u32 value out of range: ${u32}`);
            }
            ser.serializeU32(u32);
            break;

        case 'u64':
            const u64 =
                typeof value === 'string'
                    ? BigInt(value)
                    : typeof value === 'number'
                      ? BigInt(value)
                      : value;
            if (u64 < 0) {
                throw new Error(`u64 value cannot be negative: ${u64}`);
            }
            ser.serializeU64(u64);
            break;

        case 'u128':
            const u128 =
                typeof value === 'string'
                    ? BigInt(value)
                    : typeof value === 'number'
                      ? BigInt(value)
                      : value;
            if (u128 < 0) {
                throw new Error(`u128 value cannot be negative: ${u128}`);
            }
            ser.serializeU128(u128);
            break;

        case 'u256':
            if (typeof value !== 'bigint') {
                throw new Error(`Expected bigint for u256, got ${typeof value}`);
            }
            ser.serializeU256(value);
            break;

        case 'bool':
            if (typeof value !== 'boolean') {
                throw new Error(`Expected boolean, got ${typeof value}`);
            }
            ser.serializeBool(value);
            break;
        
        case '0x1::string::String':
            if (typeof value !== 'string') {
                throw new Error(`Expected string, got ${typeof value}`);
            }
            ser.serializeStr(value);
            break;

        default:
            throw new Error(`Unsupported type: ${type}`);
    }

    return shouldReturnBytes ? ser.getBytes() : new Uint8Array(0);
};

// Serializes transaction arguments based on parameter types
export const serializeArgsFromTypes = (
    args: any[], 
    paramTypes: string[]
): Uint8Array[] => {
    if (args.length !== paramTypes.length) {
        throw new Error(
            `Argument count mismatch: expected ${paramTypes.length}, got ${args.length}`
        );
    }

    return args.map((arg, index) => {
        try {
            // Remove &signer from param types (first param is usually &signer)
            const paramType = paramTypes[index].replace('&signer', '').trim();
            return serializeValueByType(arg, paramType);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(
                `Failed to serialize argument ${index} (${paramTypes[index]}): ${errorMessage}`
            );
        }
    });
};
