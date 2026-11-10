const GBIF_SPECIES_URL = 'https://api.gbif.org/v1/species';
const GBIF_VERNACULAR_URL = 'https://api.gbif.org/v1/species';

interface GBIFSpeciesRecord {
  vernacularName?: string;
}

interface GBIFVernacularRecord {
  vernacularName?: string;
  language?: string;
}

interface GBIFVernacularResponse {
  results?: GBIFVernacularRecord[];
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

/** Prefer an English vernacular name from GBIF backbone for a taxon key. */
export async function fetchEnglishVernacularName(taxonKey: number, signal?: AbortSignal): Promise<string | null> {
  if (!Number.isInteger(taxonKey) || taxonKey < 1) return null;

  try {
    const vernacularRes = await fetch(`${GBIF_VERNACULAR_URL}/${taxonKey}/vernacularNames`, {
      headers: { Accept: 'application/json' },
      signal,
    });
    if (vernacularRes.ok) {
      const vernacularData = (await vernacularRes.json()) as GBIFVernacularResponse;
      const english = (vernacularData.results ?? []).find((v) => v.language === 'eng' && v.vernacularName?.trim());
      if (english?.vernacularName?.trim()) return english.vernacularName.trim();
    }
  } catch (err) {
    if (isAbortError(err)) throw err;
    // fall through to the species record
  }

  const speciesRes = await fetch(`${GBIF_SPECIES_URL}/${taxonKey}`, {
    headers: { Accept: 'application/json' },
    signal,
  });
  if (speciesRes.status === 404) return null;
  if (!speciesRes.ok) {
    throw new Error(`Species lookup failed (${speciesRes.status})`);
  }
  const species = (await speciesRes.json()) as GBIFSpeciesRecord;
  return species.vernacularName?.trim() || null;
}
