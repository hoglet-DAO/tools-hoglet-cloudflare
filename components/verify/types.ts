export interface VerificationView {
  status: "pending" | "verified" | "unreproduced" | "failed";
  exactSource: boolean;
  bundleSha256: string | null;
  compilerVersion: string | null;
  frameworkRev: string | null;
  error: string | null;
  updatedAt: number;
}

export interface PackageRow {
  name: string;
  upgradeNumber: number;
  moduleCount: number;
  sourceDigest: string;
  hasChainSource: boolean;
  verification: VerificationView | null;
  stale: boolean;
}

export interface PackageDetail {
  name: string;
  upgradeNumber: number;
  modules: string[];
  manifest: string;
  sourceDigest: string;
  hasChainSource: boolean;
  hasSource: boolean;
  verification: VerificationView | null;
}

export interface SourceFiles {
  origin: "bundle" | "chain";
  files: Record<string, string>;
  manifest: string;
}
