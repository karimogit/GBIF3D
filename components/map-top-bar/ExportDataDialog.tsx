'use client';

import { useEffect, useState } from 'react';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormLabel from '@mui/material/FormLabel';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Typography from '@mui/material/Typography';
import type { ExportDataFormat, ExportDataOptions, ExportScope } from '@/lib/export-data';

const FORMAT_LABELS: Record<ExportDataFormat, string> = {
  geojson: 'GeoJSON',
  csv: 'CSV',
  pdf: 'PDF',
};

export default function ExportDataDialog({
  open,
  format,
  visibleCount,
  allCount,
  hasRegion,
  regionName,
  onClose,
  onConfirm,
}: {
  open: boolean;
  format: ExportDataFormat | null;
  visibleCount: number;
  allCount: number;
  hasRegion: boolean;
  regionName?: string;
  onClose: () => void;
  onConfirm: (opts: ExportDataOptions) => void;
}) {
  const [scope, setScope] = useState<ExportScope>('visible');
  const [includePolygon, setIncludePolygon] = useState(hasRegion);

  useEffect(() => {
    if (open) {
      setScope('visible');
      setIncludePolygon(hasRegion);
    }
  }, [open, hasRegion]);

  if (!format) return null;

  const handleExport = () => {
    onConfirm({ scope, includePolygon: hasRegion && includePolygon });
    onClose();
  };

  const noData = scope === 'visible' ? visibleCount === 0 : allCount === 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      PaperProps={{ sx: { borderRadius: 2, m: 1, maxWidth: 'min(420px, calc(100vw - 16px))' } }}
    >
      <DialogTitle>Export as {FORMAT_LABELS[format]}</DialogTitle>
      <DialogContent dividers>
        <FormControl component="fieldset" sx={{ width: '100%', mb: hasRegion ? 2 : 0 }}>
          <FormLabel component="legend" sx={{ mb: 0.5 }}>
            Occurrences to include
          </FormLabel>
          <RadioGroup value={scope} onChange={(e) => setScope(e.target.value as ExportScope)}>
            <FormControlLabel
              value="visible"
              control={<Radio size="small" />}
              label={`Visible on map (${visibleCount})`}
            />
            <FormControlLabel
              value="all"
              control={<Radio size="small" />}
              label={`All loaded data (${allCount})`}
            />
          </RadioGroup>
        </FormControl>
        {hasRegion && (
          <FormControlLabel
            control={
              <Checkbox
                checked={includePolygon}
                onChange={(e) => setIncludePolygon(e.target.checked)}
                size="small"
              />
            }
            label={
              <span>
                Include region boundary polygon
                {regionName?.trim() ? (
                  <Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block' }}>
                    {regionName.trim()}
                  </Typography>
                ) : null}
              </span>
            }
          />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleExport} disabled={noData}>
          Export
        </Button>
      </DialogActions>
    </Dialog>
  );
}
