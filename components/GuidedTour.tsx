'use client';

import { useCallback, useEffect, useState } from 'react';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

const TOUR_STORAGE_KEY = 'gbif-globe-tour-done';

export const TOUR_STEPS = [
  {
    target: '[data-tour="region"]',
    title: 'Pick a region',
    body: 'Search for a place, choose a continent, or draw your own area on the globe.',
  },
  {
    target: '[data-tour="filters"]',
    title: 'Filter by species',
    body: 'Open Filters to search species, set taxonomic groups, dates, and IUCN status.',
  },
  {
    target: '[data-tour="timeline"]',
    title: 'Timeline',
    body: 'Click a year bar to focus on that period. Use Play to animate through years.',
  },
  {
    target: '[data-tour="export"]',
    title: 'Export & share',
    body: 'Export maps and data, or copy a shareable link with your current filters.',
  },
  {
    target: '[data-tour="help"]',
    title: 'Help anytime',
    body: 'Reopen this guide from the ? icon whenever you need a refresher.',
  },
] as const;

export function shouldAutoStartTour(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(TOUR_STORAGE_KEY) !== '1';
  } catch {
    return false;
  }
}

export function markTourDone(): void {
  try {
    localStorage.setItem(TOUR_STORAGE_KEY, '1');
  } catch {
    // ignore
  }
}

export default function GuidedTour({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  const finish = useCallback(() => {
    markTourDone();
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, finish]);

  if (!open) return null;

  const current = TOUR_STEPS[step];
  const rect =
    typeof document !== 'undefined'
      ? document.querySelector(current.target)?.getBoundingClientRect()
      : null;

  return (
    <>
      <div
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.55)',
          zIndex: 11000,
        }}
        onClick={finish}
      />
      {rect && (
        <div
          aria-hidden
          style={{
            position: 'fixed',
            top: rect.top - 4,
            left: rect.left - 4,
            width: rect.width + 8,
            height: rect.height + 8,
            border: '2px solid #4caf50',
            borderRadius: 8,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
            zIndex: 11001,
            pointerEvents: 'none',
          }}
        />
      )}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Tour step ${step + 1}: ${current.title}`}
        style={{
          position: 'fixed',
          zIndex: 11002,
          top: rect ? Math.min(rect.bottom + 12, window.innerHeight - 180) : '30%',
          left: rect ? Math.min(Math.max(16, rect.left), window.innerWidth - 320) : '50%',
          transform: rect ? undefined : 'translateX(-50%)',
          width: 'min(300px, calc(100vw - 32px))',
          background: '#fff',
          borderRadius: 10,
          padding: 16,
          boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
        }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
          {current.title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {current.body}
        </Typography>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <Typography variant="caption" color="text.secondary">
            {step + 1} / {TOUR_STEPS.length}
          </Typography>
          <div style={{ display: 'flex', gap: 8 }}>
            {step > 0 && (
              <Button size="small" onClick={() => setStep((s) => s - 1)}>
                Back
              </Button>
            )}
            {step < TOUR_STEPS.length - 1 ? (
              <Button size="small" variant="contained" onClick={() => setStep((s) => s + 1)}>
                Next
              </Button>
            ) : (
              <Button size="small" variant="contained" onClick={finish}>
                Done
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
