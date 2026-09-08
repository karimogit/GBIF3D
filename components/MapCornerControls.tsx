'use client';

import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import ExploreIcon from '@mui/icons-material/Explore';
import HomeIcon from '@mui/icons-material/Home';
import FlightIcon from '@mui/icons-material/Flight';

/**
 * Bottom-right map controls stacked above Cesium's fullscreen pill:
 * fly mode, home (reset globe), and point-north (reset rotation).
 */
export default function MapCornerControls({
  onResetHome,
  onResetNorth,
  flyMode = false,
  onToggleFlyMode,
}: {
  onResetHome: () => void;
  onResetNorth: () => void;
  flyMode?: boolean;
  onToggleFlyMode?: () => void;
}) {
  return (
    <div className="map-corner-controls" role="group" aria-label="Map view controls">
      {onToggleFlyMode && (
        <Tooltip title={flyMode ? 'Exit fly mode (Esc)' : 'Fly mode (WASD)'} placement="left">
          <IconButton
            className="map-corner-control"
            aria-label={flyMode ? 'Exit fly mode' : 'Enter fly mode'}
            aria-pressed={flyMode}
            onClick={onToggleFlyMode}
            size="small"
            sx={
              flyMode
                ? {
                    backgroundColor: 'rgba(46, 125, 50, 0.95) !important',
                    color: '#fff !important',
                  }
                : undefined
            }
          >
            <FlightIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
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
