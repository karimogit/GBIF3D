'use client';

import { useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import Paper from '@mui/material/Paper';
import type { Bounds } from '@/lib/geometry';
import type { OccurrenceFilters } from '@/types/gbif';
import type { GBIFOccurrence } from '@/types/gbif';
import { fetchTemporalFacets } from '@/lib/tools';
import {
  computeFirstDetections,
  computePhenologyByMonth,
} from '@/lib/tools';
import type { GBIFFacet } from '@/types/gbif';

interface ToolsPanelProps {
  viewBounds: Bounds | null;
  filters: OccurrenceFilters;
  occurrences: GBIFOccurrence[];
  environmentalLayer: 'none' | 'landcover';
  onEnvironmentalLayerChange: (layer: 'none' | 'landcover') => void;
  onClose?: () => void;
}

export default function ToolsPanel({
  viewBounds,
  filters,
  occurrences,
  environmentalLayer,
  onEnvironmentalLayerChange,
  onClose,
}: ToolsPanelProps) {
  const [tab, setTab] = useState(0);
  const [temporalLoading, setTemporalLoading] = useState(false);
  const [temporalData, setTemporalData] = useState<{
    yearFacet?: GBIFFacet;
    totalCount: number;
  } | null>(null);
  const [temporalError, setTemporalError] = useState<string | null>(null);

  const hasTaxonFilter =
    (filters.taxonKeys?.length ?? 0) > 0 || filters.taxonKey != null;

  const runTemporal = useCallback(async () => {
    if (!viewBounds || !hasTaxonFilter) return;
    setTemporalLoading(true);
    setTemporalError(null);
    try {
      const res = await fetchTemporalFacets(viewBounds, filters, {
        facetMonth: false,
        facetLimit: 60,
      });
      setTemporalData({ yearFacet: res.yearFacet, totalCount: res.totalCount });
    } catch (e) {
      setTemporalError(e instanceof Error ? e.message : 'Failed to load timeline');
      setTemporalData(null);
    } finally {
      setTemporalLoading(false);
    }
  }, [viewBounds, filters, hasTaxonFilter]);

  const firstDetections = computeFirstDetections(occurrences);
  const phenology = computePhenologyByMonth(occurrences);

  return (
    <Paper sx={{ p: 2, minWidth: 320, maxWidth: 420, maxHeight: '85vh', overflow: 'auto' }}>
      <Typography variant="subtitle1" fontWeight={600} gutterBottom>
        Analysis tools
      </Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Temporal" />
        <Tab label="Layers" />
      </Tabs>

      {tab === 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Species richness over time, first detections, and phenology (seasonal signals) from occurrence timestamps.
          </Typography>
          {!hasTaxonFilter && (
            <Typography variant="body2" color="warning.main">
              Select a region and add a species or taxonomic filter, then run the timeline.
            </Typography>
          )}
          <Button
            variant="contained"
            size="small"
            onClick={runTemporal}
            disabled={!viewBounds || !hasTaxonFilter || temporalLoading}
            startIcon={temporalLoading ? <CircularProgress size={16} /> : null}
          >
            {temporalLoading ? 'Loading…' : 'Occurrence timeline (current view)'}
          </Button>
          {temporalError && (
            <Typography variant="body2" color="error">{temporalError}</Typography>
          )}
          {temporalData?.yearFacet && (
            <Box>
              <Typography variant="caption" color="text.secondary">
                Occurrences by year (total: {temporalData.totalCount.toLocaleString()})
              </Typography>
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  alignItems: 'flex-end',
                  gap: 0.5,
                  mt: 1,
                  minHeight: 84,
                  maxHeight: 200,
                  overflow: 'auto',
                }}
              >
                {[...(temporalData.yearFacet.counts ?? [])]
                  .sort((a, b) => Number(a.name) - Number(b.name))
                  .slice(-30)
                  .map(({ name, count }) => {
                    const maxCount = Math.max(1, ...(temporalData.yearFacet?.counts?.map((c) => c.count) ?? [1]));
                    return (
                      <Box
                        key={name}
                        sx={{
                          width: 28,
                          height: Math.max(4, Math.min(80, (count / maxCount) * 80)),
                          bgcolor: 'primary.main',
                          borderRadius: 0.5,
                          flexShrink: 0,
                        }}
                        title={`${name}: ${count.toLocaleString()}`}
                      />
                    );
                  })}
              </Box>
              <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
                Last 30 years (left → right: older → newer; bar height = count)
              </Typography>
            </Box>
          )}
          {occurrences.length > 0 && (
            <>
              <Typography variant="subtitle2" fontWeight={600}>
                First detections (from loaded data)
              </Typography>
              <Box sx={{ maxHeight: 120, overflow: 'auto' }}>
                {firstDetections
                  .sort((a, b) => a.firstYear - b.firstYear)
                  .slice(0, 15)
                  .map((s) => (
                    <Typography key={s.speciesKey} variant="caption" display="block">
                      {s.scientificName}: first {s.firstYear} ({s.count} records)
                    </Typography>
                  ))}
              </Box>
              <Typography variant="subtitle2" fontWeight={600} sx={{ mt: 1 }}>
                Phenology (by month)
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block">
                From event date (month) of each occurrence; year-only dates are excluded.
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.25, height: 60 }}>
                {phenology.map(({ month, count }) => {
                  const maxP = Math.max(1, ...phenology.map((p) => p.count));
                  return (
                    <Box
                      key={month}
                      sx={{
                        flex: 1,
                        height: `${Math.max(2, (count / maxP) * 100)}%`,
                        minHeight: 2,
                        bgcolor: 'secondary.main',
                        borderRadius: 0.25,
                      }}
                      title={`Month ${month}: ${count}`}
                    />
                  );
                })}
              </Box>
              <Typography variant="caption" color="text.secondary">
                Jan–Dec (bar = occurrence count)
              </Typography>
            </>
          )}
        </Box>
      )}

      {tab === 1 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Overlay environmental layers to highlight biodiversity hotspots and land cover context.
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={environmentalLayer === 'landcover'}
                onChange={(_, checked) =>
                  onEnvironmentalLayerChange(checked ? 'landcover' : 'none')
                }
              />
            }
            label="Land cover / relief overlay"
          />
          <Typography variant="caption" color="text.secondary">
            Semi-transparent relief layer (OpenTopoMap) over the base map. Combine with occurrence data to see context.
          </Typography>
        </Box>
      )}

      {onClose && (
        <Button size="small" onClick={onClose} sx={{ mt: 2 }}>
          Close
        </Button>
      )}
    </Paper>
  );
}
