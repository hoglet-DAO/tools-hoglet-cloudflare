import { getStoredABI, type ModuleABI } from '@/lib/abiStorage';
import { serializeArgsFromTypes } from './bcs';

export const fetchModuleABI = async (
    moduleAddress: string, 
    moduleName: string, 
    rpcUrl?: string
): Promise<ModuleABI> => {
    const storedABI = getStoredABI(moduleAddress, moduleName);
    if (storedABI) {
      return storedABI;
    }

    const baseUrl =
        rpcUrl ||
        (process.env.NEXT_PUBLIC_SUPRA_CHAIN_ID === '8'
            ? 'https://rpc-mainnet.supra.com'
            : 'https://rpc-testnet.supra.com');

    const url = `${baseUrl}/rpc/v3/accounts/${moduleAddress}/modules/${moduleName}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch ABI: ${response.statusText}`);
        }
        const data = await response.json();
        return data.abi as ModuleABI;
    } catch (error) {
        console.error('Error fetching module ABI:', error);
        throw new Error(
            `Failed to fetch module ABI: ${
                error instanceof Error ? error.message : String(error)
            }`
        );
    }
};

// Extracts function parameter types from module ABI
export const getFunctionParamTypes = async (
    moduleAddress: string,
    moduleName: string,
    functionName: string,
    rpcUrl?: string
): Promise<string[]> => {
    const moduleABI = await fetchModuleABI(moduleAddress, moduleName, rpcUrl);

    if (!moduleABI.exposed_functions) {
        throw new Error('Invalid module ABI response');
    }

    const functionDef = moduleABI.exposed_functions.find(
        (func: any) => func.name === functionName
    );

    if (!functionDef) {
        throw new Error(`Function ${functionName} not found in module ${moduleName}`);
    }

    // Remove all `signer` and `&signer` from argument list because the Move VM injects those arguments. Clients do not
    // need to care about those args. `signer` and `&signer` are required be in the front of the argument list.
    return functionDef.params.filter((param: string) => {
        const trimmed = param.trim();
        return trimmed !== 'signer' && trimmed !== '&signer';
    });
};

// Function to Fetch ABI and serialize arguments
export const serializeTransactionArgs = async (
    args: any[],
    moduleAddress: string,
    moduleName: string,
    functionName: string,
    rpcUrl?: string
): Promise<Uint8Array[]> => {
    const paramTypes = await getFunctionParamTypes(
        moduleAddress,
        moduleName,
        functionName,
        rpcUrl
    );

    return serializeArgsFromTypes(args, paramTypes);
};
