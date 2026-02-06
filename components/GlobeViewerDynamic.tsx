'use client';

import dynamic from 'next/dynamic';

/**
 * Dynamic import wrapper for GlobeViewer to avoid HMR "disposed module" warnings
 * when app/page.tsx is hot-reloaded (the dynamic require stays in this module).
 */
const GlobeViewerDynamic = dynamic(
  () => import('@/components/GlobeViewer').then((mod) => ({ default: mod.default })),
  { ssr: false, loading: () => (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a0f',
        color: '#fff',
      }}
    >
      Loading globe…
    </div>
  ) }
);

export default GlobeViewerDynamic;
