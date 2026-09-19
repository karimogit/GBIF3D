'use client';

import Box from '@mui/material/Box';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import type { OccurrenceFilters } from '@/types/gbif';
import { TAXON_CLASS_KEYS } from '@/lib/gbif';

export interface SpeciesFormProps {
  filters: OccurrenceFilters;
  onFiltersChange: (f: OccurrenceFilters) => void;
}

export default function SpeciesForm({ filters, onFiltersChange }: SpeciesFormProps) {
  const hasNamedSpecies = (filters.selectedSpeciesOptions?.length ?? 0) > 0;

  const handleTaxonClass = (classKey: string) => {
    if (!classKey) {
      onFiltersChange({
        ...filters,
        taxonKey: undefined,
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
    <Box sx={{ minWidth: { xs: 0, sm: 240 }, maxWidth: { xs: '100%', sm: 320 }, width: '100%', p: 0 }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Search by name in the bar above, or pick a broad taxonomic group below.
      </Typography>
      <FormControl fullWidth size="small">
        <InputLabel id="species-taxon-class-label">Taxonomic group</InputLabel>
        <Select
          labelId="species-taxon-class-label"
          label="Taxonomic group"
          value={
            Object.entries(TAXON_CLASS_KEYS).find(([, v]) => v === filters.taxonKey)?.[0] ?? ''
          }
          disabled={hasNamedSpecies}
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
      {hasNamedSpecies && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
          Clear selected species to choose a taxonomic group instead.
        </Typography>
      )}
    </Box>
  );
}
