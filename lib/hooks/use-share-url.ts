'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { buildShareUrl, decodeShareUrlState, type ShareUrlState } from '@/lib/share-url';
import type { BaseMapId } from '@/lib/base-map';

export function useShareUrl(
  state: ShareUrlState,
  defaultBaseMap: BaseMapId,
  onHydrate: (decoded: ShareUrlState) => void
) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hydratedRef = useRef(false);
  const skipNextSyncRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const decoded = decodeShareUrlState(searchParams, defaultBaseMap);
    if (
      decoded.selectedRegionId ||
      decoded.placeSearchResult ||
      decoded.filters ||
      decoded.selectedYear != null ||
      decoded.sceneMode ||
      decoded.baseMap
    ) {
      skipNextSyncRef.current = true;
      onHydrate(decoded);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once from URL on mount
  }, []);

  useEffect(() => {
    if (skipNextSyncRef.current) {
      skipNextSyncRef.current = false;
      return;
    }
    const params = buildShareUrl(state).split('?')[1] ?? '';
    const current = searchParams.toString();
    if (params === current) return;
    const next = params ? `/?${params}` : '/';
    router.replace(next, { scroll: false });
  }, [state, router, searchParams]);

  const copyShareUrl = useCallback(async (): Promise<boolean> => {
    try {
      const url = buildShareUrl(state);
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      return false;
    }
  }, [state]);

  return { copyShareUrl };
}
