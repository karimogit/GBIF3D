'use client';

import { useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import UploadFile from '@mui/icons-material/UploadFile';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import type { GBIFOccurrence } from '@/types/gbif';

/** Summary of imported occurrences: record count, species list, and actions. */
export default function ImportSummaryContent({
  importedOccurrences,
  onChooseFile,
  onClear,
  hasClear,
}: {
  importedOccurrences: GBIFOccurrence[];
  onChooseFile: () => void;
  onClear: () => void;
  hasClear: boolean;
}) {
  const { total, speciesList } = useMemo(() => {
    const total = importedOccurrences.length;
    const byName = new Map<string, number>();
    for (const o of importedOccurrences) {
      const name = (o.scientificName || o.vernacularName || 'Unknown')?.trim() || 'Unknown';
      byName.set(name, (byName.get(name) ?? 0) + 1);
    }
    const speciesList = Array.from(byName.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
    return { total, speciesList };
  }, [importedOccurrences]);

  return (
    <Box>
      <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
        Import summary
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {total.toLocaleString()} record{total !== 1 ? 's' : ''}, {speciesList.length} species
      </Typography>
      <Box sx={{ maxHeight: 220, overflowY: 'auto', mb: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1 }}>
        {speciesList.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No species names in data
          </Typography>
        ) : (
          <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
            {speciesList.map(({ name, count }) => (
              <Typography key={name} component="li" variant="body2" sx={{ py: 0.25 }}>
                {name}
                {count > 1 && (
                  <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                    ({count})
                  </Typography>
                )}
              </Typography>
            ))}
          </Box>
        )}
      </Box>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Button size="small" variant="outlined" startIcon={<UploadFile />} onClick={onChooseFile}>
          Choose another file
        </Button>
        {hasClear && (
          <Button size="small" color="secondary" startIcon={<DeleteOutline />} onClick={onClear}>
            Clear import
          </Button>
        )}
      </Box>
    </Box>
  );
}
