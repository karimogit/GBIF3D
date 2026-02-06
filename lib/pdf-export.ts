/**
 * Generate a PDF report from GBIF occurrences: map snapshot, species summary, filter info, header/footer with links.
 */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { GBIFOccurrence, OccurrenceFilters } from '@/types/gbif';

const MARGIN = 14;
const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 297;
const TITLE_FONT_SIZE = 16;
const SUBTITLE_FONT_SIZE = 10;
const BODY_FONT_SIZE = 10;
const SMALL_FONT_SIZE = 9;
const HEADER_BAR_HEIGHT_MM = 4;
const HEADER_HEIGHT_MM = 22;
const FOOTER_Y_MM = PAGE_HEIGHT_MM - 12;

const GBIF_URL = 'https://www.gbif.org';
const GLOBE_REPO_URL = 'https://github.com/karimogit/GBIF3D';

/* Site colors: GBIF green and dark green */
const RGB_GBIF_GREEN = [76, 175, 80] as [number, number, number];
const RGB_GBIF_DARK = [46, 125, 50] as [number, number, number];
const RGB_TEXT = [26, 26, 26] as [number, number, number];
const RGB_TEXT_MUTED = [97, 97, 97] as [number, number, number];

function speciesKey(occ: GBIFOccurrence): string {
  const name = occ.scientificName ?? occ.species ?? occ.genus ?? 'Unknown';
  return String(name).trim() || 'Unknown';
}

function speciesDisplayName(occ: GBIFOccurrence): string {
  const sci = occ.scientificName ?? occ.species ?? occ.genus ?? '—';
  const vern = occ.vernacularName?.trim();
  if (vern) return `${vern} (${sci})`;
  return sci;
}

interface SpeciesRow {
  scientificName: string;
  vernacularName: string;
  count: number;
  iucn: string;
  yearRange: string;
  countries: string;
  coordinates: string;
  taxonomy: string;
  basisOfRecord: string;
}

/** Build species summary: one row per unique species with count, IUCN, year range, countries, coordinates, taxonomy, basis. */
function buildSpeciesSummary(occurrences: GBIFOccurrence[]): SpeciesRow[] {
  const byKey = new Map<
    string,
    {
      scientificName: string;
      vernacularName: string;
      count: number;
      iucn: string;
      years: number[];
      countries: Set<string>;
      exampleLat?: number;
      exampleLon?: number;
      kingdom?: string;
      family?: string;
      order?: string;
      basisOfRecord: Set<string>;
    }
  >();
  for (const occ of occurrences) {
    const key = speciesKey(occ);
    const existing = byKey.get(key);
    const sci = occ.scientificName ?? occ.species ?? occ.genus ?? '—';
    const vern = occ.vernacularName?.trim() ?? '—';
    const iucn = occ.iucnRedListCategory?.trim() ?? '—';
    const year = occ.year ?? (occ.eventDate ? new Date(occ.eventDate).getFullYear() : undefined);
    const country = occ.countryCode?.trim();
    const lat = occ.decimalLatitude;
    const lon = occ.decimalLongitude;
    const basis = occ.basisOfRecord?.trim();
    if (existing) {
      existing.count += 1;
      if (iucn !== '—' && existing.iucn === '—') existing.iucn = iucn;
      if (year != null && Number.isFinite(year)) existing.years.push(year);
      if (country) existing.countries.add(country);
      if (basis) existing.basisOfRecord.add(basis.replace(/_/g, ' '));
      if (existing.exampleLat == null && lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon)) {
        existing.exampleLat = lat;
        existing.exampleLon = lon;
      }
    } else {
      byKey.set(key, {
        scientificName: sci,
        vernacularName: vern,
        count: 1,
        iucn,
        years: year != null && Number.isFinite(year) ? [year] : [],
        countries: country ? new Set([country]) : new Set(),
        exampleLat: lat != null && Number.isFinite(lat) ? lat : undefined,
        exampleLon: lon != null && Number.isFinite(lon) ? lon : undefined,
        kingdom: occ.kingdom?.trim(),
        family: occ.family?.trim(),
        order: occ.order?.trim(),
        basisOfRecord: basis ? new Set([basis.replace(/_/g, ' ')]) : new Set(),
      });
    }
  }
  return Array.from(byKey.values()).map((s) => {
    const minY = s.years.length ? Math.min(...s.years) : null;
    const maxY = s.years.length ? Math.max(...s.years) : null;
    const yearRange =
      minY != null && maxY != null
        ? minY === maxY
          ? String(minY)
          : `${minY}–${maxY}`
        : '—';
    const countries =
      s.countries.size === 0
        ? '—'
        : Array.from(s.countries).slice(0, 5).join(', ') + (s.countries.size > 5 ? '…' : '');
    const coordinates =
      s.exampleLat != null && s.exampleLon != null
        ? `${s.exampleLat.toFixed(4)}, ${s.exampleLon.toFixed(4)}`
        : '—';
    const taxonomyParts = [s.kingdom, s.order, s.family].filter(Boolean) as string[];
    const taxonomy = taxonomyParts.length ? taxonomyParts.join(' › ') : '—';
    const basisStr =
      s.basisOfRecord.size === 0
        ? '—'
        : Array.from(s.basisOfRecord).slice(0, 2).join(', ') + (s.basisOfRecord.size > 2 ? '…' : '');
    return {
      scientificName: s.scientificName.length > 40 ? s.scientificName.slice(0, 37) + '…' : s.scientificName,
      vernacularName: s.vernacularName !== '—' && s.vernacularName.length > 22 ? s.vernacularName.slice(0, 19) + '…' : s.vernacularName,
      count: s.count,
      iucn: s.iucn,
      yearRange,
      countries,
      coordinates,
      taxonomy: taxonomy.length > 28 ? taxonomy.slice(0, 25) + '…' : taxonomy,
      basisOfRecord: basisStr.length > 18 ? basisStr.slice(0, 15) + '…' : basisStr,
    };
  }).sort((a, b) => b.count - a.count);
}

