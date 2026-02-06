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

/**
 * Parse CSV text (header row + data). Expects GBIF/Darwin Core style columns.
 * Returns occurrences with valid decimalLatitude/decimalLongitude; assigns synthetic keys.
 */
export function parseOccurrencesCSV(text: string): GBIFOccurrence[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headerLine = lines[0];
  const headerValues = parseCSVLine(headerLine);
  const headers = headerValues.map((h) => normalizeHeader(h) || camelCase(h.trim()));
  const results: GBIFOccurrence[] = [];
  let syntheticKey = -1;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const values = parseCSVLine(line);
    const row: Record<string, unknown> = {};
    headers.forEach((h, j) => {
      if (h) row[h] = values[j]?.trim();
    });
    const lat = parseNum(row['decimalLatitude']);
    const lon = parseNum(row['decimalLongitude']);
    if (lat != null && lon != null && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      results.push(rowToOccurrence(row, syntheticKey));
      syntheticKey -= 1;
    }
  }
  return results;
}

/** Simple CSV line parse (handles quoted fields with commas). */
function parseCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (inQuotes) {
      cur += c;
    } else if (c === ',' || c === ';' || c === '\t') {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
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
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (ext === 'zip') {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const names = Object.keys(zip.files);
    const csvName = names.find((n) => /\.csv$/i.test(n));
    const jsonName = names.find((n) => /\.json$/i.test(n));
    const candidate = csvName ?? jsonName ?? names.find((n) => !n.endsWith('/') && !n.startsWith('__'));
    if (!candidate) return [];
    const entry = zip.files[candidate];
    if (!entry || entry.dir) return [];
    const text = await entry.async('string');
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
