/** Resolve ISO 3166-1 alpha-2 codes to English country names. */
export function countryCodeToName(code?: string | null, locale = 'en'): string | undefined {
  const normalized = code?.trim().toUpperCase();
  if (!normalized || !/^[A-Z]{2}$/.test(normalized)) return undefined;
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(normalized) ?? normalized;
  } catch {
    return normalized;
  }
}
