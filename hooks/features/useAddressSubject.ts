"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { readJson, writeJson, STORAGE_KEYS } from "@/lib/storage";

/**
 * The recents list both address surfaces share.
 *
 * A single key rather than one per surface: the two now render the same bar, and the bar cannot tell in
 * advance whether an address is a token to audit or a contract to call — so splitting the memory only
 * meant each side had to be taught the other's entries.
 */
type RecentsKey = (typeof STORAGE_KEYS)["contractRecent"];

/** How many addresses a recents list keeps. Both surfaces used five. */
const RECENTS_LIMIT = 5;

export interface AddressSubjectOptions {
  /**
   * Which recents list this surface reads and writes.
   *
   * Deliberately a parameter rather than one shared list: the interactor's holds contract addresses
   * and the inspector's holds tokens, and a single list had each surfacing the other's entries as
   * suggestions. Same logic, separate memory.
   */
  storageKey: RecentsKey;
  /** Query parameter carrying the address. Defaults to `address`. */
  paramName?: string;
  /** Trims and validates before it is used or written. Return null to reject. */
  normalize?: (raw: string) => string | null;
  /**
   * Runs after a value is committed — on a deep link at mount, and on every submit.
   *
   * This is where each surface does its own thing: the interactor scans modules, the inspector scans
   * the account. Keeping it out of the hook is what lets both share the transport without sharing the
   * behaviour.
   */
  onCommit?: (address: string) => void;
  /** Commit an address present in the URL at mount. Defaults to true. */
  commitOnMount?: boolean;
}

export interface AddressSubject {
  /** The address being looked at. Empty until something is committed. */
  address: string;
  /** Updates the field. Does not commit — that is `submit`, on Enter or the button. */
  setAddress: (value: string) => void;
  /**
   * Commits the current field: validates it, pushes it to recents, and writes it to the URL.
   *
   * A no-op when the field is empty or fails validation, so a half-typed address never reaches either
   * the network or the URL bar.
   */
  submit: (value?: string) => void;
  /** Recently committed addresses, newest first. */
  recents: string[];
  clearRecents: () => void;
}

/**
 * The one place a surface owns "which address am I looking at".
 *
 * Two surfaces need the same thing — an address field, a recents list, and an `?address` deep link —
 * and each had grown its own version. They did not agree on the details, which is what produced the
 * bugs this replaces:
 *
 * - The inspector rebuilt the query string from scratch when it wrote `?address`, dropping every other
 *   parameter. `?network` is owned by `NetworkContext`, so inspecting a token on testnet silently
 *   switched the whole app to mainnet.
 * - The interactor read `?address` in two places and submitted from both, so every shared link scanned
 *   twice.
 *
 * Writing the parameter here means the current search params are copied and only this hook's key is
 * mutated, so `?network`, `?module` and anything a later feature adds survive a lookup. The mount-time
 * read is guarded to run once, so a deep link triggers exactly one commit.
 */
export function useAddressSubject(options: AddressSubjectOptions): AddressSubject {
  const { storageKey, paramName = "address", normalize, onCommit, commitOnMount = true } = options;

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [address, setAddress] = useState("");
  const [recents, setRecents] = useState<string[]>([]);
  const readFromUrl = useRef(false);

  // Recents are read once: they are this browser's memory of past lookups, not a function of the URL,
  // so a navigation that leaves the params unchanged must not reload them. Sliced on read because the
  // key's migration merges two five-entry lists into one ten-entry list.
  useEffect(() => {
    setRecents(readJson<string[]>(storageKey, []).slice(0, RECENTS_LIMIT));
  }, [storageKey]);

  const commit = useCallback(
    (raw: string) => {
      const cleaned = raw.trim();
      const value = normalize ? normalize(cleaned) : cleaned;
      // Empty or rejected: leave the address, the recents and the URL exactly as they were.
      if (!value) return;

      setAddress(value);
      setRecents((prev) => {
        const next = [value, ...prev.filter((q) => q !== value)].slice(0, RECENTS_LIMIT);
        writeJson(storageKey, next);
        return next;
      });

      // Copy the current params and touch only this one. Rebuilding the query from the pathname is what
      // used to drop `?network`.
      const params = new URLSearchParams(searchParams.toString());
      if (params.get(paramName) !== value) {
        params.set(paramName, value);
        const search = params.toString();
        router.replace(`${pathname}${search ? `?${search}` : ""}`, { scroll: false });
      }

      onCommit?.(value);
    },
    [storageKey, paramName, normalize, onCommit, pathname, router, searchParams]
  );

  // A deep link loads straight onto its address. Guarded by a ref rather than by state because
  // `searchParams` is a new object on every navigation, and depending on it would re-commit whenever
  // anything else in the URL changed.
  useEffect(() => {
    if (readFromUrl.current) return;
    readFromUrl.current = true;
    const fromUrl = searchParams.get(paramName);
    if (fromUrl && commitOnMount) commit(fromUrl);
  }, [searchParams, paramName, commitOnMount, commit]);

  const submit = useCallback(
    (value?: string) => {
      commit(value ?? address);
    },
    [commit, address]
  );

  const clearRecents = useCallback(() => {
    writeJson(storageKey, []);
    setRecents([]);
  }, [storageKey]);

  return { address, setAddress, submit, recents, clearRecents };
}