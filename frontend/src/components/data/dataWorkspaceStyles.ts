import { alpha } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

export const panelCardSx = {
  p: 2,
  bgcolor: (theme: Theme) => (theme.palette.mode === "dark" ? "#0f172a" : theme.palette.background.paper),
  borderColor: (theme: Theme) => theme.palette.divider,
};

export const darkFieldSx = {
  "& .MuiOutlinedInput-root": {
    color: (theme: Theme) => theme.palette.text.primary,
    bgcolor: (theme: Theme) => (theme.palette.mode === "dark" ? "#0f172a" : alpha(theme.palette.primary.main, 0.03)),
    "& fieldset": {
      borderColor: (theme: Theme) => alpha(theme.palette.text.secondary, theme.palette.mode === "dark" ? 0.24 : 0.18),
    },
    "&:hover fieldset": {
      borderColor: (theme: Theme) => alpha(theme.palette.text.secondary, theme.palette.mode === "dark" ? 0.38 : 0.28),
    },
    "&.Mui-focused fieldset": {
      borderColor: (theme: Theme) => theme.palette.primary.main,
    },
  },
  "& .MuiInputLabel-root": {
    color: (theme: Theme) => theme.palette.text.secondary,
  },
  "& .MuiInputLabel-root.Mui-focused": {
    color: (theme: Theme) => theme.palette.primary.main,
  },
  "& .MuiFormHelperText-root": {
    color: (theme: Theme) => theme.palette.text.secondary,
  },
};

export const inlineFieldSx = {
  "& .MuiOutlinedInput-root": {
    color: (theme: Theme) => theme.palette.text.primary,
    bgcolor: "transparent",
    backdropFilter: "blur(4px)",
    alignItems: "flex-start",
    "& fieldset": {
      borderColor: "transparent",
    },
    "&:hover fieldset": {
      borderColor: "transparent",
    },
    "&.Mui-focused fieldset": {
      borderColor: "transparent",
    },
  },
  "& .MuiInputBase-input": {
    color: (theme: Theme) => theme.palette.text.primary,
  },
  "& .MuiInputBase-input::placeholder": {
    color: (theme: Theme) => alpha(theme.palette.text.primary, 0.55),
    opacity: 1,
  },
  "& .MuiInputBase-inputMultiline": {
    lineHeight: 1.8,
  },
  "& .MuiInputLabel-root": {
    color: (theme: Theme) => alpha(theme.palette.text.primary, 0.72),
  },
  "& .MuiInputLabel-root.Mui-focused": {
    color: (theme: Theme) => theme.palette.primary.light,
  },
  "& .MuiSelect-icon": {
    color: (theme: Theme) => alpha(theme.palette.text.primary, 0.7),
  },
};
