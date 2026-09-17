import { clusterOccurrences, CLUSTER_THRESHOLD } from '@/lib/occurrence-cluster';
import type { GBIFOccurrence } from '@/types/gbif';

function makeOccurrences(n: number): GBIFOccurrence[] {
  return Array.from({ length: n }, (_, i) => ({
    key: i + 1,
    decimalLatitude: (i % 100) * 0.5,
    decimalLongitude: Math.floor(i / 100) * 0.5,
    scientificName: `Species ${i}`,
  }));
}

describe('occurrence-cluster', () => {
  it('returns individual points below threshold', () => {
    const occs = makeOccurrences(100);
    const result = clusterOccurrences(occs, 0.5);
    expect(result).toHaveLength(100);
    expect(result.every((r) => !r.isCluster)).toBe(true);
  });

  it('clusters large datasets', () => {
    const occs = makeOccurrences(CLUSTER_THRESHOLD + 500);
    const result = clusterOccurrences(occs, 1);
    expect(result.length).toBeLessThan(occs.length);
    expect(result.some((r) => r.isCluster)).toBe(true);
  });
});
