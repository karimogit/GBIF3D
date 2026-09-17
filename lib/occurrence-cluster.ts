/**
 * Grid-based clustering for large occurrence sets to keep rendering fast.
 */
import type { GBIFOccurrence } from '@/types/gbif';

export const CLUSTER_THRESHOLD = 2500;
/** Default grid cell size in degrees when camera height is unknown. */
const DEFAULT_CELL_DEG = 0.5;

export interface ClusterPoint {
  /** Representative occurrence or synthetic cluster record. */
  occurrence: GBIFOccurrence;
  /** Number of occurrences in this cluster (1 = individual). */
  count: number;
  isCluster: boolean;
}

function hasCoords(o: GBIFOccurrence): boolean {
  return (
    o.decimalLatitude != null &&
    o.decimalLongitude != null &&
    Number.isFinite(o.decimalLatitude) &&
    Number.isFinite(o.decimalLongitude)
  );
}

/** Map camera height (meters) to grid cell size in degrees. */
export function cellSizeForCameraHeight(heightMeters: number): number {
  if (!Number.isFinite(heightMeters) || heightMeters <= 0) return DEFAULT_CELL_DEG;
  if (heightMeters > 5_000_000) return 2;
  if (heightMeters > 1_000_000) return 1;
  if (heightMeters > 200_000) return 0.25;
  if (heightMeters > 50_000) return 0.08;
  if (heightMeters > 10_000) return 0.02;
  return 0.005;
}

let syntheticKeyCounter = -1_000_000;

function nextSyntheticKey(): number {
  syntheticKeyCounter -= 1;
  return syntheticKeyCounter;
}

/**
 * Cluster occurrences into grid cells. Returns individual points when below threshold
 * or when cell size is small enough that clustering would not help.
 */
export function clusterOccurrences(
  occurrences: GBIFOccurrence[],
  cellSizeDeg: number = DEFAULT_CELL_DEG
): ClusterPoint[] {
  const withCoords = occurrences.filter(hasCoords);
  if (withCoords.length <= CLUSTER_THRESHOLD || cellSizeDeg <= 0.003) {
    return withCoords.map((o) => ({ occurrence: o, count: 1, isCluster: false }));
  }

  const buckets = new Map<string, GBIFOccurrence[]>();
  for (const o of withCoords) {
    const lat = o.decimalLatitude!;
    const lon = o.decimalLongitude!;
    const cellLat = Math.floor(lat / cellSizeDeg);
    const cellLon = Math.floor(lon / cellSizeDeg);
    const key = `${cellLat},${cellLon}`;
    const list = buckets.get(key);
    if (list) list.push(o);
    else buckets.set(key, [o]);
  }

  const result: ClusterPoint[] = [];
  for (const group of buckets.values()) {
    if (group.length === 1) {
      result.push({ occurrence: group[0], count: 1, isCluster: false });
      continue;
    }
    let sumLat = 0;
    let sumLon = 0;
    for (const o of group) {
      sumLat += o.decimalLatitude!;
      sumLon += o.decimalLongitude!;
    }
    const n = group.length;
    const rep = group[0];
    result.push({
      occurrence: {
        ...rep,
        key: nextSyntheticKey(),
        decimalLatitude: sumLat / n,
        decimalLongitude: sumLon / n,
        scientificName: `${n.toLocaleString()} occurrences`,
        vernacularName: undefined,
      },
      count: n,
      isCluster: true,
    });
  }
  return result;
}
