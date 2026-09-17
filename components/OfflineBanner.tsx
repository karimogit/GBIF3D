'use client';

export default function OfflineBanner({
  offlineMode,
  offlineLabel,
}: {
  offlineMode: boolean;
  offlineLabel: string | null;
}) {
  if (!offlineMode) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'absolute',
        top: 56,
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '6px 14px',
        background: 'rgba(255, 152, 0, 0.92)',
        color: '#111',
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 500,
        zIndex: 1001,
        maxWidth: 'min(90vw, 480px)',
        textAlign: 'center',
        pointerEvents: 'none',
      }}
    >
      {offlineLabel
        ? `Offline — showing cached data from ${offlineLabel}. Reconnect to refresh from GBIF.`
        : 'Offline — no cached data available. Reconnect to load occurrences.'}
    </div>
  );
}
