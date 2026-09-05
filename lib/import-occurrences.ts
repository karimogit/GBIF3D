/**
 * Parse GBIF / Darwin Core occurrence data from CSV, TSV, JSON, or ZIP uploads.
 *
 * Imported records always get a synthetic (negative) key so they can never collide with
 * API occurrence keys (Cesium refuses duplicate entity ids). When the file carries a real
 * GBIF key it is preserved in `gbifKey` so the "View on GBIF" link still works.
 */
import JSZip from 'jszip';
import type { GBIFOccurrence } from '@/types/gbif';

const CSV_HEADER_ALIASES: Record<string, string> = {
  'decimal latitude': 'decimalLatitude',
  'decimal longitude': 'decimalLongitude',
  'decimallatitude': 'decimalLatitude',
  'decimallongitude': 'decimalLongitude',
  'scientific name': 'scientificName',
  'scientificname': 'scientificName',
  'vernacular name': 'vernacularName',
  'vernacularname': 'vernacularName',
  'event date': 'eventDate',
  'eventdate': 'eventDate',
  'country code': 'countryCode',
  'countrycode': 'countryCode',
  'basis of record': 'basisOfRecord',
  'basisofrecord': 'basisOfRecord',
  'iucn red list category': 'iucnRedListCategory',
  'iucnredlistcategory': 'iucnRedListCategory',
  'recorded by': 'recordedBy',
  'recordedby': 'recordedBy',
  'institution code': 'institutionCode',
  'institutioncode': 'institutionCode',
  'dataset name': 'datasetName',
  'datasetname': 'datasetName',
  'taxon rank': 'taxonRank',
  'taxonrank': 'taxonRank',
  'occurrence id': 'occurrenceID',
  'occurrenceid': 'occurrenceID',
  'dataset key': 'datasetKey',
  'datasetkey': 'datasetKey',
  'gbifid': 'gbifID',
};

const MAX_IMPORT_FILE_BYTES = 25 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 100;
const MAX_UNCOMPRESSED_ENTRY_BYTES = 25 * 1024 * 1024;

/** Darwin Core Archive side files that never hold occurrence rows. */
const DWCA_METADATA_FILES = new Set(['meta.xml', 'metadata.xml', 'eml.xml', 'citations.txt', 'rights.txt']);

function normalizeHeader(h: string): string {
  const trimmed = h.trim();
  const lower = trimmed.toLowerCase().replace(/\s+/g, ' ');
  return CSV_HEADER_ALIASES[lower] ?? trimmed.replace(/\s+/g, '');
}

function camelCase(s: string): string {
  return s.replace(/\s+(\w)/g, (_, c) => c.toUpperCase()).replace(/^\w/, (c) => c.toLowerCase());
}

function parseNum(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : undefined;
}

function parseIntInRange(v: unknown, min: number, max: number): number | undefined {
  const n = parseNum(v);
  if (n == null || !Number.isInteger(n) || n < min || n > max) return undefined;
  return n;
}

function parseYear(v: unknown): number | undefined {
  const n = parseNum(v);
  if (n != null && n >= 1000 && n <= 9999) return n;
  if (typeof v === 'string' && v.length >= 4) {
    const y = parseInt(v.slice(0, 4), 10);
    if (Number.isFinite(y)) return y;
  }
  return undefined;
}

/** Positive integer GBIF key from a `key` / `gbifID` column, if present. */
function parseGbifKey(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.trim()) : NaN;
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

