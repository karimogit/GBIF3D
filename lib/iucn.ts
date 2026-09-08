/**
 * Shared IUCN Red List palette and labels.
 * Colour-blind friendly: black / dark red-brown / orange / gold / blue / green / grey
 * (avoids pure red vs green as the only distinction).
 */

export const IUCN_COLORS: Record<string, string> = {
  EX: '#000000',
  EW: '#5D4037',
  CR: '#E65100',
  EN: '#EF6C00',
  VU: '#F9A825',
  NT: '#1565C0',
  LC: '#2E7D32',
  DD: '#757575',
  NE: '#BDBDBD',
  NA: '#BDBDBD',
};

export const IUCN_LABELS: Record<string, string> = {
  EX: 'Extinct',
  EW: 'Extinct in the Wild',
  CR: 'Critically Endangered',
  EN: 'Endangered',
  VU: 'Vulnerable',
  NT: 'Near Threatened',
  LC: 'Least Concern',
  DD: 'Data Deficient',
  NE: 'Not Evaluated',
  NA: 'Not Applicable',
};

/** Compact legend rows (NE covers Not Evaluated / Not Applicable). */
export const IUCN_LEGEND_ITEMS: ReadonlyArray<{ label: string; color: string; title: string }> = [
  { label: 'EX', color: IUCN_COLORS.EX, title: IUCN_LABELS.EX },
  { label: 'EW', color: IUCN_COLORS.EW, title: IUCN_LABELS.EW },
  { label: 'CR', color: IUCN_COLORS.CR, title: IUCN_LABELS.CR },
  { label: 'EN', color: IUCN_COLORS.EN, title: IUCN_LABELS.EN },
  { label: 'VU', color: IUCN_COLORS.VU, title: IUCN_LABELS.VU },
  { label: 'NT', color: IUCN_COLORS.NT, title: IUCN_LABELS.NT },
  { label: 'LC', color: IUCN_COLORS.LC, title: IUCN_LABELS.LC },
  { label: 'DD', color: IUCN_COLORS.DD, title: IUCN_LABELS.DD },
  { label: 'NE', color: IUCN_COLORS.NE, title: 'Not Evaluated / Not Applicable' },
];

export function formatIucnStatus(code: string): string {
  if (!code) return '';
  const upper = code.toUpperCase();
  const label = IUCN_LABELS[upper];
  return label ? `${upper} (${label})` : code;
}
