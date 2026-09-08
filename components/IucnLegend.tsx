'use client';

import Tooltip from '@mui/material/Tooltip';
import { IUCN_LEGEND_ITEMS } from '@/lib/iucn';

/** Compact colour key for the IUCN categories used to tint occurrence points. */
export default function IucnLegend() {
  return (
    <div
      role="group"
      aria-label="IUCN status colour legend"
      style={{
        padding: '6px 10px',
        borderRadius: 6,
        background: 'rgba(0,0,0,0.65)',
        color: '#fff',
        fontSize: 11,
        lineHeight: 1.4,
        pointerEvents: 'auto',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 2 }}>IUCN status</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {IUCN_LEGEND_ITEMS.map((item) => (
          <Tooltip key={item.label} title={item.title} placement="top" arrow enterDelay={300}>
            <span
              tabIndex={0}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                cursor: 'default',
                outline: 'none',
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: item.color,
                  display: 'inline-block',
                }}
              />
              <span>{item.label}</span>
            </span>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}
