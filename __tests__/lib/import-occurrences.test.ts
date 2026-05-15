import { parseOccurrencesCSV } from '@/lib/import-occurrences';

describe('import occurrences', () => {
  describe('parseOccurrencesCSV', () => {
    it('handles escaped quotes, delimiters, and multiline quoted fields', () => {
      const csv = [
        'scientificName,decimalLatitude,decimalLongitude,locality,recordedBy',
        '"Puma ""concolor""",10.5,20.25,"Forest, north side","Ada"',
        '"Lynx lynx",11,21,"Line one',
        'line two","Bob"',
      ].join('\n');

      const records = parseOccurrencesCSV(csv);

      expect(records).toHaveLength(2);
      expect(records[0]).toMatchObject({
        scientificName: 'Puma "concolor"',
        decimalLatitude: 10.5,
        decimalLongitude: 20.25,
        locality: 'Forest, north side',
      });
      expect(records[1]).toMatchObject({
        scientificName: 'Lynx lynx',
        locality: 'Line one\nline two',
      });
    });
  });
});