function filterSummary(filters: OccurrenceFilters): string[] {
  const lines: string[] = [];
  if (filters.taxonKeys?.length) {
    lines.push(`Taxon keys: ${filters.taxonKeys.join(', ')}`);
  } else if (filters.taxonKey != null) {
    lines.push(`Taxon key: ${filters.taxonKey}`);
  }
  if (filters.year?.trim()) lines.push(`Year: ${filters.year}`);
  if (filters.eventDate?.trim()) lines.push(`Date: ${filters.eventDate}`);
  if (filters.continent?.trim()) lines.push(`Continent: ${filters.continent}`);
  if (filters.country?.trim()) lines.push(`Country: ${filters.country}`);
  if (filters.datasetKey?.trim()) lines.push(`Dataset: ${filters.datasetKey}`);
  if (filters.institutionCode?.trim()) lines.push(`Institution: ${filters.institutionCode}`);
  if (filters.iucnRedListCategory?.trim()) lines.push(`IUCN: ${filters.iucnRedListCategory}`);
  if (filters.basisOfRecord?.trim()) lines.push(`Basis of record: ${filters.basisOfRecord}`);
  if (filters.limit != null) lines.push(`Max results: ${filters.limit}`);
  return lines;
}

export interface PdfExportOptions {
  occurrences: GBIFOccurrence[];
  filters: OccurrenceFilters;
  /** Optional region name (e.g. "Europe", "Drawn region", place name) */
  regionName?: string;
  /** Optional map snapshot data URL (JPEG) from globe canvas */
  mapImageDataUrl?: string;
}

