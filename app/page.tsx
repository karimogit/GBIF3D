'use client';

import { Suspense } from 'react';
import MapPageContent from '@/components/MapPageContent';

export default function Home() {
  return (
    <Suspense
      fallback={
        <main
          id="main-content"
          style={{
            width: '100%',
            height: '100dvh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0a0a0f',
            color: '#fff',
            fontFamily: 'Roboto, sans-serif',
          }}
        >
          Loading GBIF 3D…
        </main>
      }
    >
      <MapPageContent />
    </Suspense>
  );
}
