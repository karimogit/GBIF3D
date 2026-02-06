import { REGIONS, getRegionById, getRegionBounds } from '@/lib/regions';

describe('regions', () => {
  describe('REGIONS', () => {
    it('has world region', () => {
      const world = REGIONS.find((r) => r.id === 'world');
      expect(world).toBeDefined();
      expect(world?.bounds).toEqual({
        west: -180,
        south: -90,
        east: 180,
        north: 90,
      });
    });

    it('each region has id, name, and bounds with west/south/east/north', () => {
      REGIONS.forEach((r) => {
        expect(r.id).toBeDefined();
        expect(r.name).toBeDefined();
        expect(r.bounds).toHaveProperty('west');
        expect(r.bounds).toHaveProperty('south');
        expect(r.bounds).toHaveProperty('east');
        expect(r.bounds).toHaveProperty('north');
      });
    });
  });

  describe('getRegionById', () => {
    it('returns region for valid id', () => {
      const r = getRegionById('europe');
      expect(r).toBeDefined();
      expect(r?.name).toBe('Europe');
      expect(r?.bounds.north).toBe(72);
    });

    it('returns undefined for unknown id', () => {
      expect(getRegionById('unknown')).toBeUndefined();
    });
  });

  describe('getRegionBounds', () => {
    it('returns bounds for valid id', () => {
      const b = getRegionBounds('europe');
      expect(b).toEqual({
        west: -25,
        south: 35,
        east: 40,
        north: 72,
      });
    });

    it('returns undefined for unknown id', () => {
      expect(getRegionBounds('unknown')).toBeUndefined();
    });
  });
});
