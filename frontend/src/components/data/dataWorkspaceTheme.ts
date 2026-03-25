import { alpha } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

export function formatCandidateLabel(value: string): string {
  if (!value) {
    return "∅";
  }
  return value.replace(/ /g, "␠").replace(/\n/g, "↵\n").replace(/\t/g, "⇥");
}

export function getWorkspaceColors(theme: Theme) {
  const dark = theme.palette.mode === "dark";

  return {
    railBg: dark ? "#111827" : "#f7f9fc",
    panelBg: dark ? "#111827" : "#ffffff",
    panelAltBg: dark ? "#0f172a" : "#f8fbff",
    canvasBg: dark ? "#0f172a" : "#f6f8fc",
    tabBg: dark ? "#0b1220" : "#f4f7fb",
    textPrimary: dark ? "#f8fafc" : theme.palette.text.primary,
    textSecondary: dark ? "#94a3b8" : theme.palette.text.secondary,
    textMuted: dark ? "#64748b" : alpha(theme.palette.text.secondary, 0.78),
    accent: dark ? "#93c5fd" : theme.palette.primary.main,
    subtleAccent: dark ? "#7dd3fc" : theme.palette.primary.main,
    selectedBg: dark
      ? "rgba(59, 130, 246, 0.18)"
      : alpha(theme.palette.primary.main, 0.1),
    hoverBg: dark
      ? "rgba(148, 163, 184, 0.12)"
      : alpha(theme.palette.primary.main, 0.08),
    border: theme.palette.divider,
    userBubbleBg: dark ? theme.palette.primary.dark : theme.palette.primary.main,
    userMutedText: "rgba(255,255,255,0.72)",
    tokenChangedBg: "#f59e0b",
    tokenChangedText: dark ? "#111827" : "#3f2a00",
    tokenSelectedBg: dark
      ? "rgba(96, 165, 250, 0.28)"
      : alpha(theme.palette.primary.main, 0.16),
    tokenRegeneratedBg: dark
      ? "rgba(59, 130, 246, 0.18)"
      : alpha(theme.palette.primary.main, 0.1),
  };
}
