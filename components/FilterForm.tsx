'use client';

import { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Collapse from '@mui/material/Collapse';
import Typography from '@mui/material/Typography';
import ExpandMore from '@mui/icons-material/ExpandMore';
import ExpandLess from '@mui/icons-material/ExpandLess';
import SpeciesSearch, { type SpeciesOption } from './SpeciesSearch';
import type { OccurrenceFilters, SelectedSpeciesOption } from '@/types/gbif';
import { TAXON_CLASS_KEYS, OCCURRENCE_MAX_TOTAL } from '@/lib/gbif';

/** Stable empty array so Autocomplete value reference doesn't change every render (fixes "can't type" in species field). */
const EMPTY_SPECIES_OPTIONS: SpeciesOption[] = [];

const IUCN_ANY = 'any';
const IUCN_OPTIONS = [
  { value: IUCN_ANY, label: 'Any' },
  { value: 'CR', label: 'Critically Endangered' },
  { value: 'EN', label: 'Endangered' },
  { value: 'VU', label: 'Vulnerable' },
  { value: 'NT', label: 'Near Threatened' },
  { value: 'LC', label: 'Least Concern' },
  { value: 'DD', label: 'Data Deficient' },
];

const BASIS_ANY = '';
const BASIS_OPTIONS = [
  { value: BASIS_ANY, label: 'Any' },
  { value: 'HUMAN_OBSERVATION', label: 'Human observation' },
  { value: 'PRESERVED_SPECIMEN', label: 'Preserved specimen' },
  { value: 'OBSERVATION', label: 'Observation' },
  { value: 'LIVING_SPECIMEN', label: 'Living specimen' },
  { value: 'FOSSIL_SPECIMEN', label: 'Fossil specimen' },
  { value: 'MACHINE_OBSERVATION', label: 'Machine observation' },
  { value: 'MATERIAL_SAMPLE', label: 'Material sample' },
];

const CONTINENT_ANY = '';
const CONTINENT_OPTIONS = [
  { value: CONTINENT_ANY, label: 'Any' },
  { value: 'AFRICA', label: 'Africa' },
  { value: 'ANTARCTICA', label: 'Antarctica' },
  { value: 'ASIA', label: 'Asia' },
  { value: 'EUROPE', label: 'Europe' },
  { value: 'NORTH_AMERICA', label: 'North America' },
  { value: 'OCEANIA', label: 'Oceania' },
  { value: 'SOUTH_AMERICA', label: 'South America' },
];

export interface FilterFormProps {
  filters: OccurrenceFilters;
  onFiltersChange: (f: OccurrenceFilters) => void;
  /** Optional id for the species search input (for a11y when used inside popover) */
  speciesSearchId?: string;
}

export default function FilterForm({
  filters,
  onFiltersChange,
  speciesSearchId = 'filter-form-species-search',
}: FilterFormProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  /** Selected species for display (synced from filters so selection persists when popover closes). Use stable empty ref so MUI Autocomplete doesn't reset inputValue on every keystroke. */
  const selectedSpecies: SpeciesOption[] = filters.selectedSpeciesOptions ?? EMPTY_SPECIES_OPTIONS;
  const [dateFrom, setDateFrom] = useState<string>(
    filters.eventDate ? String(filters.eventDate).split(',')[0] ?? '' : ''
  );
  const [dateTo, setDateTo] = useState<string>(
    filters.eventDate ? String(filters.eventDate).split(',')[1] ?? '' : ''
  );

  useEffect(() => {
    const parts = filters.eventDate ? String(filters.eventDate).split(',') : [];
    setDateFrom(parts[0] ?? '');
    setDateTo(parts[1] ?? '');
  }, [filters.eventDate]);

  const updateFilter = (key: keyof OccurrenceFilters, value: unknown) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const handleSpeciesChange = (options: SpeciesOption[] | SpeciesOption | null) => {
    const list = Array.isArray(options) ? options : options ? [options] : [];
    const selected: SelectedSpeciesOption[] = list.map((o) => ({ key: o.key, label: o.label }));
    onFiltersChange({
      ...filters,
      selectedSpeciesOptions: selected,
      taxonKeys: selected.length ? selected.map((o) => o.key) : undefined,
      taxonKey: selected.length ? undefined : filters.taxonKey,
    });
  };

  const handleDateBlur = () => {
    const from = dateFrom.trim();
    const to = dateTo.trim();
    if (!from && !to) {
      updateFilter('eventDate', undefined);
      return;
    }
    if (!from || !to) {
      // Require both ends for now to avoid ambiguous open-ended ranges.
      updateFilter('eventDate', undefined);
      return;
    }
    updateFilter('eventDate', `${from},${to}`);
  };

  const handleTaxonClass = (classKey: string) => {
    if (!classKey) {
      onFiltersChange({
        ...filters,
        taxonKey: undefined,
        selectedSpeciesOptions: undefined,
        taxonKeys: undefined,
      });
      return;
    }
    const key = TAXON_CLASS_KEYS[classKey];
    if (key != null) {
      onFiltersChange({
        ...filters,
        taxonKey: key,
        selectedSpeciesOptions: undefined,
        taxonKeys: undefined,
      });
    }
  };

  return (
    <Box sx={{ minWidth: 280, maxWidth: 360, p: 0 }}>
      <Box sx={{ mt: 1.5 }}>
        <SpeciesSearch
          multiple
          value={selectedSpecies}
          onChange={handleSpeciesChange}
          id={speciesSearchId}
          placeholder="Search by scientific or common name (e.g. bee, Apis, house cat). Add multiple species."
        />
      </Box>
      <FormControl fullWidth size="small" sx={{ mt: 2 }}>
        <InputLabel id="filter-taxon-class-label">Taxonomic group</InputLabel>
        <Select
          labelId="filter-taxon-class-label"
          label="Taxonomic group"
          value={
            Object.entries(TAXON_CLASS_KEYS).find(
              ([, v]) => v === filters.taxonKey
            )?.[0] ?? ''
          }
          disabled={selectedSpecies.length > 0}
          onChange={(e) => handleTaxonClass(e.target.value)}
        >
          <MenuItem value="">Any</MenuItem>
          {Object.keys(TAXON_CLASS_KEYS).map((k) => (
            <MenuItem key={k} value={k}>
              {k.charAt(0).toUpperCase() + k.slice(1)}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <Box sx={{ mt: 2, width: '100%' }}>
        <Typography variant="caption" sx={{ display: 'block', mb: 0.5, color: 'text.secondary' }}>
          Date range
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, width: '100%' }}>
          <TextField
            label=""
            type="date"
            size="small"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            onBlur={handleDateBlur}
            sx={{ flex: 1, minWidth: 0 }}
          />
          <TextField
            label=""
            type="date"
            size="small"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            onBlur={handleDateBlur}
            sx={{ flex: 1, minWidth: 0 }}
          />
        </Box>
        <Typography variant="caption" sx={{ mt: 0.5, color: 'text.disabled' }}>
          Full occurrence date range (YYYY-MM-DD). Leave empty for all dates.
        </Typography>
      </Box>
      <FormControl fullWidth size="small" sx={{ mt: 2 }}>
        <InputLabel id="filter-iucn-label">IUCN Red List</InputLabel>
        <Select
          labelId="filter-iucn-label"
          label="IUCN Red List"
          value={filters.iucnRedListCategory ?? IUCN_ANY}
          onChange={(e) => {
            const v = e.target.value;
            updateFilter('iucnRedListCategory', v === IUCN_ANY ? undefined : v);
          }}
        >
          {IUCN_OPTIONS.map((o) => (
            <MenuItem key={o.value} value={o.value}>
              {o.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <Box sx={{ mt: 2 }}>
        <Button
          fullWidth
          size="small"
          onClick={() => setAdvancedOpen((o) => !o)}
          endIcon={advancedOpen ? <ExpandLess /> : <ExpandMore />}
          aria-expanded={advancedOpen}
          aria-label={advancedOpen ? 'Hide advanced filters' : 'Show advanced filters'}
          sx={{ justifyContent: 'space-between', textTransform: 'none' }}
        >
          Advanced
        </Button>
        <Collapse in={advancedOpen}>
          <Box sx={{ mt: 1 }}>
            <FormControl fullWidth size="small" sx={{ mt: 1 }}>
              <InputLabel id="filter-basis-label">Basis of record</InputLabel>
              <Select
                labelId="filter-basis-label"
                label="Basis of record"
                value={filters.basisOfRecord ?? BASIS_ANY}
                onChange={(e) =>
                  updateFilter('basisOfRecord', e.target.value === BASIS_ANY ? undefined : e.target.value)
                }
              >
                {BASIS_OPTIONS.map((o) => (
                  <MenuItem key={o.value || 'any'} value={o.value}>
                    {o.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth size="small" sx={{ mt: 1 }}>
              <InputLabel id="filter-continent-label">Continent</InputLabel>
              <Select
                labelId="filter-continent-label"
                label="Continent"
                value={filters.continent ?? CONTINENT_ANY}
                onChange={(e) =>
                  updateFilter('continent', e.target.value === CONTINENT_ANY ? undefined : e.target.value)
                }
              >
                {CONTINENT_OPTIONS.map((o) => (
                  <MenuItem key={o.value || 'any'} value={o.value}>
                    {o.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              fullWidth
              size="small"
              label="Country (ISO 2-letter)"
              placeholder="e.g. US, GB, DE"
              value={filters.country ?? ''}
              onChange={(e) => updateFilter('country', e.target.value.trim() || undefined)}
              sx={{ mt: 1 }}
              helperText="ISO 3166-1 alpha-2 code"
            />
            <TextField
              fullWidth
              size="small"
              label="Dataset key"
              placeholder="GBIF dataset UUID"
              value={filters.datasetKey ?? ''}
              onChange={(e) => updateFilter('datasetKey', e.target.value.trim() || undefined)}
              sx={{ mt: 1 }}
              helperText="Optional; filter by specific dataset"
            />
            <TextField
              fullWidth
              size="small"
              label="Institution code"
              placeholder="e.g. USNM, NHM"
              value={filters.institutionCode ?? ''}
              onChange={(e) => updateFilter('institutionCode', e.target.value.trim() || undefined)}
              sx={{ mt: 1 }}
              helperText="Optional; e.g. collection code"
            />
          </Box>
        </Collapse>
      </Box>
      <TextField
        fullWidth
        label="Max results"
        type="number"
        size="small"
        value={filters.limit ?? 10000}
        onChange={(e) =>
          updateFilter('limit', Math.min(OCCURRENCE_MAX_TOTAL, Math.max(100, Number(e.target.value) || 10000)))
        }
        sx={{ mt: 2 }}
        inputProps={{ min: 100, max: OCCURRENCE_MAX_TOTAL, step: 1000 }}
        helperText={`100–${(OCCURRENCE_MAX_TOTAL / 1000).toFixed(0)}k; fetched in chunks of 1,000 to stay within API limits.`}
      />
    </Box>
  );
}
