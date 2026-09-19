import { act, renderHook } from '@testing-library/react';
import { useMapAppState } from '@/lib/hooks/use-map-app-state';

jest.mock('@/lib/gbif', () => ({
  ...jest.requireActual('@/lib/gbif'),
  searchOccurrencesChunked: jest.fn(() => new Promise(() => {})),
}));

// jspdf ships ESM only; the PDF export path is not exercised here.
jest.mock('@/lib/pdf-export', () => ({ generateOccurrencePdf: jest.fn() }));

jest.mock('@/lib/offline-cache', () => ({
  isOffline: () => false,
  loadOfflineSnapshot: jest.fn(async () => null),
  saveOfflineSnapshot: jest.fn(async () => {}),
}));

describe('useMapAppState timeline reset', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('clears year/month when the user picks a different taxon', () => {
    const { result } = renderHook(() => useMapAppState());

    act(() => {
      result.current.setFilters({ ...result.current.filters, taxonKeys: [212] });
      result.current.setSelectedYear(2020);
      result.current.setSelectedMonth(6);
    });
    expect(result.current.selectedYear).toBe(2020);
    expect(result.current.selectedMonth).toBe(6);

    act(() => {
      result.current.setFilters({ ...result.current.filters, taxonKeys: [359] });
    });
    expect(result.current.selectedYear).toBeNull();
    expect(result.current.selectedMonth).toBeNull();
  });

  it('keeps year/month when a non-taxon filter changes', () => {
    const { result } = renderHook(() => useMapAppState());

    act(() => {
      result.current.setFilters({ ...result.current.filters, taxonKeys: [212] });
      result.current.setSelectedYear(2020);
    });
    act(() => {
      result.current.setFilters({ ...result.current.filters, iucnRedListCategory: 'EN' });
    });
    expect(result.current.selectedYear).toBe(2020);
  });

  it('keeps year/month when the taxon is cleared', () => {
    const { result } = renderHook(() => useMapAppState());

    act(() => {
      result.current.setFilters({ ...result.current.filters, taxonKeys: [212] });
      result.current.setSelectedYear(2020);
    });
    act(() => {
      result.current.setFilters({ ...result.current.filters, taxonKeys: [] });
    });
    expect(result.current.selectedYear).toBe(2020);
  });

  it('preserves year/month hydrated from a share URL together with a taxon', () => {
    const { result } = renderHook(() => useMapAppState());

    act(() => {
      result.current.hydrateFromShareUrl({
        filters: { taxonKeys: [212], limit: 1000 },
        selectedYear: 2015,
        selectedMonth: 3,
      });
    });
    expect(result.current.filters.taxonKeys).toEqual([212]);
    expect(result.current.selectedYear).toBe(2015);
    expect(result.current.selectedMonth).toBe(3);
  });
});
