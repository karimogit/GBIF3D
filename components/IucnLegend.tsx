'use client';

import Tooltip from '@mui/material/Tooltip';

const IUCN_LEGEND_ITEMS = [
  { label: 'EX', color: '#000000', title: 'Extinct' },
  { label: 'EW', color: '#8B0000', title: 'Extinct in the Wild' },
  { label: 'CR', color: '#FF0000', title: 'Critically Endangered' },
  { label: 'EN', color: '#FF9800', title: 'Endangered' },
  { label: 'VU', color: '#F9A825', title: 'Vulnerable' },
  { label: 'NT', color: '#FBC02D', title: 'Near Threatened' },
  { label: 'LC', color: '#2E7D32', title: 'Least Concern' },
  { label: 'DD', color: '#757575', title: 'Data Deficient' },
  { label: 'NE', color: '#BDBDBD', title: 'Not Evaluated / Not Applicable' },
];

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
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'default' }}>
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
            </div>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}
