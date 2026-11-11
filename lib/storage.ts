/**
 * Every key this app stores in the browser, in one place.
 *
 * The keys used to be string literals scattered across eight files, which produced two real problems: four
 * different naming conventions with no shared namespace, and one collision nobody noticed — the token
 * inspector and the interactor both wrote `hoglet-recent-searches`, so looking up a token pushed contract
 * addresses into the interactor's suggestions and the reverse.
 *
 * Nothing here leaves the browser. The Move sources do travel to the compile service to be built, but that
 * is a request, not storage: there is no database and no account.
 */

export const STORAGE_KEYS = {
  /**
   * The list of Move projects belonging to one creator.
   *
   * A creator can deploy several packages, and each one lands on a different Resource Account because the
   * address is derived from `(creator, label)`. Keying storage by the creator alone kept only the last
   * package, so the label of every earlier deployment left the browser — and with it the only local record
   * of which label produced which address.
   */
  projectIndex: (creator: string) => `hgl:move-projects:${creator.toLowerCase()}`,
  /**
   * One Move project: the creator it belongs to, plus its own id.
   *
   * The name is deliberately NOT part of the key. It is editable, and it is the label the address derives
   * from, so keying by it would orphan the entry on every rename — the opposite of what this is for.
   */
  project: (creator: string, id: string) => `hgl:move-project:${creator.toLowerCase()}:${id}`,
  /**
   * The pre-multi-project layout, keyed by the creator alone. Read once to adopt the old project into the
   * index, then never written again.
   */
  legacyProject: (creator: string) => `hgl:move-project:${creator.toLowerCase()}`,
  /** Last DAO admin typed into a donation or deploy form. */
  daoAdmin: "hgl:dao-admin",
  /** Testnet or mainnet. */
  network: "hgl:network",
  /**
   * Addresses recently looked up, across both the token inspector and the interactor.
   *
   * The two surfaces kept a list each, on the theory that the inspector holds tokens and the interactor
   * holds contracts and neither should be offered the other's entries. They now share one address bar,
   * and the bar does not know or care which kind of thing you are about to look at — so one list is the
   * honest shape. A contract address from the interactor is just as valid to audit, and a token address
   * is just as valid to scan.
   */
  contractRecent: "hgl:contract-recent",
  /**
   * The per-surface lists this replaced. Read once to merge them forward; never written again.
   *
   * Kept as separate keys rather than folded into `LEGACY_KEYS` so that the migration has a name to be
   * found by, and so the reason they stopped being separate is recorded next to the keys themselves.
   */
  inspectorRecent: "hgl:inspector-recent",
  interactorRecent: "hgl:interactor-recent",
  /** Last wallet used, so connect can preselect it. */
  recentWallet: "hgl:recent-wallet",
  /**
   * Package sizes the compile service has already measured, keyed by content hash.
   *
   * Before a first compile the workspace can only report the source size, which runs about three times the
   * compiled artifact size and reads like a number it is not. The compiler is deterministic, so a size that
   * was measured once still holds, and recording it lets the workspace say "63 KB, measured" instead.
   */
  compileSizes: "hgl:compile-sizes",
  /** Wallet selection read by the supra-l1-sdk bridge. */
  selectedWallet: "hgl:selected-wallet",
  /** Legal modal acknowledgement. */
  legalAccepted: "hgl:legal-accepted",
  /**
   * NOT ours. This is the Starkey SDK's own key, written so the provider finds an account to restore on
   * its next initialisation.
   *
   * Kept in the registry rather than left as a bare literal at the call site for one reason: it is a
   * localStorage write, and the point of this file is that every one of them is visible in a single place.
   * It is also the most fragile of them — a key in someone else's namespace, in a format we do not control,
   * so a change on their side breaks this silently.
   */
  starkeyAccount: "starkey.accounts.0",
} as const;

/**
 * Keys this app used before the registry existed.
 *
 * Read once and copied forward, so renaming does not discard what a returning visitor had. The two recent
 * lists both read the old shared key: whatever it held was genuinely mixed, and splitting it is the point.
 */