function rowToOccurrence(row: Record<string, unknown>, syntheticKey: number): GBIFOccurrence {
  const byLowerKey = new Map<string, unknown>();
  for (const [k, v] of Object.entries(row)) byLowerKey.set(k.toLowerCase(), v);
  const get = (k: string): unknown => row[k] ?? byLowerKey.get(k.toLowerCase()) ?? row[camelCase(k)];
  const getStr = (k: string): string | undefined => {
    const v = get(k);
    if (typeof v === 'number') return String(v);
    return typeof v === 'string' ? v.trim() || undefined : undefined;
  };
  const lat = parseNum(get('decimalLatitude'));
  const lon = parseNum(get('decimalLongitude'));
  const eventDate = getStr('eventDate');
  const year = parseYear(get('year')) ?? (eventDate ? parseYear(eventDate) : undefined);
  const month =
    parseIntInRange(get('month'), 1, 12) ??
    (eventDate && /^\d{4}-\d{2}/.test(eventDate) ? parseIntInRange(eventDate.slice(5, 7), 1, 12) : undefined);
  const day =
    parseIntInRange(get('day'), 1, 31) ??
    (eventDate && /^\d{4}-\d{2}-\d{2}/.test(eventDate) ? parseIntInRange(eventDate.slice(8, 10), 1, 31) : undefined);
  const gbifKey = parseGbifKey(get('key')) ?? parseGbifKey(get('gbifID'));
  return {
    key: syntheticKey,
    ...(gbifKey != null ? { gbifKey } : {}),
    decimalLatitude: lat,
    decimalLongitude: lon,
    scientificName: getStr('scientificName'),
    vernacularName: getStr('vernacularName'),
    year,
    month,
    day,
    eventDate,
    countryCode: getStr('countryCode'),
    basisOfRecord: getStr('basisOfRecord'),
    iucnRedListCategory: getStr('iucnRedListCategory'),
    kingdom: getStr('kingdom'),
    phylum: getStr('phylum'),
    class: getStr('class'),
    family: getStr('family'),
    genus: getStr('genus'),
    species: getStr('species'),
    order: getStr('order'),
    taxonRank: getStr('taxonRank'),
    locality: getStr('locality'),
    recordedBy: getStr('recordedBy'),
    institutionCode: getStr('institutionCode'),
    datasetName: getStr('datasetName'),
    occurrenceID: getStr('occurrenceID'),
    datasetKey: getStr('datasetKey'),
  };
}

