import * as Cesium from 'cesium';
import type { GBIFOccurrence } from '@/types/gbif';
import { countryCodeToName } from '@/lib/country-names';
import { IUCN_COLORS, formatIucnStatus } from '@/lib/iucn';
import { LIGHTBOX_PHOTO_CLASS, SAVE_BUTTON_CLASS } from './constants';

let occurrencePointScaleByDistance: Cesium.NearFarScalar | undefined;

export function getOccurrencePointScaleByDistance(): Cesium.NearFarScalar {
  if (!occurrencePointScaleByDistance) {
    occurrencePointScaleByDistance = new Cesium.NearFarScalar(2e2, 1.6, 1e7, 0.5);
  }
  return occurrencePointScaleByDistance;
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

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escape for both text content and double-quoted attribute values. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

export function colorForOccurrence(occ: GBIFOccurrence): Cesium.Color {
  const cat = occ.iucnRedListCategory?.toUpperCase();
  if (cat && IUCN_COLORS[cat]) {
    return Cesium.Color.fromCssColorString(IUCN_COLORS[cat]);
  }
  return Cesium.Color.fromCssColorString('#4caf50');
}

function normalizeText(value?: string | null): string {
  return value?.trim() ?? '';
}

function appendUniquePart(parts: string[], value: string): void {
  const trimmed = value.trim();
  if (!trimmed) return;
  const lower = trimmed.toLowerCase();
  if (parts.some((part) => part.toLowerCase() === lower || part.toLowerCase().includes(lower))) return;
  parts.push(trimmed);
}

/** Build a readable location string from GBIF occurrence locality fields. */
export function formatOccurrenceLocation(occ: GBIFOccurrence): string {
  const parts: string[] = [];
  appendUniquePart(parts, normalizeText(occ.locality));
  appendUniquePart(parts, normalizeText(occ.municipality));
  appendUniquePart(parts, normalizeText(occ.stateProvince));
  appendUniquePart(parts, normalizeText(occ.county));

  const country =
    normalizeText(occ.country) ||
    countryCodeToName(occ.countryCode) ||
    normalizeText(occ.countryCode);
  appendUniquePart(parts, country);

  return parts.length ? parts.join(', ') : '—';
}

function formatOccurrenceDate(occ: GBIFOccurrence): string {
  const raw = normalizeText(occ.eventDate);
  if (raw) {
    const dateOnly = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (dateOnly) return dateOnly[1];
    return raw.length > 10 ? raw.slice(0, 10) : raw;
  }
  if (occ.year != null) return String(occ.year);
  return '—';
}

function formatBasisOfRecord(value?: string): string {
  if (!value) return '';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Title for the Cesium info box — prefer English/common name when available. */
export function occurrenceInfoTitle(occ: GBIFOccurrence, englishName?: string | null): string {
  const english = normalizeText(englishName);
  if (english) return english;

  const vernacular = normalizeText(occ.vernacularName);
  const scientific = normalizeText(occ.scientificName);
  if (vernacular && scientific && vernacular.toLowerCase() !== scientific.toLowerCase()) return vernacular;
  return scientific || vernacular || `Occurrence ${occ.key}`;
}

export function occurrenceToDescription(
  occ: GBIFOccurrence,
  imageUrls?: string[] | null,
  savedKeys?: Set<number>,
  englishName?: string | null
): string {
  const scientific = normalizeText(occ.scientificName);
  const title = occurrenceInfoTitle(occ, englishName);
  const showScientific = Boolean(scientific && scientific !== title);

  const gbifKey = occ.key > 0 ? occ.key : occ.gbifKey;
  const gbifUrl = gbifKey != null && gbifKey > 0 ? `https://www.gbif.org/occurrence/${gbifKey}` : null;
  const validUrls = (imageUrls ?? []).filter((u) => typeof u === 'string' && /^https:\/\//.test(u)).slice(0, 4);
  const fullUrls = validUrls.map(toFullSizeUrl);
  // Wrap photos in <button> so mobile browsers treat them as real controls (bare <img>
  // often never receives a synthesized click inside Cesium's InfoBox iframe).
  const photoBox =
    validUrls.length > 0
      ? `<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 10px; width: 100%; max-width: 100%;">
${validUrls
  .map(
    (u, i) =>
      `<button type="button" class="${LIGHTBOX_PHOTO_CLASS}" data-fullurl="${escapeHtml(toFullSizeUrl(u))}" data-allurls="${escapeHtml(JSON.stringify(fullUrls))}" data-index="${i}" aria-label="Open photo ${i + 1}" style="display: block; width: 100%; padding: 0; margin: 0; border: none; background: transparent; border-radius: 8px; cursor: pointer; -webkit-tap-highlight-color: transparent; touch-action: manipulation;"><img src="${escapeHtml(u)}" alt="" style="display: block; width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 8px; pointer-events: none;" loading="lazy" /></button>`
  )
  .join('\n')}
</div>`
      : '';

  const lat = occ.decimalLatitude;
  const lon = occ.decimalLongitude;
  const coords =
    lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon)
      ? `${formatCoord(lat, 'lat')}, ${formatCoord(lon, 'lon')}`
      : '';

  const line = (label: string, value: string) =>
    value ? `<strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}<br/>` : '';

  const basis = formatBasisOfRecord(occ.basisOfRecord);
  const recordedBy = normalizeText(occ.recordedBy);
  const dataset = normalizeText(occ.datasetName);
  const institution = normalizeText(occ.institutionCode);
  const catalogNumber = normalizeText(occ.catalogNumber);
  const iucn = formatIucnStatus(normalizeText(occ.iucnRedListCategory));
  const isSaved = savedKeys?.has(occ.key) ?? false;

  const source =
    dataset && institution && !dataset.toLowerCase().includes(institution.toLowerCase())
      ? `${dataset} (${institution})`
      : dataset || institution;

  return `
    <div style="font-family: system-ui; width: 100%; max-width: 100%; min-width: 0; font-size: 13px; line-height: 1.45;">
      ${photoBox}
      ${showScientific ? `<div style="margin-bottom: 6px; word-break: break-word;"><em>${escapeHtml(scientific)}</em></div>` : ''}
      ${line('Date', formatOccurrenceDate(occ))}
      ${line('Location', formatOccurrenceLocation(occ))}
      ${line('Coordinates', coords)}
      ${line('IUCN status', iucn)}
      ${line('Recorded by', recordedBy)}
      ${line('Catalog number', catalogNumber)}
      ${line('Source', source)}
      ${line('Basis of record', basis)}
      <div style="margin-top: 10px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center;">
        ${gbifUrl ? `<a href="${escapeHtml(gbifUrl)}" target="_blank" rel="noopener noreferrer" class="gbif-infobox-view-button" style="display: inline-block; padding: 8px 14px; background: #4caf50; color: #fff; border-radius: 6px; text-decoration: none; font-weight: 500; font-size: 14px;">View on GBIF →</a>` : '<span style="display: inline-block; padding: 8px 0; color: rgba(255,255,255,0.75); font-size: 13px;">Imported record</span>'}
        <button type="button" role="button" class="${SAVE_BUTTON_CLASS}" data-key="${occ.key}" data-action="${isSaved ? 'remove' : 'add'}" style="display: inline-block; padding: 8px 14px; background: ${isSaved ? 'rgba(76, 175, 80, 0.3)' : 'rgba(255,255,255,0.15)'}; color: ${isSaved ? '#2e7d32' : 'rgba(255,255,255,0.9)'}; border: 1px solid rgba(255,255,255,0.3); border-radius: 6px; font-weight: 500; font-size: 14px; cursor: pointer; font-family: inherit;">${isSaved ? 'Saved ✓' : 'Save'}</button>
      </div>
    </div>
  `;
}