function drawHeader(doc: jsPDF): void {
  const left = MARGIN;
  const right = PAGE_WIDTH_MM - MARGIN;

  /* Green bar at top (site accent) */
  doc.setFillColor(...RGB_GBIF_GREEN);
  doc.rect(0, 0, PAGE_WIDTH_MM, HEADER_BAR_HEIGHT_MM, 'F');

  /* Title and subtitle */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(TITLE_FONT_SIZE);
  doc.setTextColor(...RGB_TEXT);
  doc.text('GBIF 3D', left, HEADER_BAR_HEIGHT_MM + 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(SUBTITLE_FONT_SIZE);
  doc.setTextColor(...RGB_TEXT_MUTED);
  doc.text('Occurrence Report', left, HEADER_BAR_HEIGHT_MM + 14);

  /* Thin line under header */
  doc.setDrawColor(220, 220, 220);
  doc.line(left, HEADER_HEIGHT_MM, right, HEADER_HEIGHT_MM);
  doc.setTextColor(...RGB_TEXT);
  doc.setFont('helvetica', 'normal');
}

function drawFooter(doc: jsPDF, pageNum: number): void {
  doc.setFontSize(SMALL_FONT_SIZE);
  const y = FOOTER_Y_MM;
  const left = MARGIN;
  const right = PAGE_WIDTH_MM - MARGIN;

  /* Footer: link text only (no visible URL), site green for links */
  doc.setTextColor(...RGB_GBIF_DARK);
  doc.textWithLink('Data from GBIF', left, y, { url: GBIF_URL });
  let x = left + doc.getTextWidth('Data from GBIF');
  doc.setTextColor(...RGB_TEXT_MUTED);
  doc.text(' · ', x, y);
  x += doc.getTextWidth(' · ');
  doc.setTextColor(...RGB_GBIF_DARK);
  doc.textWithLink('Generated by GBIF 3D', x, y, { url: GLOBE_REPO_URL });
  doc.setTextColor(...RGB_TEXT_MUTED);
  const pageText = `Page ${pageNum}`;
  doc.text(pageText, right - doc.getTextWidth(pageText), y);
}

/**
 * Generate and download a PDF report with header, map snapshot (if provided),
 * filter summary, species table (scientific, vernacular, count, IUCN, year range, countries), and footer with links.
 */
export function generateOccurrencePdf({
  occurrences,
  filters,
  regionName,
  mapImageDataUrl,
}: PdfExportOptions): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let y = HEADER_HEIGHT_MM + 6;

  drawHeader(doc);

  doc.setFontSize(SMALL_FONT_SIZE);
  doc.text(`Exported: ${new Date().toLocaleString()}`, MARGIN, y);
  y += 6;

  if (regionName?.trim()) {
    doc.text(`Region: ${regionName.trim()}`, MARGIN, y);
    y += 6;
  }

  const filterLines = filterSummary(filters);
  if (filterLines.length > 0) {
    doc.text('Filters: ' + filterLines.join(' · '), MARGIN, y);
    y += 6;
  }

  doc.setFontSize(BODY_FONT_SIZE);
  doc.text(`Total occurrences: ${occurrences.length}`, MARGIN, y);
  y += 10;

  if (mapImageDataUrl) {
    try {
      const imgW = PAGE_WIDTH_MM - 2 * MARGIN;
      const imgH = Math.min(70, imgW * 0.6);
      doc.addImage(mapImageDataUrl, 'JPEG', MARGIN, y, imgW, imgH, undefined, 'FAST');
      y += imgH + 8;
    } catch {
      // If image fails (e.g. CORS), skip map
    }
  }

  const speciesSummary = buildSpeciesSummary(occurrences);
  if (speciesSummary.length === 0) {
    doc.text('No species data to display.', MARGIN, y);
    drawFooter(doc, 1);
    doc.save('gbif-globe-report.pdf');
    return;
  }

  doc.text(`Species (${speciesSummary.length}):`, MARGIN, y);
  y += 4;

  const tableStartY = y;
  autoTable(doc, {
    startY: tableStartY,
    head: [
      [
        'Scientific name',
        'Vernacular',
        'Count',
        'IUCN',
        'Year range',
        'Countries',
        'Coordinates',
        'Taxonomy',
        'Basis',
      ],
    ],
    body: speciesSummary.map((s) => [
      s.scientificName,
      s.vernacularName,
      String(s.count),
      s.iucn,
      s.yearRange,
      s.countries.length > 18 ? s.countries.slice(0, 15) + '…' : s.countries,
      s.coordinates,
      s.taxonomy,
      s.basisOfRecord,
    ]),
    margin: { left: MARGIN, right: MARGIN },
    headStyles: { fillColor: [...RGB_GBIF_GREEN], fontSize: 7, textColor: [255, 255, 255] },
    bodyStyles: { fontSize: 7 },
    columnStyles: {
      0: { cellWidth: 30 },
      1: { cellWidth: 22 },
      2: { cellWidth: 10 },
      3: { cellWidth: 11 },
      4: { cellWidth: 15 },
      5: { cellWidth: 20 },
      6: { cellWidth: 22 },
      7: { cellWidth: 26 },
      8: { cellWidth: 18 },
    },
    didDrawPage: (data) => {
      const currentPage = doc.getCurrentPageInfo().pageNumber ?? 1;
      if (currentPage > 1) drawHeader(doc);
      drawFooter(doc, currentPage);
      if (data.cursor) y = data.cursor.y;
    },
  });

  doc.save('gbif-globe-report.pdf');
}
