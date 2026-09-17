'use client';

import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

interface MapAppDialogsProps {
  exportScopePrompt: 'image' | null;
  onExportScopeChoice: (scope: 'full' | 'region') => void;
  onCloseExportScope: () => void;
  favoriteNameOpen: boolean;
  favoriteName: string;
  onFavoriteNameChange: (name: string) => void;
  onConfirmFavoriteName: () => void;
  onCloseFavoriteName: () => void;
  importError: string | null;
  onCloseImportError: () => void;
  savedOccurrenceLimitHit: boolean;
  maxSavedOccurrences: number;
  onCloseSavedLimit: () => void;
}

export default function MapAppDialogs({
  exportScopePrompt,
  onExportScopeChoice,
  onCloseExportScope,
  favoriteNameOpen,
  favoriteName,
  onFavoriteNameChange,
  onConfirmFavoriteName,
  onCloseFavoriteName,
  importError,
  onCloseImportError,
  savedOccurrenceLimitHit,
  maxSavedOccurrences,
  onCloseSavedLimit,
}: MapAppDialogsProps) {
  return (
    <>
      <Dialog
        open={exportScopePrompt != null}
        onClose={onCloseExportScope}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2, m: 1, maxWidth: 'min(420px, calc(100vw - 16px))' } }}
      >
        <DialogTitle>Export map</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary">
            You have a drawn region on the map. Export the full screen or only the drawn polygon area?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ flexDirection: 'column', alignItems: 'stretch', gap: 1, px: 2, pb: 2 }}>
          <Button variant="contained" onClick={() => onExportScopeChoice('region')}>
            Drawn region only
          </Button>
          <Button variant="outlined" onClick={() => onExportScopeChoice('full')}>
            Full screen
          </Button>
          <Button onClick={onCloseExportScope}>Cancel</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={favoriteNameOpen}
        onClose={onCloseFavoriteName}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2, m: 1, maxWidth: 'min(420px, calc(100vw - 16px))' } }}
      >
        <DialogTitle>Save region</DialogTitle>
        <DialogContent dividers>
          <TextField
            autoFocus
            fullWidth
            label="Name this region"
            value={favoriteName}
            onChange={(e) => onFavoriteNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onConfirmFavoriteName();
            }}
            margin="dense"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onCloseFavoriteName}>Cancel</Button>
          <Button variant="contained" onClick={onConfirmFavoriteName} disabled={!favoriteName.trim()}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={importError != null}
        onClose={onCloseImportError}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2, m: 1, maxWidth: 'min(420px, calc(100vw - 16px))' } }}
      >
        <DialogTitle>Import failed</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2">{importError}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={onCloseImportError}>OK</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={savedOccurrenceLimitHit}
        onClose={onCloseSavedLimit}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2, m: 1, maxWidth: 'min(420px, calc(100vw - 16px))' } }}
      >
        <DialogTitle>Saved occurrences limit</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2">
            You can save up to {maxSavedOccurrences.toLocaleString()} occurrences. Remove some saved records
            before adding more.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={onCloseSavedLimit}>OK</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
