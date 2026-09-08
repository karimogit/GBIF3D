jest.mock('cesium', () => ({
  Color: { fromCssColorString: () => ({}) },
  NearFarScalar: function NearFarScalar() {},
}));

import { escapeHtml, occurrenceToDescription } from '@/components/globe/occurrence-infobox';
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

  describe('occurrenceToDescription', () => {
    const base: GBIFOccurrence = {
      key: 42,
      scientificName: 'Pinus sylvestris',
      decimalLatitude: 60,
      decimalLongitude: 15,
    };

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
