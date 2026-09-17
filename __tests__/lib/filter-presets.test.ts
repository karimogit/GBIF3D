import { addFilterPreset, getFilterPresets, removeFilterPreset } from '@/lib/filter-presets';

describe('filter-presets', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('saves and loads presets without geometry', () => {
    addFilterPreset('Birds EN', {
      taxonKey: 212,
      iucnRedListCategory: 'EN',
      limit: 500,
      geometry: 'POLYGON((0 0, 1 0, 1 1, 0 1, 0 0))',
    });
    const presets = getFilterPresets();
    expect(presets).toHaveLength(1);
    expect(presets[0].name).toBe('Birds EN');
    expect(presets[0].filters.taxonKey).toBe(212);
    expect(presets[0].filters.geometry).toBeUndefined();
    removeFilterPreset(presets[0].id);
    expect(getFilterPresets()).toEqual([]);
  });
});
