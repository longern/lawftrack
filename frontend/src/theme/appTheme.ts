import { alpha, createTheme } from "@mui/material/styles";
import type { PaletteMode } from "@mui/material";

export function createAppTheme(mode: PaletteMode) {
  const isDark = mode === "dark";

  return createTheme({
    palette: {
      mode,
      primary: { main: isDark ? "#7ea9ff" : "#1f4b99" },
      secondary: { main: isDark ? "#34d399" : "#0f766e" },
      background: {
        default: isDark ? "#07101d" : "#eef3fb",
        paper: isDark ? "#0f1727" : "#ffffff",
      },
      text: {
        primary: isDark ? "#e7edf7" : "#0f172a",
        secondary: isDark ? "#9fb0c9" : "#475569",
      },
      divider: isDark ? "rgba(148, 163, 184, 0.16)" : "rgba(15, 23, 42, 0.08)",
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
            boxShadow: isDark
              ? "0 18px 40px rgba(2, 8, 23, 0.38)"
              : "0 20px 45px rgba(15, 23, 42, 0.08)",
            backgroundImage: "none",
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: "none",
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            borderRight: `1px solid ${isDark ? "rgba(148, 163, 184, 0.12)" : "rgba(15, 23, 42, 0.08)"}`,
            backgroundColor: isDark ? "#0a1220" : "#f8fbff",
          },
        },
      },
      MuiBottomNavigation: {
        styleOverrides: {
          root: {
            backgroundColor: isDark
              ? alpha("#0f1727", 0.94)
              : alpha("#ffffff", 0.96),
          },
        },
      },
    },
  });
}
