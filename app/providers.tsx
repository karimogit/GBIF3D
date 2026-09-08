'use client';

import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

const theme = createTheme({
  typography: {
    // Prefer next/font Roboto on body; fall back for any portal/SSR edge cases.
    fontFamily: "var(--font-roboto), Roboto, 'Helvetica Neue', Helvetica, Arial, sans-serif",
  },
  palette: {
    mode: 'light',
    primary: { main: '#2e7d32' },
    background: {
      default: '#0a0a0f',
      paper: '#fafafa',
    },
  },
  components: {
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: '#fafafa',
        },
      },
    },
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  // Skipped AppRouterCacheProvider (@mui/material-nextjs): MUI 5 package pulls in
  // @emotion/cache/@emotion/server peers; keep providers lean without that dep.
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
