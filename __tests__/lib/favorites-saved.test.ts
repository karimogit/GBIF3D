import {
  getFavorites,
  addFavorite,
  removeFavorite,
} from '@/lib/favorites';
import {
  getSavedOccurrences,
  addSavedOccurrence,
  removeSavedOccurrence,
  isOccurrenceSaved,
} from '@/lib/saved-occurrences';
import type { GBIFOccurrence } from '@/types/gbif';

describe('favorites localStorage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('rejects malformed localStorage payloads', () => {
    window.localStorage.setItem('gbif-globe-favorites', '{not-json');
    expect(getFavorites()).toEqual([]);

    window.localStorage.setItem('gbif-globe-favorites', JSON.stringify({ id: 'x' }));
    expect(getFavorites()).toEqual([]);

    window.localStorage.setItem(
      'gbif-globe-favorites',
      JSON.stringify([{ id: 1, name: 'bad', bounds: { west: 'x' } }])
    );
    expect(getFavorites()).toEqual([]);
  });

  it('loads valid payloads and supports add/remove', () => {
    const fav = addFavorite('Sweden', { west: 10, south: 55, east: 25, north: 70 });
    expect(getFavorites()).toHaveLength(1);
    expect(getFavorites()[0].name).toBe('Sweden');
    expect(getFavorites()[0].id).toBe(fav.id);

    removeFavorite(fav.id);
    expect(getFavorites()).toEqual([]);
  });

  it('filters out invalid entries mixed with valid ones', () => {
    window.localStorage.setItem(
      'gbif-globe-favorites',
      JSON.stringify([
        { id: 'ok', name: 'Ok', bounds: { west: 1, south: 2, east: 3, north: 4 } },
        { id: 'bad', name: 'Bad' },
      ])
    );
    expect(getFavorites()).toEqual([
      { id: 'ok', name: 'Ok', bounds: { west: 1, south: 2, east: 3, north: 4 } },
    ]);
  });
});

describe('saved-occurrences localStorage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('rejects malformed localStorage payloads', () => {
    window.localStorage.setItem('gbif-globe-saved-occurrences', 'nope');
    expect(getSavedOccurrences()).toEqual([]);

    window.localStorage.setItem('gbif-globe-saved-occurrences', JSON.stringify({ key: 1 }));
    expect(getSavedOccurrences()).toEqual([]);

    window.localStorage.setItem(
      'gbif-globe-saved-occurrences',
      JSON.stringify([{ key: '1' }, { scientificName: 'x' }])
    );
    expect(getSavedOccurrences()).toEqual([]);
  });

  it('loads valid payloads and supports add/remove/isSaved', () => {
    const occ: GBIFOccurrence = { key: 123, scientificName: 'Pinus sylvestris' };
    addSavedOccurrence(occ);
    expect(getSavedOccurrences()).toEqual([occ]);
    expect(isOccurrenceSaved(123)).toBe(true);

    addSavedOccurrence(occ); // duplicate ignored
    expect(getSavedOccurrences()).toHaveLength(1);

    removeSavedOccurrence(123);
    expect(getSavedOccurrences()).toEqual([]);
    expect(isOccurrenceSaved(123)).toBe(false);
  });
});
