import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
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

export function TokenActionPanel({
  candidatesLoading,
  generating,
  hasContinuationDraft,
  onAcceptContinuationDraft,
  onDiscardContinuationDraft,
  onGenerateContinuation,
  onSaveSample,
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
  onSaveSample: () => void;
  onSetReplacementToken: (value: string) => void;
  replacementToken: string;
  savingSample: boolean;
  selectedSample: DatasetSample | null;
  selectedToken: TokenSelection | null;
  tokenCandidates: TokenCandidate[];
}) {
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
      <Box sx={{ px: 2, py: 1.5, borderBottom: (theme) => `1px solid ${getWorkspaceColors(theme).border}` }}>
        <Typography variant="subtitle1" sx={{ color: (theme) => getWorkspaceColors(theme).textPrimary, fontWeight: 700 }}>
          Token 改写
        </Typography>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", p: 2 }}>
        <Paper variant="outlined" sx={panelCardSx}>
          <Stack spacing={1.5}>
            {selectedToken ? (
              <>
                <Typography variant="body2" sx={{ color: "#fca5a5" }}>
                  原 token: {selectedToken.originalToken}
                </Typography>
                <TextField
                  label="替换为"
                  value={replacementToken}
                  onChange={(event) => onSetReplacementToken(event.target.value)}
                  fullWidth
                  size="small"
                  sx={darkFieldSx}
                />
                <Stack spacing={0.75}>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    候选 token
                  </Typography>
                  {candidatesLoading ? (
                    <Typography variant="caption" sx={{ color: "text.secondary", opacity: 0.78 }}>
                      加载候选中...
                    </Typography>
                  ) : tokenCandidates.length > 0 ? (
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                      {tokenCandidates.map((candidate) => (
                        <Button
                          key={`${candidate.text}-${candidate.logprob ?? "na"}`}
                          size="small"
                          variant={candidate.text === replacementToken ? "contained" : "outlined"}
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
                    <Typography variant="caption" sx={{ color: "text.secondary", opacity: 0.78 }}>
                      暂无候选。
                    </Typography>
                  )}
                </Stack>
                {hasContinuationDraft ? (
                  <Stack direction="row" spacing={1}>
                    <Button variant="contained" onClick={onAcceptContinuationDraft} sx={{ flex: 1 }}>
                      接受改写
                    </Button>
                    <Button
                      variant="outlined"
                      onClick={onDiscardContinuationDraft}
                      sx={{ flex: 1, color: "text.primary", borderColor: "divider" }}
                    >
                      放弃改写
                    </Button>
                  </Stack>
                ) : (
                  <>
                    <Button variant="contained" onClick={onGenerateContinuation} disabled={generating}>
                      {generating ? "生成中..." : "替换并继续生成"}
                    </Button>
                    <Button
                      variant="outlined"
                      startIcon={<SaveRoundedIcon />}
                      onClick={onSaveSample}
                      disabled={savingSample}
                      sx={{ color: "text.primary", borderColor: "divider" }}
                    >
                      {savingSample ? "保存中..." : "保存到数据集"}
                    </Button>
                  </>
                )}
              </>
            ) : (
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                点击 assistant 消息中的任意 token 后，可将它替换为新 token，并让模型从该位置继续生成。
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
  onSaveSample,
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
  onSaveSample: () => void;
  onSetReplacementToken: (value: string) => void;
  replacementToken: string;
  savingSample: boolean;
  selectedSample: DatasetSample | null;
  selectedToken: TokenSelection | null;
  showSelectionSummary?: boolean;
  tokenCandidates: TokenCandidate[];
}) {
  if (!selectedToken) {
    return <Typography variant="body2" sx={{ color: "text.secondary" }}>点击 assistant 消息里的 token 开始改写。</Typography>;
  }

  return (
    <Stack spacing={1.25}>
      {showSelectionSummary ? (
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          {selectedSample?.title} · 原 token: {selectedToken.originalToken}
        </Typography>
      ) : null}
      <TextField
        label="替换为"
        value={replacementToken}
        onChange={(event) => onSetReplacementToken(event.target.value)}
        size="small"
        fullWidth
        sx={darkFieldSx}
      />
      <Stack spacing={0.75}>
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          候选 token
        </Typography>
        {candidatesLoading ? (
          <Typography variant="caption" sx={{ color: "text.secondary", opacity: 0.78 }}>
            加载候选中...
          </Typography>
        ) : tokenCandidates.length > 0 ? (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
            {tokenCandidates.map((candidate) => (
              <Button
                key={`${candidate.text}-${candidate.logprob ?? "na"}`}
                size="small"
                variant={candidate.text === replacementToken ? "contained" : "outlined"}
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
          <Typography variant="caption" sx={{ color: "text.secondary", opacity: 0.78 }}>
            暂无候选。
          </Typography>
        )}
      </Stack>
      <Stack direction="row" spacing={1}>
        {hasContinuationDraft ? (
          <>
            <Button variant="contained" size="small" onClick={onAcceptContinuationDraft} sx={{ flex: 1 }}>
              接受
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={onDiscardContinuationDraft}
              sx={{ flex: 1, color: "text.primary", borderColor: "divider" }}
            >
              放弃
            </Button>
          </>
        ) : (
          <>
            <Button variant="contained" size="small" onClick={onGenerateContinuation} disabled={generating} sx={{ flex: 1 }}>
              {generating ? "生成中..." : "继续生成"}
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={onSaveSample}
              disabled={savingSample}
              sx={{ flex: 1, color: "text.primary", borderColor: "divider" }}
            >
              {savingSample ? "保存中..." : "保存"}
            </Button>
          </>
        )}
      </Stack>
    </Stack>
  );
}
