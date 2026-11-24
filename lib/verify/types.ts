export type VerifyNetwork = "mainnet" | "testnet";
export type VerificationStatus = "pending" | "verified" | "unreproduced" | "failed";

export interface OnChainModule {
  name: string;
  source: string | null;
}

export interface OnChainPackage {
  name: string;
  upgradeNumber: number;
  sourceDigest: string;
  manifest: string;
  modules: OnChainModule[];
  deps: { account: string; packageName: string }[];
}

export interface VerificationRecord {
  network: VerifyNetwork;
  address: string;
  packageName: string;
  upgradeNumber: number;
  status: VerificationStatus;
  exactSource: boolean;
  sourceDigest: string;
  computedDigest: string | null;
  bundleSha256: string | null;
  compilerVersion: string | null;
  frameworkRev: string | null;
  onchainModules: Record<string, string>;
  error: string | null;
  submittedBy: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Bundle {
  version: 1;
  network: VerifyNetwork;
  address: string;
  package: string;
  upgradeNumber: number;
  files: Record<string, string>;
  manifest: string;
  verification: {
    status: VerificationStatus;
    exactSource: boolean;
    sourceDigest: string;
    computedDigest: string;
    compilerVersion: string | null;
    frameworkRev: string | null;
    onchainModules: Record<string, string>;
  };
}
