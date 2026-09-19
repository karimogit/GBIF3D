/**
 * Generate a PDF report from GBIF occurrences: map snapshot, species summary, filter info, header/footer with links.
 */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { GBIFOccurrence, OccurrenceFilters } from '@/types/gbif';
import { countryCodeToName } from './country-names';
import { formatIucnStatus } from './iucn';
import { occurrenceYear } from './occurrence-date';

const MARGIN = 14;
const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 297;
const CONTENT_WIDTH_MM = PAGE_WIDTH_MM - 2 * MARGIN;
const TITLE_FONT_SIZE = 16;
const SUBTITLE_FONT_SIZE = 10;
const SECTION_FONT_SIZE = 11;
const BODY_FONT_SIZE = 10;
const SMALL_FONT_SIZE = 9;
const TABLE_FONT_SIZE = 8;
const HEADER_BAR_HEIGHT_MM = 4;
const HEADER_HEIGHT_MM = 22;
const FOOTER_Y_MM = PAGE_HEIGHT_MM - 12;
/** Table rows may not run into the header on continuation pages or the footer on any page. */
const TABLE_TOP_MARGIN_MM = HEADER_HEIGHT_MM + 4;
const TABLE_BOTTOM_MARGIN_MM = PAGE_HEIGHT_MM - FOOTER_Y_MM + 6;

const GBIF_URL = 'https://www.gbif.org';
const DEFAULT_GLOBE_REPO_URL = 'https://github.com/karimogit/GBIF3D';

/* Site colors: GBIF green and dark green */
const RGB_GBIF_GREEN = [76, 175, 80] as [number, number, number];
const RGB_GBIF_DARK = [46, 125, 50] as [number, number, number];
const RGB_TEXT = [26, 26, 26] as [number, number, number];
const RGB_TEXT_MUTED = [97, 97, 97] as [number, number, number];
const RGB_ROW_ALT = [248, 250, 248] as [number, number, number];

function speciesKey(occ: GBIFOccurrence): string {
  const name = occ.scientificName ?? occ.species ?? occ.genus ?? 'Unknown';
  return String(name).trim() || 'Unknown';
}

interface SpeciesRow {
  scientificName: string;
  vernacularName: string;
  count: number;
  iucn: string;
  yearRange: string;
  countries: string;
}

/** Build species summary: one row per unique species with count, IUCN, year range, and countries. */
function buildSpeciesSummary(occurrences: GBIFOccurrence[]): SpeciesRow[] {
  const byKey = new Map<
    string,
    {
      scientificName: string;
      vernacularName: string;
      count: number;
      iucn: string;
      minYear: number | null;
      maxYear: number | null;
      countries: Set<string>;
    }
  >();
  for (const occ of occurrences) {
    const key = speciesKey(occ);
    const existing = byKey.get(key);
    const sci = occ.scientificName ?? occ.species ?? occ.genus ?? '—';
    const vern = occ.vernacularName?.trim() ?? '—';
    const iucnRaw = occ.iucnRedListCategory?.trim() ?? '';
    const iucn = iucnRaw ? formatIucnStatus(iucnRaw) : '—';
    const year = occurrenceYear(occ);
    const country =
      occ.country?.trim() ||
      countryCodeToName(occ.countryCode) ||
      occ.countryCode?.trim();
    if (existing) {
      existing.count += 1;
      if (iucn !== '—' && existing.iucn === '—') existing.iucn = iucn;
      if (year != null) {
        existing.minYear = existing.minYear == null ? year : Math.min(existing.minYear, year);
        existing.maxYear = existing.maxYear == null ? year : Math.max(existing.maxYear, year);
      }
      if (country) existing.countries.add(country);
    } else {
      byKey.set(key, {
        scientificName: sci,
        vernacularName: vern,
        count: 1,
        iucn,
        minYear: year,
        maxYear: year,
        countries: country ? new Set([country]) : new Set(),
      });
    }
  }
  return Array.from(byKey.values())
    .map((s) => {
      const { minYear: minY, maxYear: maxY } = s;
      const yearRange =
        minY != null && maxY != null ? (minY === maxY ? String(minY) : `${minY}–${maxY}`) : '—';
      const countries =
        s.countries.size === 0
          ? '—'
          : Array.from(s.countries).slice(0, 6).join(', ') + (s.countries.size > 6 ? '…' : '');
      return {
        scientificName: s.scientificName,
        vernacularName: s.vernacularName,
        count: s.count,
        iucn: s.iucn,
        yearRange,
        countries,
      };
    })
    .sort((a, b) => b.count - a.count);
}

