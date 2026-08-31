import * as Cesium from 'cesium';
import type { GBIFOccurrence } from '@/types/gbif';
import { LIGHTBOX_PHOTO_CLASS, SAVE_BUTTON_CLASS } from './constants';

const IUCN_COLORS: Record<string, string> = {
  EX: '#000000',
  EW: '#8B0000',
  CR: '#FF0000',
  EN: '#FF9800',
  VU: '#F9A825',
  NT: '#FBC02D',
  LC: '#2E7D32',
  DD: '#757575',
  NA: '#BDBDBD',
};

const IUCN_LABELS: Record<string, string> = {
  EX: 'Extinct',
  EW: 'Extinct in the Wild',
  CR: 'Critically Endangered',
  EN: 'Endangered',
  VU: 'Vulnerable',
  NT: 'Near Threatened',
  LC: 'Least Concern',
  DD: 'Data Deficient',
  NA: 'Not Assessed',
};

let occurrencePointScaleByDistance: Cesium.NearFarScalar | undefined;

export function getOccurrencePointScaleByDistance(): Cesium.NearFarScalar {
  if (!occurrencePointScaleByDistance) {
    occurrencePointScaleByDistance = new Cesium.NearFarScalar(2e2, 1.6, 1e7, 0.5);
  }
  return occurrencePointScaleByDistance;
}

function formatIucnStatus(code: string): string {
  if (!code) return '';
  const upper = code.toUpperCase();
  const label = IUCN_LABELS[upper];
  return label ? `${upper} (${label})` : code;
}

function toFullSizeUrl(thumbUrl: string): string {
  return thumbUrl.replace('/200x/', '/800x/');
}

function formatCoord(value: number, type: 'lat' | 'lon'): string {
  const abs = Math.abs(value);
  const deg = Math.floor(abs);
  const min = (abs - deg) * 60;
  const dir = type === 'lat' ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W';
  return `${deg}°${min.toFixed(2)}′${dir}`;
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

export function colorForOccurrence(occ: GBIFOccurrence): Cesium.Color {
  const cat = occ.iucnRedListCategory?.toUpperCase();
  if (cat && IUCN_COLORS[cat]) {
    return Cesium.Color.fromCssColorString(IUCN_COLORS[cat]);
  }
  return Cesium.Color.fromCssColorString('#4caf50');
}

export function occurrenceToDescription(
  occ: GBIFOccurrence,
  imageUrls?: string[] | null,
  savedKeys?: Set<number>
): string {
  const sci = occ.scientificName?.trim() || '';
  const vern = occ.vernacularName?.trim() || '';
  const name =
    vern && sci
      ? `${vern} (${sci})`
      : sci || vern || 'Unknown species';
  const date = occ.eventDate || (occ.year ? String(occ.year) : '—');
  const loc = occ.locality || occ.countryCode || '—';
  const gbifUrl = occ.key > 0 ? `https://www.gbif.org/occurrence/${occ.key}` : null;
  const validUrls = (imageUrls ?? []).filter((u) => typeof u === 'string' && /^https:\/\//.test(u)).slice(0, 4);
  const fullUrls = validUrls.map(toFullSizeUrl);
  const photoBox =
    validUrls.length > 0
      ? `<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 10px; width: 100%; max-width: 100%;">
${validUrls
  .map(
    (u, i) =>
      `<img class="${LIGHTBOX_PHOTO_CLASS}" src="${escapeHtml(u)}" data-fullurl="${escapeHtml(toFullSizeUrl(u))}" data-allurls="${escapeHtml(JSON.stringify(fullUrls))}" data-index="${i}" alt="" style="width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 8px; cursor: pointer;" loading="lazy" />`
  )
  .join('\n')}
</div>`
      : '';

  const lat = occ.decimalLatitude;
  const lon = occ.decimalLongitude;
  const coords =
    lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon)
      ? `${formatCoord(lat, 'lat')}, ${formatCoord(lon, 'lon')} (${lat.toFixed(5)}, ${lon.toFixed(5)})`
      : '—';

  const taxonomy: string[] = [];
  if (occ.kingdom) taxonomy.push(occ.kingdom);
  if (occ.phylum) taxonomy.push(occ.phylum);
  if (occ.class) taxonomy.push(occ.class);
  if (occ.order) taxonomy.push(occ.order);
  if (occ.family) taxonomy.push(occ.family);
  if (occ.genus) taxonomy.push(occ.genus);
  if (occ.species) taxonomy.push(occ.species);
  if (occ.infraspecificEpithet) taxonomy.push(occ.infraspecificEpithet);
  const taxonomyLine = taxonomy.length ? taxonomy.join(' › ') : '';

  const line = (label: string, value: string) =>
    value ? `<strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}<br/>` : '';
  const basis = occ.basisOfRecord
    ? occ.basisOfRecord.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : '';
  const country = occ.countryCode || '';
  const recordedBy = occ.recordedBy?.trim() || '';
  const institution = occ.institutionCode?.trim() || '';
  const dataset = occ.datasetName?.trim() || '';
  const iucnRaw = occ.iucnRedListCategory?.trim() || '';
  const iucn = formatIucnStatus(iucnRaw);
  const rank = occ.taxonRank?.trim() || '';

  return `
    <div style="font-family: system-ui; width: 100%; max-width: 100%; min-width: 0; font-size: 13px; line-height: 1.45;">
      ${photoBox}
      <strong style="display: block; word-break: break-word;">${escapeHtml(name)}</strong>
      ${rank ? ` <span style="color: #666; font-weight: normal;">(${escapeHtml(rank)})</span>` : ''}<br/>
      ${line('Date', date)}
      ${line('Location', loc)}
      ${line('Coordinates', coords)}
      ${taxonomyLine ? `<div style="margin-top: 4px;"><strong>Taxonomy:</strong> <span style="display: block; word-break: break-word; overflow-wrap: break-word;">${escapeHtml(taxonomyLine)}</span></div>` : ''}
      ${line('Basis of record', basis)}
      ${country && !loc.includes(country) ? line('Country', country) : ''}
      ${line('Recorded by', recordedBy)}
      ${line('Institution', institution)}
      ${line('Dataset', dataset)}
      ${line('IUCN status', iucn)}
      <div style="margin-top: 10px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center;">
        ${gbifUrl ? `<a href="${escapeHtml(gbifUrl)}" target="_blank" rel="noopener noreferrer" class="gbif-infobox-view-button" style="display: inline-block; padding: 8px 14px; background: #4caf50; color: #fff; border-radius: 6px; text-decoration: none; font-weight: 500; font-size: 14px;">View on GBIF →</a>` : '<span style="display: inline-block; padding: 8px 0; color: rgba(255,255,255,0.75); font-size: 13px;">Imported record</span>'}
        <a href="#" class="${SAVE_BUTTON_CLASS}" data-key="${occ.key}" data-action="${savedKeys?.has(occ.key) ? 'remove' : 'add'}" style="display: inline-block; padding: 8px 14px; background: ${savedKeys?.has(occ.key) ? 'rgba(76, 175, 80, 0.3)' : 'rgba(255,255,255,0.15)'}; color: ${savedKeys?.has(occ.key) ? '#2e7d32' : 'rgba(255,255,255,0.9)'}; border: 1px solid rgba(255,255,255,0.3); border-radius: 6px; text-decoration: none; font-weight: 500; font-size: 14px;">${savedKeys?.has(occ.key) ? 'Saved ✓' : 'Save'}</a>
      </div>
    </div>
  `;
}
