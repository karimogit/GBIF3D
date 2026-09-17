'use client';

import { useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  buildShareUrl,
  decodeShareUrlState,
  hasShareParams,
  type ShareUrlState,
} from '@/lib/share-url';
import type { BaseMapId } from '@/lib/base-map';

/** Survives Suspense remounts so shared URL state is applied only once per page load. */
let shareUrlHydrated = false;

export function resetShareUrlHydrationForTests(): void {
  shareUrlHydrated = false;
}

export function useShareUrl(
  state: ShareUrlState,
  defaultBaseMap: BaseMapId,
  onHydrate: (decoded: ShareUrlState) => void
) {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (shareUrlHydrated) return;
    shareUrlHydrated = true;
    const decoded = decodeShareUrlState(searchParams, defaultBaseMap);
    if (hasShareParams(decoded)) onHydrate(decoded);
  }, [searchParams, defaultBaseMap, onHydrate]);

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