function filterSummary(filters: OccurrenceFilters): string[] {
  const lines: string[] = [];
  const species = filters.selectedSpeciesOptions;
  if (species?.length) {
    lines.push(`Species: ${species.map((s) => s.label).join('; ')}`);
  } else if (filters.taxonKeys?.length) {
    lines.push(`Taxon keys: ${filters.taxonKeys.join(', ')}`);
  } else if (filters.taxonKey != null) {
    lines.push(`Taxon key: ${filters.taxonKey}`);
  }
  if (filters.eventDate?.trim()) lines.push(`Date range: ${filters.eventDate.replace('/', ' – ')}`);
  if (filters.continent?.trim()) lines.push(`Continent: ${filters.continent.replace(/_/g, ' ')}`);
  if (filters.country?.trim()) {
    lines.push(`Country filter: ${countryCodeToName(filters.country) ?? filters.country}`);
  }
  if (filters.datasetKey?.trim()) lines.push(`Dataset: ${filters.datasetKey}`);
  if (filters.institutionCode?.trim()) lines.push(`Institution: ${filters.institutionCode}`);
  if (filters.iucnRedListCategory?.trim()) {
    lines.push(`IUCN: ${formatIucnStatus(filters.iucnRedListCategory)}`);
  }
  if (filters.basisOfRecord?.trim()) {
    lines.push(`Basis of record: ${filters.basisOfRecord.replace(/_/g, ' ')}`);
  }
  if (filters.limit != null) lines.push(`Max results: ${filters.limit.toLocaleString()}`);
  return lines;
}

export interface PdfExportOptions {
  occurrences: GBIFOccurrence[];
  filters: OccurrenceFilters;
  /** Optional region name (e.g. "Europe", "Drawn region", place name) */
  regionName?: string;
  /** Optional WKT polygon for the selected region boundary */
  regionPolygonWkt?: string;
  /** Optional map snapshot data URL (JPEG) from globe canvas */
  mapImageDataUrl?: string;
  /** Optional repository URL for the generated-by footer link. */
  repoUrl?: string;
}

