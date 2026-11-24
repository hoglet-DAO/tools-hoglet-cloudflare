/**
 * External links, in one place, so a URL is never spelled out twice and cannot drift between surfaces.
 *
 * These leave the app for the docs site. Kept here rather than in `config/vault.ts` on purpose: that
 * catalog is the machine-readable mirror of the Move sources, consumed by agents, and a docs URL is not
 * part of it.
 */

/**
 * The Resource Account standard for Move contracts.
 *
 * A docs-site page rather than an in-app route: it is a long-form proposal, and hosting it on the docs
 * site means it can be revised without shipping the app.
 */
export const VAULT_STANDARD_DOCS_URL = "https://docs.hoglet.xyz/en/docs/products/vault/standard";
