/**
 * Parse GBIF / Darwin Core occurrence data from CSV, JSON, or ZIP uploads.
 * Assigns synthetic keys (negative) so they don't clash with API occurrence keys.
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
};

const MAX_IMPORT_FILE_BYTES = 25 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 100;
const MAX_UNCOMPRESSED_ENTRY_BYTES = 25 * 1024 * 1024;

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

function parseYear(v: unknown): number | undefined {
  const n = parseNum(v);
  if (n != null && n >= 1000 && n <= 9999) return n;
  if (typeof v === 'string' && v.length >= 4) {
    const y = parseInt(v.slice(0, 4), 10);
    if (Number.isFinite(y)) return y;
  }
  return undefined;
}

function rowToOccurrence(row: Record<string, unknown>, syntheticKey: number): GBIFOccurrence {
  const get = (k: string): unknown => {
    const v = row[k] ?? row[k.toLowerCase()] ?? row[camelCase(k)];
    return v;
  };
  const getStr = (k: string): string | undefined => {
    const v = get(k);
    return typeof v === 'string' ? v.trim() || undefined : undefined;
  };
  const lat = parseNum(get('decimalLatitude'));
  const lon = parseNum(get('decimalLongitude'));
  const year = parseYear(get('year')) ?? (get('eventDate') ? parseYear(String(get('eventDate')).slice(0, 4)) : undefined);
  return {
    key: syntheticKey,
    decimalLatitude: lat,
    decimalLongitude: lon,
    scientificName: getStr('scientificName'),
    vernacularName: getStr('vernacularName'),
    year: year ?? undefined,
    eventDate: getStr('eventDate'),
    countryCode: getStr('countryCode'),
    basisOfRecord: getStr('basisOfRecord'),
    iucnRedListCategory: getStr('iucnRedListCategory'),
    kingdom: getStr('kingdom'),
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
    if (lat != null && lon != null && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      const keyCol = row['key'] ?? row['gbifID'];
      const keyNum =
        typeof keyCol === 'number'
          ? keyCol
          : typeof keyCol === 'string'
            ? parseInt(keyCol, 10)
            : undefined;
      const key =
        keyNum != null && Number.isInteger(keyNum) && keyNum > 0 ? keyNum : syntheticKey;
      if (key === syntheticKey) syntheticKey -= 1;
      results.push(rowToOccurrence(row, key));
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
    if (lat != null && lon != null && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      const existingKey = typeof row.key === 'number' && Number.isInteger(row.key) ? row.key : undefined;
      const key = existingKey != null && existingKey > 0 ? existingKey : syntheticKey;
      if (key < 0) syntheticKey -= 1;
      results.push(rowToOccurrence(row, key));
    }
  }
  return results;
}

function parseOccurrencesText(text: string, filename: string): GBIFOccurrence[] {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'json') return parseOccurrencesJSON(text);
  if (ext === 'csv' || ext === 'txt') return parseOccurrencesCSV(text);
  try {
    return parseOccurrencesJSON(text);
  } catch {
    return parseOccurrencesCSV(text);
  }
}

export async function parseOccurrencesFile(file: File): Promise<GBIFOccurrence[]> {
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new Error('Import file is too large');
  }
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (ext === 'zip') {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const names = Object.keys(zip.files);
    if (names.length > MAX_ZIP_ENTRIES) {
      throw new Error('ZIP file contains too many entries');
    }
    const csvName = names.find((n) => /\.csv$/i.test(n));
    const jsonName = names.find((n) => /\.json$/i.test(n));
    const candidate = csvName ?? jsonName ?? names.find((n) => !n.endsWith('/') && !n.startsWith('__'));
    if (!candidate) return [];
    const entry = zip.files[candidate];
    if (!entry || entry.dir) return [];
    const entrySize = (entry as typeof entry & { _data?: { uncompressedSize?: number } })._data?.uncompressedSize;
    if (entrySize != null && entrySize > MAX_UNCOMPRESSED_ENTRY_BYTES) {
      throw new Error('ZIP entry is too large');
    }
    const text = await entry.async('string');
    if (text.length > MAX_UNCOMPRESSED_ENTRY_BYTES) {
      throw new Error('ZIP entry is too large');
    }
    return parseOccurrencesText(text, candidate);
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      resolve(parseOccurrencesText(text, file.name));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, 'UTF-8');
  });
}
