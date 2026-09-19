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
          <p><strong>1. Search for a species</strong> — Use the top-bar species box to search by scientific or common name, or tap the species options icon for a taxonomic group (e.g. Birds, Plants).</p>
          <p><strong>2. Pick a location</strong> — Tap the location icon to search for a place (Photon / komoot), choose World or a continent, or draw a polygon, rectangle, or circle. With no region selected, occurrences use the camera bounds at the moment you apply filters; panning alone does not refetch.</p>
          <p><strong>3. More filters</strong> — Open Filters for date range, IUCN status, max results, and advanced options (e.g. country, dataset, institution). Save presets for quick reuse.</p>
          <p><strong>4. Import your own data</strong> — Use Import to add GBIF-style CSV or JSON files; imported points appear alongside live API data and saved occurrences.</p>
          <p><strong>5. Explore the globe</strong> — Each dot is an occurrence. Large datasets are clustered automatically when zoomed out. Rotate, pan, and zoom to see where records are concentrated.</p>
          <p><strong>6. Use the timeline</strong> — Click a year (and optionally a month) at the bottom to focus on that period. Press Play to animate month by month.</p>
          <p><strong>7. Share your view</strong> — Use the share icon on the bottom-right map controls to copy a link with your current region, filters, and timeline.</p>
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