const LEGACY_KEYS: Record<string, string[]> = {
  "hgl:dao-admin": ["governance:donate:dao-admin"],
  "hgl:network": ["hoglet-network"],
  "hgl:inspector-recent": ["hoglet-recent-searches"],
  "hgl:interactor-recent": ["hoglet-recent-searches"],
  /**
   * Both per-surface lists, and the mixed one that preceded them.
   *
   * The two lists are kept separate above so each keeps its own key, but the migration merges them: a
   * visitor who audited tokens on one surface and called contracts on the other would otherwise lose
   * whichever list happened not to be found first.
   */
  "hgl:contract-recent": ["hgl:inspector-recent", "hgl:interactor-recent", "hoglet-recent-searches"],
  "hgl:recent-wallet": ["recent_wallet_type"],
  "hgl:selected-wallet": ["multiwallet.selectedWallet"],
  "hgl:legal-accepted": ["legal_accepted_v1"],
};

export type StorageFailure = "quota" | "blocked" | "unavailable";
export type WriteResult = { ok: true } | { ok: false; reason: StorageFailure };

/** localStorage is absent during server rendering, so every entry point guards rather than assumes. */
function store(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    // Access itself throws when storage is blocked, before any read or write.
    return null;
  }
}

/**
 * Whether storage can be written at all.
 *
 * Probed rather than feature-checked: private mode and blocked cookies both expose a `localStorage` object
 * that throws on write, so the only reliable test is to write. Callers use this to warn before the user has
 * typed anything, instead of after the first failed save.
 */
export function canPersist(): boolean {
  const s = store();
  if (!s) return false;
  try {
    const probe = "__hgl_probe__";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/** Parses a stored value as a list of strings, or yields nothing when it is not one. */
function readStringList(raw: string): string[] | null {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every((v) => typeof v === "string")) return null;
    return parsed as string[];
  } catch {
    return null;
  }
}

/**
 * Reads a key, migrating from any legacy spelling on the way.
 *
 * The migration writes the new key as a side effect of the first read, so it happens once per visitor and
 * needs no separate step or version marker.
 *
 * A key with more than one legacy spelling merges them rather than adopting whichever is found first: the
 * recents lists were per-surface and are being unified, so taking one would silently discard the other's
 * history. Non-list values still fall back to first-found, which is the right answer for every other key.
 */
export function readStored(key: string): string | null {
  const s = store();
  if (!s) return null;
  try {
    const current = s.getItem(key);
    if (current !== null) return current;

    const legacyKeys = LEGACY_KEYS[key] || [];
    const lists: string[][] = [];
    let firstFound: string | null = null;
    for (const legacy of legacyKeys) {
      const old = s.getItem(legacy);
      if (old === null) continue;
      if (firstFound === null) firstFound = old;
      const parsed = readStringList(old);
      if (parsed) lists.push(parsed);
    }
    if (firstFound === null) return null;

    let adopted = firstFound;
    if (lists.length > 1) {
      const merged: string[] = [];
      for (const list of lists) {
        for (const entry of list) {
          if (!merged.includes(entry)) merged.push(entry);
        }
      }
      if (merged.length > 0) adopted = JSON.stringify(merged);
    }

    try {
      s.setItem(key, adopted);
    } catch {
      // Migration is best-effort: the value is still returned, so a failed copy costs a re-migration
      // rather than the data.
    }
    return adopted;
  } catch {
    return null;
  }
}

/**
 * Writes a key.
 *
 * The result is returned rather than swallowed. An app that silently fails to persist looks identical to
 * one that works, right up until the tab closes and the work is gone.
 */
export function writeStored(key: string, value: string): WriteResult {
  const s = store();
  if (!s) return { ok: false, reason: "unavailable" };
  try {
    s.setItem(key, value);
    return { ok: true };
  } catch (e: any) {
    const quota =
      e?.name === "QuotaExceededError" || e?.name === "NS_ERROR_DOM_QUOTA_REACHED" || e?.code === 22;
    return { ok: false, reason: quota ? "quota" : "blocked" };
  }
}

/** Removes a key and its legacy spellings, so a reset does not leave the old value to be migrated back. */
export function removeStored(key: string): void {
  const s = store();
  if (!s) return;
  try {
    s.removeItem(key);
    for (const legacy of LEGACY_KEYS[key] || []) s.removeItem(legacy);
  } catch {
    /* nothing to do */
  }
}

/** JSON convenience, returning null on absent or malformed content rather than throwing into a render. */
export function readJson<T>(key: string, fallback: T): T {
  const raw = readStored(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): WriteResult {
  return writeStored(key, JSON.stringify(value));
}