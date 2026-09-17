import { countryCodeToName } from '@/lib/country-names';

describe('countryCodeToName', () => {
  it('returns English country names for ISO codes', () => {
    expect(countryCodeToName('SE')).toBe('Sweden');
    expect(countryCodeToName('us')).toBe('United States');
  });

  it('returns undefined for invalid codes', () => {
    expect(countryCodeToName('')).toBeUndefined();
    expect(countryCodeToName('SWE')).toBeUndefined();
  });
});
