import { createTheme } from "@mui/material/styles";

export const appTheme = createTheme({
  palette: {
    primary: { main: "#1f4b99" },
    secondary: { main: "#0f766e" },
    background: {
      default: "#eef3fb",
      paper: "#ffffff",
    },
  },
  typography: {
    fontFamily: '"IBM Plex Sans", "Helvetica Neue", Arial, sans-serif',
    h3: {
      fontWeight: 700,
      letterSpacing: -0.8,
    },
    h5: {
      fontWeight: 700,
      letterSpacing: -0.4,
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: "0 20px 45px rgba(15, 23, 42, 0.08)",
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          borderRight: "1px solid rgba(15, 23, 42, 0.08)",
        },
      },
    },
  },
});
