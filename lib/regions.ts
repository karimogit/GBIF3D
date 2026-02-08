/**
 * Predefined regions for easy selection (bounds in lon/lat degrees)
 */

import type { Bounds } from './geometry';

export interface Region {
  id: string;
  name: string;
  bounds: Bounds;
}

/** Predefined regions: World and continents only */
export const REGIONS: Region[] = [
  {
    id: 'world',
    name: 'World',
    bounds: { west: -180, south: -90, east: 180, north: 90 },
  },
  {
    id: 'europe',
    name: 'Europe',
    bounds: { west: -25, south: 35, east: 40, north: 72 },
  },
  {
    id: 'north-america',
    name: 'North America',
    bounds: { west: -170, south: 15, east: -50, north: 72 },
  },
  {
    id: 'south-america',
    name: 'South America',
    bounds: { west: -82, south: -56, east: -35, north: 12 },
  },
  {
    id: 'africa',
    name: 'Africa',
    bounds: { west: -18, south: -35, east: 52, north: 37 },
  },
  {
    id: 'asia',
    name: 'Asia',
    bounds: { west: 60, south: -10, east: 180, north: 75 },
  },
  {
    id: 'oceania',
    name: 'Oceania',
    bounds: { west: 110, south: -50, east: 180, north: 0 },
  },
  {
    id: 'antarctica',
    name: 'Antarctica',
    bounds: { west: -180, south: -90, east: 180, north: -60 },
  },
];

const REGIONS_BY_ID = new Map(REGIONS.map((r) => [r.id, r]));

export function getRegionById(id: string): Region | undefined {
  return REGIONS_BY_ID.get(id);
}

export function getRegionBounds(id: string): Bounds | undefined {
  return REGIONS_BY_ID.get(id)?.bounds;
}
