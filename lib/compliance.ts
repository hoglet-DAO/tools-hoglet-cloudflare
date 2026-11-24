export const TOS_COMPLIANCE_VERSION = 'v1.0';

/**
 * Zonas horarias IANA estrictas de EE. UU. (no usar prefijo genérico para no afectar a Latinoamérica).
 */
export const US_IANA_TIMEZONES = new Set([
  'America/New_York', 'America/Detroit', 'America/Kentucky/Louisville', 'America/Kentucky/Monticello',
  'America/Indiana/Indianapolis', 'America/Indiana/Vincennes', 'America/Indiana/Winamac',
  'America/Indiana/Marengo', 'America/Indiana/Petersburg', 'America/Indiana/Vevay',
  'America/Chicago', 'America/Indiana/Tell_City', 'America/Indiana/Knox', 'America/Menominee',
  'America/North_Dakota/Center', 'America/North_Dakota/New_Salem', 'America/North_Dakota/Beulah',
  'America/Denver', 'America/Boise', 'America/Phoenix', 'America/Los_Angeles',
  'America/Anchorage', 'America/Juneau', 'America/Sitka', 'America/Metlakatla',
  'America/Yakutat', 'America/Nome', 'America/Adak', 'Pacific/Honolulu',
  'America/Puerto_Rico', 'America/St_Thomas', 'Pacific/Guam', 'Pacific/Pago_Pago', 'Pacific/Saipan'
]);

export const LEGAL_CONSENT_MESSAGE = `[HOGLET PROTOCOL - JURISDICTION CERTIFICATION]
By signing this message, you certify and warrant that:
1. You are NOT a citizen, resident, or entity located or incorporated in the United States of America, its territories, or any OFAC-sanctioned jurisdiction.
2. You are NOT using a Virtual Private Network (VPN), proxy, Tor, or any tool to disguise your true IP address or physical location.
3. You will not access this interface or execute smart contract transactions on behalf of any restricted person or entity.
4. You have read, understood, and agreed to the Terms of Service and Privacy Policy.

Compliance Version: ${TOS_COMPLIANCE_VERSION}`;

export function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}

export function isUSTimezone(): boolean {
  const tz = getUserTimezone();
  return US_IANA_TIMEZONES.has(tz);
}

export function getConsentStorageKey(address: string): string {
  return `hoglet_legal_consent_${TOS_COMPLIANCE_VERSION}_${address.toLowerCase().trim()}`;
}

export function hasUserSignedConsent(address?: string | null): boolean {
  if (!address || typeof window === 'undefined') return false;
  try {
    const data = localStorage.getItem(getConsentStorageKey(address));
    if (!data) return false;
    const parsed = JSON.parse(data);
    return Boolean(parsed?.signature);
  } catch {
    return false;
  }
}

export function saveUserSignedConsent(address: string, signature: string): void {
  if (!address || typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      getConsentStorageKey(address),
      JSON.stringify({
        address: address.toLowerCase().trim(),
        version: TOS_COMPLIANCE_VERSION,
        signature,
        timezone: getUserTimezone(),
        timestamp: new Date().toISOString(),
      })
    );
  } catch (err) {
    console.error('Failed to save legal consent in localStorage:', err);
  }
}
