'use client';

import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import ExploreIcon from '@mui/icons-material/Explore';
import HomeIcon from '@mui/icons-material/Home';

/**
 * Bottom-right map controls stacked above Cesium's fullscreen pill:
 * home (reset globe) and point-north (reset rotation).
 */
export default function MapCornerControls({
  onResetHome,
  onResetNorth,
}: {
  onResetHome: () => void;
  onResetNorth: () => void;
}) {
  return (
    <div className="map-corner-controls" role="group" aria-label="Map view controls">
      <Tooltip title="Reset view" placement="left">
        <IconButton
          className="map-corner-control"
          aria-label="Reset view"
          onClick={onResetHome}
          size="small"
        >
          <HomeIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Point north" placement="left">
        <IconButton
          className="map-corner-control"
          aria-label="Point north"
          onClick={onResetNorth}
          size="small"
        >
          <ExploreIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </div>
  );
}
