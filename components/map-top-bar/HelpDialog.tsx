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
}: {
  open: boolean;
  onClose: () => void;
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
          <p><strong>1. Pick a region</strong> — Search for a place by name, or choose a predefined region (World, Europe, etc.) from the list. With no region selected, data uses the area visible on the globe when you apply filters.</p>
          <p><strong>2. Add species filters</strong> — Open Filters to search by species/taxon, taxonomic group, IUCN status, date range, and advanced options (e.g. country, dataset, institution).</p>
          <p><strong>3. Import your own data</strong> — Use Import to add GBIF-style CSV or JSON files; imported points appear alongside API data.</p>
          <p><strong>4. Explore the globe</strong> — Each dot is an occurrence. Rotate, pan, and zoom to see where records are concentrated. Use the fullscreen icon to go fullscreen.</p>
          <p><strong>5. Use the timeline</strong> — Click a year (and optionally a month) at the bottom to focus on that period. Click “All” to reset.</p>
          <p><strong>6. Draw your own area</strong> — Use Draw region to define a custom box on the globe and fetch occurrences for that area; you can save it as a favorite.</p>
          <p><strong>7. Export</strong> — Use Export to save the current view as an image, or export GeoJSON, CSV, or PDF with options for visible vs all data and whether to include the region boundary polygon.</p>
          <p><strong>Navigation tips</strong> — Left-click and drag to rotate (3D) or pan (2D); right-click and drag to pan; use the mouse wheel to zoom; on touch, drag to pan and pinch to zoom.</p>
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
