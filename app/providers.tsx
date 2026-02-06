'use client';

import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

const theme = createTheme({
  typography: {
    fontFamily: "Roboto, 'Helvetica Neue', Helvetica, Arial, sans-serif",
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
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
