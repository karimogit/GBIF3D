/**
 * GBIF API types for occurrence search and species suggest
 * @see https://www.gbif.org/developer/summary
 */

export interface GBIFOccurrence {
  key: number;
  speciesKey?: number;
  genusKey?: number;
  taxonKey?: number;
  datasetKey?: string;
  occurrenceID?: string;
  kingdom?: string;
  phylum?: string;
  class?: string;
  order?: string;
  family?: string;
  genus?: string;
  species?: string;
  infraspecificEpithet?: string;
  taxonRank?: string;
  scientificName?: string;
  vernacularName?: string;
  decimalLatitude?: number;
  decimalLongitude?: number;
  year?: number;
  month?: number;
  day?: number;
  eventDate?: string;
  basisOfRecord?: string;
  countryCode?: string;
  locality?: string;
  iucnRedListCategory?: string;
  recordedBy?: string;
  catalogNumber?: string;
  institutionCode?: string;
  datasetName?: string;
  license?: string;
  issues?: string[];
}

export interface GBIFOccurrenceSearchResponse {
  offset: number;
  limit: number;
  endOfRecords: boolean;
  count: number;
  results: GBIFOccurrence[];
  facets?: GBIFFacet[];
}

export interface GBIFFacet {
  field: string;
  counts: { name: string; count: number }[];
}

export interface GBIFSpeciesSuggestion {
  key: number;
  scientificName: string;
  canonicalName: string;
  rank?: string;
  status?: string;
  kingdom?: string;
  phylum?: string;
  class?: string;
  order?: string;
  family?: string;
  genus?: string;
  species?: string;
  confidence?: number;
  matchType?: string;
}

/** Result from /species/search (e.g. qField=VERNACULAR); nubKey is the backbone taxon key for occurrence search */
export interface GBIFSpeciesSearchResult {
  key: number;
  nubKey?: number;
  scientificName: string;
  canonicalName?: string;
  rank?: string;
  vernacularNames?: Array<{ vernacularName: string; language?: string }>;
}

export type IUCNCategory =
  | 'EX'
  | 'EW'
  | 'CR'
  | 'EN'
  | 'VU'
  | 'NT'
  | 'LC'
  | 'DD'
  | 'NA';

/** Selected species option for display in filter UI (key + label) */
export interface SelectedSpeciesOption {
  key: number;
  label: string;
}

export interface OccurrenceFilters {
  geometry?: string; // WKT polygon
  /** Single taxon key (used when selecting taxonomic group dropdown) */
  taxonKey?: number;
  /** Multiple taxon keys (species search); takes precedence over taxonKey for API when non-empty */
  taxonKeys?: number[];
  /** Selected species options for filter UI display (persists when popover closes) */
  selectedSpeciesOptions?: SelectedSpeciesOption[];
  year?: string; // single year or range "2010,2020"
  /** Optional occurrence date range "YYYY-MM-DD,YYYY-MM-DD" (GBIF eventDate parameter). */
  eventDate?: string;
  iucnRedListCategory?: IUCNCategory | string;
  basisOfRecord?: string; // e.g. HUMAN_OBSERVATION, PRESERVED_SPECIMEN
  /** GBIF continent enum: AFRICA, ANTARCTICA, ASIA, EUROPE, NORTH_AMERICA, OCEANIA, SOUTH_AMERICA */
  continent?: string;
  /** ISO 3166-1 alpha-2 country code (e.g. US, GB) */
  country?: string;
  /** GBIF dataset UUID */
  datasetKey?: string;
  /** Institution code (e.g. USNM) */
  institutionCode?: string;
  limit?: number;
  offset?: number;
  facet?: string[]; // e.g. ['speciesKey', 'year']
  facetLimit?: number;
}
