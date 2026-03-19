export const panelCardSx = {
  p: 2,
  bgcolor: "#0f172a",
  borderColor: "rgba(148, 163, 184, 0.12)",
};

export const darkFieldSx = {
  "& .MuiOutlinedInput-root": {
    color: "#f8fafc",
    bgcolor: "#0f172a",
    "& fieldset": {
      borderColor: "rgba(148, 163, 184, 0.2)",
    },
    "&:hover fieldset": {
      borderColor: "rgba(148, 163, 184, 0.35)",
    },
    "&.Mui-focused fieldset": {
      borderColor: "#60a5fa",
    },
  },
  "& .MuiInputLabel-root": {
    color: "#94a3b8",
  },
  "& .MuiInputLabel-root.Mui-focused": {
    color: "#93c5fd",
  },
  "& .MuiFormHelperText-root": {
    color: "#94a3b8",
  },
};

export const inlineFieldSx = {
  "& .MuiOutlinedInput-root": {
    color: "#f8fafc",
    bgcolor: "rgba(15, 23, 42, 0.22)",
    backdropFilter: "blur(4px)",
    alignItems: "flex-start",
    "& fieldset": {
      borderColor: "rgba(255, 255, 255, 0.12)",
    },
    "&:hover fieldset": {
      borderColor: "rgba(255, 255, 255, 0.2)",
    },
    "&.Mui-focused fieldset": {
      borderColor: "rgba(191, 219, 254, 0.85)",
    },
  },
  "& .MuiInputBase-input": {
    color: "#f8fafc",
  },
  "& .MuiInputBase-input::placeholder": {
    color: "rgba(248, 250, 252, 0.55)",
    opacity: 1,
  },
  "& .MuiInputBase-inputMultiline": {
    lineHeight: 1.8,
  },
  "& .MuiInputLabel-root": {
    color: "rgba(226, 232, 240, 0.72)",
  },
  "& .MuiInputLabel-root.Mui-focused": {
    color: "#dbeafe",
  },
  "& .MuiSelect-icon": {
    color: "rgba(248, 250, 252, 0.7)",
  },
};
