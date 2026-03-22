import {
  Box,
  Button,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { DatasetSample } from "../../types/app";
import { darkFieldSx, panelCardSx } from "./dataWorkspaceStyles";
import type { TokenCandidate, TokenSelection } from "./dataWorkspaceTypes";
import { formatCandidateLabel, getWorkspaceColors } from "./dataWorkspaceTheme";
import { useI18n } from "../../i18n";

export function TokenActionPanel({
  candidatesLoading,
  generating,
  hasContinuationDraft,
  onAcceptContinuationDraft,
  onDiscardContinuationDraft,
  onGenerateContinuation,
  onSetReplacementToken,
  replacementToken,
  savingSample,
  selectedSample,
  selectedToken,
  tokenCandidates,
}: {
  candidatesLoading: boolean;
  generating: boolean;
  hasContinuationDraft: boolean;
  onAcceptContinuationDraft: () => void;
  onDiscardContinuationDraft: () => void;
  onGenerateContinuation: () => void;
  onSetReplacementToken: (value: string) => void;
  replacementToken: string;
  savingSample: boolean;
  selectedSample: DatasetSample | null;
  selectedToken: TokenSelection | null;
  tokenCandidates: TokenCandidate[];
}) {
  const { t } = useI18n();

  return (
    <Box
      sx={{
        minHeight: 0,
        bgcolor: (theme) => getWorkspaceColors(theme).panelBg,
        borderLeft: (theme) => `1px solid ${getWorkspaceColors(theme).border}`,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Box
        sx={{
          px: 2,
          py: 1.5,
          borderBottom: (theme) =>
            `1px solid ${getWorkspaceColors(theme).border}`,
        }}
      >
        <Typography
          variant="subtitle1"
          sx={{
            color: (theme) => getWorkspaceColors(theme).textPrimary,
            fontWeight: 700,
          }}
        >
          {t("Token rewrite")}
        </Typography>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", p: 2 }}>
        <Paper variant="outlined" sx={panelCardSx}>
          <Stack spacing={1.5}>
            {selectedToken ? (
              <>
                <Typography variant="body2" sx={{ color: "#fca5a5" }}>
                  {t("Original {target} token: {token}", {
                    target:
                      selectedToken.target === "reasoning"
                        ? "reasoning"
                        : "content",
                    token: selectedToken.originalToken,
                  })}
                </Typography>
                <TextField
                  label={t("Replace with")}
                  value={replacementToken}
                  onChange={(event) =>
                    onSetReplacementToken(event.target.value)
                  }
                  fullWidth
                  size="small"
                  sx={darkFieldSx}
                />
                <Stack spacing={0.75}>
                  <Typography
                    variant="caption"
                    sx={{ color: "text.secondary" }}
                  >
                    {t("Candidate tokens")}
                  </Typography>
                  {candidatesLoading ? (
                    <Typography
                      variant="caption"
                      sx={{ color: "text.secondary", opacity: 0.78 }}
                    >
                      {t("Loading candidates...")}
                    </Typography>
                  ) : tokenCandidates.length > 0 ? (
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                      {tokenCandidates.map((candidate) => (
                        <Button
                          key={`${candidate.text}-${candidate.logprob ?? "na"}`}
                          size="small"
                          variant={
                            candidate.text === replacementToken
                              ? "contained"
                              : "outlined"
                          }
                          onClick={() => onSetReplacementToken(candidate.text)}
                          sx={{
                            minWidth: 0,
                            px: 1,
                            color: (theme) =>
                              candidate.text === replacementToken
                                ? theme.palette.background.paper
                                : theme.palette.text.primary,
                            borderColor: "divider",
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {formatCandidateLabel(candidate.text)}
                        </Button>
                      ))}
                    </Box>
                  ) : (
                    <Typography
                      variant="caption"
                      sx={{ color: "text.secondary", opacity: 0.78 }}
                    >
                      {t("No candidates.")}
                    </Typography>
                  )}
                </Stack>
                {hasContinuationDraft ? (
                  <Stack direction="row" spacing={1}>
                    <Button
                      variant="contained"
                      onClick={onAcceptContinuationDraft}
                      disabled={savingSample}
                      sx={{ flex: 1 }}
                    >
                      {savingSample ? t("Saving...") : t("Accept and save")}
                    </Button>
                    <Button
                      variant="outlined"
                      onClick={onDiscardContinuationDraft}
                      disabled={savingSample}
                      sx={{
                        flex: 1,
                        color: "text.primary",
                        borderColor: "divider",
                      }}
                    >
                      {t("Discard rewrite")}
                    </Button>
                  </Stack>
                ) : (
                  <Button
                    variant="contained"
                    onClick={onGenerateContinuation}
                    disabled={generating || savingSample}
                  >
                    {generating
                      ? t("Generating...")
                      : t("Replace and continue")}
                  </Button>
                )}
              </>
            ) : (
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                {t(
                  "Click any token in an assistant message to replace it and continue generation from that point.",
                )}
              </Typography>
            )}
          </Stack>
        </Paper>
      </Box>
    </Box>
  );
}

export function TokenActionMiniPanel({
  candidatesLoading,
  generating,
  hasContinuationDraft,
  onAcceptContinuationDraft,
  onDiscardContinuationDraft,
  onGenerateContinuation,
  onSetReplacementToken,
  replacementToken,
  savingSample,
  selectedSample,
  selectedToken,
  showSelectionSummary = true,
  tokenCandidates,
}: {
  candidatesLoading: boolean;
  generating: boolean;
  hasContinuationDraft: boolean;
  onAcceptContinuationDraft: () => void;
  onDiscardContinuationDraft: () => void;
  onGenerateContinuation: () => void;
  onSetReplacementToken: (value: string) => void;
  replacementToken: string;
  savingSample: boolean;
  selectedSample: DatasetSample | null;
  selectedToken: TokenSelection | null;
  showSelectionSummary?: boolean;
  tokenCandidates: TokenCandidate[];
}) {
  const { t } = useI18n();

  if (!selectedToken) {
    return (
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        {t("Click a token in an assistant message to start rewriting.")}
      </Typography>
    );
  }

  return (
    <Stack spacing={1.25}>
      {showSelectionSummary ? (
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          {selectedSample?.title} |{" "}
          {t("Original token: {token}", { token: selectedToken.originalToken })}
          {" | "}
          {selectedToken.target}
        </Typography>
      ) : null}
      <TextField
        label={t("Replace with")}
        value={replacementToken}
        onChange={(event) => onSetReplacementToken(event.target.value)}
        size="small"
        fullWidth
        sx={darkFieldSx}
      />
      <Stack spacing={0.75}>
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          {t("Candidate tokens")}
        </Typography>
        {candidatesLoading ? (
          <Typography
            variant="caption"
            sx={{ color: "text.secondary", opacity: 0.78 }}
          >
            {t("Loading candidates...")}
          </Typography>
        ) : tokenCandidates.length > 0 ? (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
            {tokenCandidates.map((candidate) => (
              <Button
                key={`${candidate.text}-${candidate.logprob ?? "na"}`}
                size="small"
                variant={
                  candidate.text === replacementToken ? "contained" : "outlined"
                }
                onClick={() => onSetReplacementToken(candidate.text)}
                sx={{
                  minWidth: 0,
                  px: 1,
                  color: (theme) =>
                    candidate.text === replacementToken
                      ? theme.palette.background.paper
                      : theme.palette.text.primary,
                  borderColor: "divider",
                  whiteSpace: "pre-wrap",
                }}
              >
                {formatCandidateLabel(candidate.text)}
              </Button>
            ))}
          </Box>
        ) : (
          <Typography
            variant="caption"
            sx={{ color: "text.secondary", opacity: 0.78 }}
          >
            {t("No candidates.")}
          </Typography>
        )}
      </Stack>
      <Stack direction="row" spacing={1}>
        {hasContinuationDraft ? (
          <>
            <Button
              variant="contained"
              size="small"
              onClick={onAcceptContinuationDraft}
              disabled={savingSample}
              sx={{ flex: 1 }}
            >
              {savingSample ? t("Saving...") : t("Accept and save")}
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={onDiscardContinuationDraft}
              disabled={savingSample}
              sx={{ flex: 1, color: "text.primary", borderColor: "divider" }}
            >
              {t("Discard")}
            </Button>
          </>
        ) : (
          <Button
            variant="contained"
            size="small"
            onClick={onGenerateContinuation}
            disabled={generating || savingSample}
            sx={{ flex: 1 }}
          >
            {generating ? t("Generating...") : t("Continue generation")}
          </Button>
        )}
      </Stack>
    </Stack>
  );
}