function hasValidCoords(lat: number | undefined, lon: number | undefined): lat is number {
  return lat != null && lon != null && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

/** Parse delimited text with RFC-4180-style quoted fields and escaped quotes. */
function parseDelimitedRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === delimiter && !inQuotes) {
      row.push(cur);
      cur = '';
    } else if ((c === '\n' || c === '\r') && !inQuotes) {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
      if (c === '\r' && text[i + 1] === '\n') i += 1;
    } else {
      cur += c;
    }
  }
  if (cur.length > 0 || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

/** Detect delimiter from first line: prefer the most frequent of comma, semicolon, or tab (GBIF exports are often TSV or semicolon-separated). */
function detectDelimiter(firstLine: string): string {
  let tabs = 0;
  let commas = 0;
  let semicolons = 0;
  let inQuotes = false;
  for (let i = 0; i < firstLine.length; i++) {
    const c = firstLine[i];
    if (c === '"' && inQuotes && firstLine[i + 1] === '"') i += 1;
    else if (c === '"') inQuotes = !inQuotes;
    else if (!inQuotes) {
      if (c === '\t') tabs += 1;
      else if (c === ',') commas += 1;
      else if (c === ';') semicolons += 1;
    }
  }
  if (semicolons >= tabs && semicolons >= commas) return ';';
  if (tabs >= commas) return '\t';
  return ',';
}

/**
 * Parse CSV/TSV text (header row + data). Expects GBIF/Darwin Core style columns.
 * Strips BOM. Detects tab vs comma delimiter so values like "Locality, Region" don't break columns.
 * Returns occurrences with valid decimalLatitude/decimalLongitude; assigns synthetic keys.
 */
export function parseOccurrencesCSV(text: string): GBIFOccurrence[] {
  const raw = text.replace(/^\uFEFF/, ''); // BOM
  const headerLine = raw.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = detectDelimiter(headerLine);
  const rows = parseDelimitedRows(raw, delimiter).filter((r) => r.some((v) => v.trim()));
  if (rows.length < 2) return [];
  const headerValues = rows[0];
  const headers = headerValues.map((h) => normalizeHeader(h.trim()) || camelCase(h.trim()));
  const results: GBIFOccurrence[] = [];
  let syntheticKey = -1;
  for (let i = 1; i < rows.length; i++) {
    const values = rows[i];
    const row: Record<string, unknown> = {};
    headers.forEach((h, j) => {
      if (h) row[h] = values[j]?.trim();
    });
    const lat = parseNum(row['decimalLatitude']);
    const lon = parseNum(row['decimalLongitude']);
    if (hasValidCoords(lat, lon)) {
      results.push(rowToOccurrence(row, syntheticKey));
      syntheticKey -= 1;
    }
  }
  return results;
}

/**
 * Parse JSON: array of objects with occurrence fields, or { results: [...] }.
 * Assigns synthetic keys for items that have decimalLatitude/decimalLongitude.
 */
export function parseOccurrencesJSON(text: string): GBIFOccurrence[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  const arr = Array.isArray(data) ? data : (data as { results?: unknown[] })?.results;
  if (!Array.isArray(arr)) return [];
  const results: GBIFOccurrence[] = [];
  let syntheticKey = -1;
  for (const item of arr) {
    if (item == null || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const lat = parseNum(row.decimalLatitude ?? row.decimallatitude);
    const lon = parseNum(row.decimalLongitude ?? row.decimallongitude);
    if (hasValidCoords(lat, lon)) {
      results.push(rowToOccurrence(row, syntheticKey));
      syntheticKey -= 1;
    }
  }
  return results;
}

const DELIMITED_EXTENSIONS = new Set(['csv', 'tsv', 'txt']);

function fileExtension(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

/** Parse by extension when it is unambiguous, otherwise sniff the content. */
export function parseOccurrencesText(text: string, filename: string): GBIFOccurrence[] {
  const ext = fileExtension(filename);
  if (ext === 'json') return parseOccurrencesJSON(text);
  if (DELIMITED_EXTENSIONS.has(ext)) return parseOccurrencesCSV(text);
  const looksLikeJson = /^\uFEFF?\s*[[{]/.test(text);
  return looksLikeJson ? parseOccurrencesJSON(text) : parseOccurrencesCSV(text);
}

/**
 * Pick the data file inside a ZIP: GBIF "simple" downloads hold one CSV/TSV, Darwin Core
 * Archives hold occurrence.txt next to meta.xml and other metadata files.
 */
export function pickZipDataEntry(names: string[]): string | undefined {
  const files = names.filter((n) => !n.endsWith('/') && !n.startsWith('__MACOSX/'));
  const base = (n: string) => n.split('/').pop()?.toLowerCase() ?? '';
  const candidates = files.filter((n) => !DWCA_METADATA_FILES.has(base(n)));
  return (
    candidates.find((n) => base(n) === 'occurrence.txt') ??
    candidates.find((n) => /\.(csv|tsv)$/i.test(n)) ??
    candidates.find((n) => /\.txt$/i.test(n)) ??
    candidates.find((n) => /\.json$/i.test(n)) ??
    candidates[0]
  );
}

interface JSZipInternalStream {
  on(event: 'data', cb: (chunk: string) => void): JSZipInternalStream;
  on(event: 'end', cb: () => void): JSZipInternalStream;
  on(event: 'error', cb: (err: Error) => void): JSZipInternalStream;
  pause(): JSZipInternalStream;
  resume(): JSZipInternalStream;
}

/** Decompress a ZIP entry to text, aborting as soon as it exceeds `maxChars` (zip-bomb guard). */
function readZipEntryLimited(entry: JSZip.JSZipObject, maxChars: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = (entry as unknown as { internalStream(type: 'string'): JSZipInternalStream }).internalStream(
      'string'
    );
    const chunks: string[] = [];
    let size = 0;
    let failed = false;
    stream
      .on('data', (chunk) => {
        if (failed) return;
        size += chunk.length;
        if (size > maxChars) {
          failed = true;
          stream.pause();
          reject(new Error('ZIP entry is too large'));
          return;
        }
        chunks.push(chunk);
      })
      .on('error', (err) => {
        if (!failed) reject(err);
      })
      .on('end', () => {
        if (!failed) resolve(chunks.join(''));
      })
      .resume();
  });
}

export async function parseOccurrencesFile(file: File): Promise<GBIFOccurrence[]> {
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new Error('Import file is too large');
  }

  if (fileExtension(file.name) === 'zip') {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const names = Object.keys(zip.files);
    if (names.length > MAX_ZIP_ENTRIES) {
      throw new Error('ZIP file contains too many entries');
    }
    const candidate = pickZipDataEntry(names);
    const entry = candidate ? zip.files[candidate] : undefined;
    if (!candidate || !entry || entry.dir) return [];
    const text = await readZipEntryLimited(entry, MAX_UNCOMPRESSED_ENTRY_BYTES);
    return parseOccurrencesText(text, candidate);
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(parseOccurrencesText(reader.result as string, file.name));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, 'UTF-8');
  });
}
