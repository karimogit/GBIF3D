'use client';

import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';

export default function AboutMenuContent() {
  return (
    <Paper component="div" sx={{ p: 2, boxShadow: 'none', backgroundColor: 'transparent' }}>
      <Typography variant="subtitle1" fontWeight={600} gutterBottom>
        GBIF 3D
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Explore where species have been recorded on an interactive 3D globe. Data comes from GBIF: millions of observations from museums, surveys, and citizen science.
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Pick a region or search for a place, import your own GBIF-style datasets, filter by species or year, and draw your own area. Each dot is an occurrence; colors show IUCN status. Use the <strong>timeline</strong> at the bottom to filter by year. Use <strong>View</strong> for 3D/2D, base maps, and optional Photorealistic 3D. Export current data as image, GeoJSON, CSV, or PDF.
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Built with Next.js, Cesium (Resium), and the GBIF API.
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Developer: <Link href="https://kar.im" target="_blank" rel="noopener noreferrer">Karim Osman</Link>
      </Typography>
    </Paper>
  );
}
