export interface ModuleABI {
  exposed_functions: {
    name: string;
    params: string[];
    [key: string]: any;
  }[];
  [key: string]: any;
}

export function getStoredABI(moduleAddress: string, moduleName: string): ModuleABI | null {
  // Placeholder: return null to force fetch
  return null;
}