function drawHeader(doc: jsPDF): void {
  const left = MARGIN;
  const right = PAGE_WIDTH_MM - MARGIN;

  doc.setFillColor(...RGB_GBIF_GREEN);
  doc.rect(0, 0, PAGE_WIDTH_MM, HEADER_BAR_HEIGHT_MM, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(TITLE_FONT_SIZE);
  doc.setTextColor(...RGB_TEXT);
  doc.text('GBIF 3D', left, HEADER_BAR_HEIGHT_MM + 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(SUBTITLE_FONT_SIZE);
  doc.setTextColor(...RGB_TEXT_MUTED);
  doc.text('Occurrence report', left, HEADER_BAR_HEIGHT_MM + 14);

  doc.setDrawColor(220, 220, 220);
  doc.line(left, HEADER_HEIGHT_MM, right, HEADER_HEIGHT_MM);
  doc.setTextColor(...RGB_TEXT);
  doc.setFont('helvetica', 'normal');
}

function drawFooter(doc: jsPDF, pageNum: number, globeRepoUrl: string): void {
  doc.setFontSize(SMALL_FONT_SIZE);
  const y = FOOTER_Y_MM;
  const left = MARGIN;
  const right = PAGE_WIDTH_MM - MARGIN;

  doc.setTextColor(...RGB_GBIF_DARK);
  doc.textWithLink('Data from GBIF', left, y, { url: GBIF_URL });
  let x = left + doc.getTextWidth('Data from GBIF');
  doc.setTextColor(...RGB_TEXT_MUTED);
  doc.text(' · ', x, y);
  x += doc.getTextWidth(' · ');
  doc.setTextColor(...RGB_GBIF_DARK);
  doc.textWithLink('Generated by GBIF 3D', x, y, { url: globeRepoUrl });
  doc.setTextColor(...RGB_TEXT_MUTED);
  const pageText = `Page ${pageNum}`;
  doc.text(pageText, right - doc.getTextWidth(pageText), y);
}

function drawSectionTitle(doc: jsPDF, title: string, y: number): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(SECTION_FONT_SIZE);
  doc.setTextColor(...RGB_GBIF_DARK);
  doc.text(title, MARGIN, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(BODY_FONT_SIZE);
  doc.setTextColor(...RGB_TEXT);
  return y + 6;
}

function drawWrappedLines(doc: jsPDF, lines: string[], y: number, indent = 0): number {
  doc.setFontSize(BODY_FONT_SIZE);
  for (const line of lines) {
    const wrapped = doc.splitTextToSize(line, CONTENT_WIDTH_MM - indent);
    doc.text(wrapped, MARGIN + indent, y);
    y += wrapped.length * 4.8;
  }
  return y;
}

/**
 * Generate and download a PDF report with header, map snapshot (if provided),
 * filter summary, species table, and footer with links.
 */
export function generateOccurrencePdf({
  occurrences,
  filters,
  regionName,
  regionPolygonWkt,
  mapImageDataUrl,
  repoUrl,
}: PdfExportOptions): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const globeRepoUrl = repoUrl?.trim() || DEFAULT_GLOBE_REPO_URL;
  let y = HEADER_HEIGHT_MM + 6;

  drawHeader(doc);

  doc.setFontSize(SMALL_FONT_SIZE);
  doc.setTextColor(...RGB_TEXT_MUTED);
  doc.text(`Exported ${new Date().toLocaleString()}`, MARGIN, y);
  doc.setTextColor(...RGB_TEXT);
  y += 8;

  if (regionName?.trim()) {
    y = drawSectionTitle(doc, 'Region', y);
    y = drawWrappedLines(doc, [regionName.trim()], y);
    y += 2;
  }

  const filterLines = filterSummary(filters);
  if (filterLines.length > 0) {
    y = drawSectionTitle(doc, 'Filters', y);
    y = drawWrappedLines(
      doc,
      filterLines.map((line) => `• ${line}`),
      y,
      2
    );
    y += 2;
  }

  const speciesSummary = buildSpeciesSummary(occurrences);
  y = drawSectionTitle(doc, 'Summary', y);
  y = drawWrappedLines(
    doc,
    [
      `Total occurrences: ${occurrences.length.toLocaleString()}`,
      `Unique species: ${speciesSummary.length.toLocaleString()}`,
    ],
    y
  );
  y += 4;

  if (mapImageDataUrl) {
    y = drawSectionTitle(doc, 'Map view', y);
    try {
      const imgW = CONTENT_WIDTH_MM;
      const imgH = Math.min(72, imgW * 0.55);
      doc.addImage(mapImageDataUrl, 'JPEG', MARGIN, y, imgW, imgH, undefined, 'FAST');
      y += imgH + 8;
    } catch {
      y = drawWrappedLines(doc, ['Map snapshot unavailable.'], y);
      y += 4;
    }
  }

  if (regionPolygonWkt?.trim()) {
    y = drawSectionTitle(doc, 'Region boundary', y);
    const wkt = regionPolygonWkt.trim();
    y = drawWrappedLines(doc, [wkt.length > 500 ? `${wkt.slice(0, 497)}…` : wkt], y, 2);
    y += 4;
  }

  if (speciesSummary.length === 0) {
    y = drawWrappedLines(doc, ['No species data to display.'], y);
    drawFooter(doc, 1, globeRepoUrl);
    doc.save('gbif-globe-report.pdf');
    return;
  }

  if (y > PAGE_HEIGHT_MM - 80) {
    doc.addPage();
    drawHeader(doc);
    y = HEADER_HEIGHT_MM + 8;
  }

  y = drawSectionTitle(doc, `Species (${speciesSummary.length})`, y);
  y += 2;

  autoTable(doc, {
    startY: y,
    head: [['Scientific name', 'Common name', 'Count', 'IUCN status', 'Years', 'Countries']],
    body: speciesSummary.map((s) => [
      s.scientificName,
      s.vernacularName,
      String(s.count),
      s.iucn,
      s.yearRange,
      s.countries,
    ]),
    margin: { left: MARGIN, right: MARGIN, top: TABLE_TOP_MARGIN_MM, bottom: TABLE_BOTTOM_MARGIN_MM },
    styles: {
      fontSize: TABLE_FONT_SIZE,
      cellPadding: 2.5,
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: {
      fillColor: [...RGB_GBIF_GREEN],
      textColor: [255, 255, 255],
      fontSize: TABLE_FONT_SIZE,
      fontStyle: 'bold',
      halign: 'left',
      cellPadding: 3,
    },
    bodyStyles: {
      textColor: [...RGB_TEXT],
    },
    alternateRowStyles: {
      fillColor: [...RGB_ROW_ALT],
    },
    columnStyles: {
      0: { cellWidth: 46 },
      1: { cellWidth: 34 },
      2: { cellWidth: 16, halign: 'right' },
      3: { cellWidth: 28, halign: 'center' },
      4: { cellWidth: 20, halign: 'center' },
      5: { cellWidth: 'auto' },
    },
    didDrawPage: (data) => {
      const currentPage = doc.getCurrentPageInfo().pageNumber ?? 1;
      if (currentPage > 1) drawHeader(doc);
      drawFooter(doc, currentPage, globeRepoUrl);
      if (data.cursor) y = data.cursor.y;
    },
  });

  doc.save('gbif-globe-report.pdf');
}
