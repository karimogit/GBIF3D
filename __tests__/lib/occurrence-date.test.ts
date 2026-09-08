import { occurrenceYear, occurrenceMonth } from '@/lib/occurrence-date';
import type { GBIFOccurrence } from '@/types/gbif';

describe('occurrence-date', () => {
  describe('occurrenceYear', () => {
    it('uses the year field when present', () => {
      expect(occurrenceYear({ key: 1, year: 2019 } as GBIFOccurrence)).toBe(2019);
    });

    it('parses year-only eventDate strings', () => {
      expect(occurrenceYear({ key: 1, eventDate: '2018' } as GBIFOccurrence)).toBe(2018);
    });

    it('parses ISO datetime eventDate', () => {
      expect(occurrenceYear({ key: 1, eventDate: '2021-06-15T12:00:00Z' } as GBIFOccurrence)).toBe(
        2021
      );
    });

    it('returns null when year cannot be determined', () => {
      expect(occurrenceYear({ key: 1 } as GBIFOccurrence)).toBeNull();
      expect(occurrenceYear({ key: 1, eventDate: 'not-a-date' } as GBIFOccurrence)).toBeNull();
    });
  });

  describe('occurrenceMonth', () => {
    it('uses the month field when in range', () => {
      expect(occurrenceMonth({ key: 1, month: 7 } as GBIFOccurrence)).toBe(7);
    });

    it('returns null for month out of range', () => {
      expect(occurrenceMonth({ key: 1, month: 0 } as GBIFOccurrence)).toBeNull();
      expect(occurrenceMonth({ key: 1, month: 13 } as GBIFOccurrence)).toBeNull();
    });

    it('parses month from ISO eventDate but not from year-only', () => {
      expect(occurrenceMonth({ key: 1, eventDate: '2020-03-01' } as GBIFOccurrence)).toBe(3);
      expect(occurrenceMonth({ key: 1, eventDate: '2020' } as GBIFOccurrence)).toBeNull();
    });

    it('returns null for invalid month segment in eventDate', () => {
      expect(occurrenceMonth({ key: 1, eventDate: '2020-13-01' } as GBIFOccurrence)).toBeNull();
      expect(occurrenceMonth({ key: 1, eventDate: '2020-00-01' } as GBIFOccurrence)).toBeNull();
    });
  });
});
