'use client';

import { useEffect } from 'react';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
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
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // offline shell is best-effort
    });
  }, []);

  // AppRouterCacheProvider streams Emotion styles with the server HTML so the
  // first paint isn't unstyled (FOUC) before the client bundle hydrates.
  return (
    <AppRouterCacheProvider options={{ key: 'mui' }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
