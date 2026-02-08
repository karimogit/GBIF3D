/**
 * Predefined regions for easy selection (bounds in lon/lat degrees)
 */

import type { Bounds } from './geometry';

export interface Region {
  id: string;
  name: string;
  bounds: Bounds;
}

/** Predefined regions: World and continents */
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
    id: 'se',
    name: 'Sweden',
    bounds: { west: 10.58, south: 55.01, east: 24.18, north: 69.06 },
  },
  {
    id: 'no',
    name: 'Norway',
    bounds: { west: 4.65, south: 57.96, east: 31.08, north: 71.19 },
  },
  {
    id: 'dk',
    name: 'Denmark',
    bounds: { west: 8.08, south: 54.56, east: 15.16, north: 57.75 },
  },
  {
    id: 'fi',
    name: 'Finland',
    bounds: { west: 20.55, south: 59.75, east: 31.59, north: 70.09 },
  },
  {
    id: 'de',
    name: 'Germany',
    bounds: { west: 5.87, south: 47.27, east: 15.04, north: 55.06 },
  },
  {
    id: 'fr',
    name: 'France',
    bounds: { west: -5.14, south: 41.33, east: 9.56, north: 51.09 },
  },
  {
    id: 'gb',
    name: 'United Kingdom',
    bounds: { west: -8.65, south: 49.86, east: 1.76, north: 60.86 },
  },
  {
    id: 'us',
    name: 'United States',
    bounds: { west: -125, south: 24.5, east: -66.5, north: 49.5 },
  },
  {
    id: 'ca',
    name: 'Canada',
    bounds: { west: -141, south: 41.68, east: -52.62, north: 83.11 },
  },
  {
    id: 'br',
    name: 'Brazil',
    bounds: { west: -73.99, south: -33.75, east: -34.79, north: 5.27 },
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
