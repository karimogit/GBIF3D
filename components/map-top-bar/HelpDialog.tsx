'use client';

import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';

export default function HelpDialog({
  open,
  onClose,
  onStartTour,
}: {
  open: boolean;
  onClose: () => void;
  onStartTour?: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      PaperProps={{ sx: { borderRadius: 2, m: 1, maxWidth: 'min(360px, calc(100vw - 16px))' } }}
    >
      <DialogTitle>How GBIF 3D works</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" component="div" sx={{ '& p': { mb: 1.25 } }}>
          <p><strong>1. Pick a region</strong> — Tap the place icon to search for a place by name (Photon / komoot), or choose World or a continent from the list. With no region selected, occurrences use the camera bounds at the moment you apply filters; panning alone does not refetch — re-apply a filter or pick a region.</p>
          <p><strong>2. Add species filters</strong> — Search species in the top bar, or open Filters for taxonomic group, IUCN status, date range, and advanced options (e.g. country, dataset, institution). Save presets for quick reuse.</p>
          <p><strong>3. Import your own data</strong> — Use Import to add GBIF-style CSV or JSON files; imported points appear alongside live API data and saved occurrences.</p>
          <p><strong>4. Explore the globe</strong> — Each dot is an occurrence. Large datasets are clustered automatically when zoomed out. Rotate, pan, and zoom to see where records are concentrated.</p>
          <p><strong>5. Use the timeline</strong> — Click a year (and optionally a month) at the bottom to focus on that period. Press Play to animate month by month.</p>
          <p><strong>6. Share your view</strong> — Use the share icon on the bottom-right map controls to copy a link with your current region, filters, and timeline.</p>
          <p><strong>7. Draw your own area</strong> — Open the draw menu (pencil) and choose polygon, rectangle, or circle. Save the shape as a favorite.</p>
          <p><strong>8. Export</strong> — Use Export to save the current view as an image, or export GeoJSON, CSV, or PDF.</p>
        </Typography>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        {onStartTour && (
          <Button onClick={onStartTour} variant="outlined" sx={{ mr: 'auto' }}>
            Take a guided tour
          </Button>
        )}
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
