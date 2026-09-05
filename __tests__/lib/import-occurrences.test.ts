import {
  parseOccurrencesCSV,
  parseOccurrencesJSON,
  parseOccurrencesText,
  pickZipDataEntry,
} from '@/lib/import-occurrences';

describe('import occurrences', () => {
  describe('parseOccurrencesCSV', () => {
    it('assigns synthetic negative keys and keeps the GBIF key separately', () => {
      const csv = ['gbifID\tdecimalLatitude\tdecimalLongitude\tyear\tmonth\tday', '12345\t1\t2\t2020\t7\t15'].join(
        '\n'
      );
      const [rec] = parseOccurrencesCSV(csv);
      expect(rec.key).toBeLessThan(0);
      expect(rec.gbifKey).toBe(12345);
      expect(rec).toMatchObject({ year: 2020, month: 7, day: 15 });
    });

    it('derives month and day from eventDate and matches headers case-insensitively', () => {
      const csv = ['DECIMALLATITUDE,DECIMALLONGITUDE,EVENTDATE', '5,6,2019-03-09T10:00:00'].join('\n');
      const [rec] = parseOccurrencesCSV(csv);
      expect(rec).toMatchObject({ decimalLatitude: 5, decimalLongitude: 6, year: 2019, month: 3, day: 9 });
    });

    it('drops rows with out-of-range coordinates', () => {
      const csv = ['decimalLatitude,decimalLongitude', '95,10', '10,10'].join('\n');
      expect(parseOccurrencesCSV(csv)).toHaveLength(1);
    });

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

  describe('parseOccurrencesJSON', () => {
    it('reads arrays and { results } wrappers with synthetic keys', () => {
      const json = JSON.stringify({ results: [{ key: 7, decimalLatitude: 1, decimalLongitude: 2 }] });
      const [rec] = parseOccurrencesJSON(json);
      expect(rec.key).toBe(-1);
      expect(rec.gbifKey).toBe(7);
    });
  });

  describe('parseOccurrencesText', () => {
    it('parses .txt Darwin Core files as delimited text and .json as JSON', () => {
      const tsv = 'decimalLatitude\tdecimalLongitude\n1\t2';
      expect(parseOccurrencesText(tsv, 'occurrence.txt')).toHaveLength(1);
      expect(parseOccurrencesText('[{"decimalLatitude":1,"decimalLongitude":2}]', 'data.json')).toHaveLength(1);
      expect(parseOccurrencesText('[{"decimalLatitude":1,"decimalLongitude":2}]', 'noext')).toHaveLength(1);
    });
  });

  describe('pickZipDataEntry', () => {
    it('prefers occurrence.txt in a Darwin Core Archive over metadata files', () => {
      expect(pickZipDataEntry(['meta.xml', 'eml.xml', 'citations.txt', 'rights.txt', 'occurrence.txt'])).toBe(
        'occurrence.txt'
      );
      expect(pickZipDataEntry(['__MACOSX/._x.csv', 'export/', 'export/0012345.csv'])).toBe('export/0012345.csv');
      expect(pickZipDataEntry(['meta.xml'])).toBeUndefined();
    });
  });
});
