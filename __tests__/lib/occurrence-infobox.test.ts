jest.mock('cesium', () => ({
  Color: { fromCssColorString: () => ({}) },
  NearFarScalar: function NearFarScalar() {},
}));

import {
  escapeHtml,
  formatOccurrenceLocation,
  occurrenceInfoTitle,
  occurrenceToDescription,
} from '@/components/globe/occurrence-infobox';
import type { GBIFOccurrence } from '@/types/gbif';

describe('occurrence-infobox', () => {
  describe('escapeHtml', () => {
    it('escapes HTML special characters', () => {
      expect(escapeHtml(`<img src=x onerror=alert(1)>`)).toBe(
        '&lt;img src=x onerror=alert(1)&gt;'
      );
      expect(escapeHtml(`a&b"c'd`)).toBe('a&amp;b&quot;c&#39;d');
    });
  });

  describe('formatOccurrenceLocation', () => {
    it('uses full country name and admin fields instead of only a country code', () => {
      const occ: GBIFOccurrence = {
        key: 1,
        locality: 'Glädjan S, Leonardsberg, Ög',
        municipality: 'Norrköping',
        stateProvince: 'Östergötland',
        country: 'Sweden',
        countryCode: 'SE',
      };
      expect(formatOccurrenceLocation(occ)).toBe(
        'Glädjan S, Leonardsberg, Ög, Norrköping, Östergötland, Sweden'
      );
    });

    it('falls back from country code to English country name', () => {
      expect(formatOccurrenceLocation({ key: 2, countryCode: 'SE' })).toBe('Sweden');
    });
  });

  describe('occurrenceInfoTitle', () => {
    it('prefers the English/common name when provided', () => {
      const occ: GBIFOccurrence = {
        key: 1,
        scientificName: 'Apis mellifera Linnaeus, 1758',
        vernacularName: 'honungsbi',
      };
      expect(occurrenceInfoTitle(occ, 'Western honey bee')).toBe('Western honey bee');
    });
  });

  describe('occurrenceToDescription', () => {
    const base: GBIFOccurrence = {
      key: 42,
      scientificName: 'Apis mellifera Linnaeus, 1758',
      vernacularName: 'honungsbi',
      taxonRank: 'SPECIES',
      decimalLatitude: 58.58,
      decimalLongitude: 16.18,
      eventDate: '2026-01-03T13:34:03',
      country: 'Sweden',
      countryCode: 'SE',
      stateProvince: 'Östergötland',
      recordedBy: 'Ada Lovelace',
      datasetName: 'iNaturalist research-grade observations',
    };

    it('shows scientific name in the body but not duplicated as a heading', () => {
      const html = occurrenceToDescription(base, null, undefined, 'Western honey bee');
      expect(html).toContain('<em>Apis mellifera Linnaeus, 1758</em>');
      expect(html).not.toContain('(SPECIES)');
      expect(html).not.toContain('<strong style="display: block');
      expect(html).toContain('<strong>Location:</strong> Östergötland, Sweden');
    });

    it('escapes hostile scientificName so raw <img is not emitted as a tag', () => {
      const html = occurrenceToDescription({
        ...base,
        scientificName: '<img src=x onerror=alert(1)>',
      });
      expect(html).not.toMatch(/<img[^>]*onerror/i);
      expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    });

    it('filters javascript: imageUrls and keeps only https://', () => {
      const html = occurrenceToDescription(base, [
        'javascript:alert(1)',
        'http://insecure.example/photo.jpg',
        'https://images.example/ok.jpg',
      ]);
      expect(html).not.toContain('javascript:');
      expect(html).not.toContain('http://insecure.example');
      expect(html).toContain('https://images.example/ok.jpg');
      expect(html).toMatch(/<img class=/);
    });

    it('renders a normal https image', () => {
      const html = occurrenceToDescription(base, ['https://cdn.example/photo.jpg']);
      expect(html).toContain('src="https://cdn.example/photo.jpg"');
    });
  });
});
