'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import TextField from '@mui/material/TextField';
import Autocomplete from '@mui/material/Autocomplete';
import CircularProgress from '@mui/material/CircularProgress';
import type { GBIFSpeciesSuggestion, GBIFSpeciesSearchResult } from '@/types/gbif';
import { suggestSpecies, searchSpeciesByVernacular } from '@/lib/gbif';

const DEBOUNCE_MS = 300;

export interface SpeciesOption {
  key: number;
  label: string;
  rank?: string;
}

interface SpeciesSearchProps {
  /** Selected option(s). When multiple is true, use an array; otherwise single or null. */
  value: SpeciesOption[] | SpeciesOption | null;
  onChange: (option: SpeciesOption[] | SpeciesOption | null) => void;
  /** Allow selecting multiple species */
  multiple?: boolean;
  label?: string;
  placeholder?: string;
  id?: string;
}

export default function SpeciesSearch({
  value,
  onChange,
  multiple = false,
  label = 'Species / taxon',
  placeholder = 'Search by scientific or common name (e.g. bee, Apis, house cat)',
  id = 'species-search',
}: SpeciesSearchProps) {
  const valueArray = multiple
    ? (Array.isArray(value) ? value : value ? [value] : [])
    : null;
  const valueSingle = multiple ? null : (Array.isArray(value) ? value[0] ?? null : value);
  const [inputValue, setInputValue] = useState('');
  const [options, setOptions] = useState<SpeciesOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSuggestions = useCallback(async (q: string) => {
    if (!q || q.length < 2) {
      setOptions([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [scientificResults, vernacularResults] = await Promise.all([
        suggestSpecies(q, 25),
        searchSpeciesByVernacular(q, 25),
      ]);

      const byKey = new Map<number, SpeciesOption>();

      // Add vernacular (common name) matches first — e.g. "House cat (Felis catus)"
      for (const r of vernacularResults) {
        const taxonKey = r.nubKey ?? r.key;
        if (byKey.has(taxonKey)) continue;
        const vernacular = (r.vernacularNames ?? []).find((v) => v.language === 'eng')?.vernacularName
          ?? r.vernacularNames?.[0]?.vernacularName;
        const scientific = r.canonicalName ?? r.scientificName;
        const label = vernacular
          ? `${vernacular.split(',')[0].trim()} (${scientific})`
          : scientific;
        byKey.set(taxonKey, { key: taxonKey, label, rank: r.rank });
      }

      // Add scientific name matches
      for (const r of scientificResults) {
        if (byKey.has(r.key)) continue;
        byKey.set(r.key, {
          key: r.key,
          label: r.scientificName,
          rank: r.rank,
        });
      }

      setOptions(Array.from(byKey.values()).slice(0, 40));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (!inputValue.trim()) {
      setOptions([]);
      setError(null);
      return;
    }
    timeoutRef.current = setTimeout(() => {
      fetchSuggestions(inputValue.trim());
      timeoutRef.current = null;
    }, DEBOUNCE_MS);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [inputValue, fetchSuggestions]);

  return (
    <Autocomplete<SpeciesOption, boolean>
      id={id}
      multiple={multiple}
      options={options}
      value={(multiple ? valueArray : valueSingle) as SpeciesOption | SpeciesOption[]}
      inputValue={inputValue}
      onInputChange={(_, v) => setInputValue(v)}
      onChange={(_, v) => onChange(v as SpeciesOption[] | SpeciesOption | null)}
      getOptionLabel={(o) => o.label}
      getOptionKey={(o) => o.key}
      isOptionEqualToValue={(a, b) => a.key === b.key}
      loading={loading}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={placeholder}
          error={!!error}
          helperText={error ?? 'Scientific or common (English) name. Pick a genus or family for broader results.'}
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {loading ? (
                  <CircularProgress color="inherit" size={20} />
                ) : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
      renderOption={(props, option) => {
        const { key: optionKey, ...rest } = props;
        return (
          <li key={optionKey} {...rest}>
            {option.label}
            {option.rank ? (
              <span style={{ marginLeft: 8, opacity: 0.7, fontSize: '0.85em' }}>
                ({option.rank})
              </span>
            ) : null}
          </li>
        );
      }}
    />
  );
}
