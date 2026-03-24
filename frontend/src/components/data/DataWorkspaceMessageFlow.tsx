import { type KeyboardEvent, useEffect, useState } from "react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import SmartToyRoundedIcon from "@mui/icons-material/SmartToyRounded";
import {
  Box,
  Button,
  FormControl,
  IconButton,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import type {
  DatasetMessage,
  DatasetMessageTokenization,
  DatasetSample,
  DatasetSampleTokenization,
  DatasetTokenEdit,
} from "../../types/app";
import { inlineFieldSx } from "./dataWorkspaceStyles";
import type { TokenSelection } from "./dataWorkspaceTypes";
import {
  buildTokenRenderSegments,
  highlightYamlLine,
  serializeSampleAsYaml,
} from "./dataWorkspaceUtils";
import { getWorkspaceColors } from "./dataWorkspaceTheme";
import { useI18n } from "../../i18n";

function MessageBubble({
  edits,
  hasContinuationDraft,
  isEditing,
  message,
  messageIndex,
  messageTokenization,
  onChangeContent,
  onChangeReasoning,
  onChangeRole,
  onDelete,
  onSetEditing,
  selectedToken,
  onSelectToken,
}: {
  edits: DatasetTokenEdit[];
  hasContinuationDraft: boolean;
  isEditing: boolean;
  message: DatasetMessage;
  messageIndex: number;
  messageTokenization: DatasetMessageTokenization | null;
  onChangeContent: (content: string) => void;
  onChangeReasoning: (reasoning: string) => void;
  onChangeRole: (role: string) => void;
  onDelete?: () => void;
  onSetEditing: (editing: boolean) => void;
  selectedToken: TokenSelection | null;
  onSelectToken: (
    messageIndex: number,
    tokenIndex: number,
    target: "content" | "reasoning",
  ) => void;
}) {
  const { t } = useI18n();
  const isAssistant = message.role === "assistant";
  const isUser = message.role === "user";
  const reasoning = message.reasoning?.trim() ?? "";
  const reasoningSegments = buildTokenRenderSegments(
    message.reasoning ?? "",
    messageTokenization?.reasoning_tokens ?? [],
  );
  const contentSegments = buildTokenRenderSegments(
    message.content,
    messageTokenization?.tokens ?? [],
  );
  const sortedEdits = [...edits].sort(
    (left, right) => left.token_index - right.token_index,
  );

  function handleUserMessageEditorKeyDown(
    event: KeyboardEvent<HTMLDivElement>,
  ) {
    if (
      !isUser ||
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    ) {
      return;
    }
    event.preventDefault();
    onSetEditing(false);
  }

  function renderLineBreakableText(text: string, keyPrefix: string) {
    return text.split("\n").flatMap((part, partIndex, parts) => {
      const items = [
        <Box
          component="span"
          key={`${keyPrefix}-text-${partIndex}`}
          sx={{ whiteSpace: "inherit", lineHeight: "inherit" }}
        >
          {part}
        </Box>,
      ];
      if (partIndex < parts.length - 1) {
        items.push(<br key={`${keyPrefix}-br-${partIndex}`} />);
      }
      return items;
    });
  }

  function renderTokenizedSegments(
    segments: ReturnType<typeof buildTokenRenderSegments>,
    target: "content" | "reasoning",
  ) {
    return segments.map((segment, index) => {
      if (segment.kind === "text") {
        return renderLineBreakableText(
          segment.text,
          `${messageIndex}-${target}-gap-${index}`,
        );
      }

      const tokenIndex = segment.tokenIndex;
      const matchingEdit =
        sortedEdits.find(
          (item) =>
            (item.target ?? "content") === target &&
            tokenIndex === item.token_index,
        ) ?? null;
      const isChanged = Boolean(matchingEdit);
      const isRegenerated = sortedEdits.some(
        (item) =>
          (item.target ?? "content") === target &&
          item.regenerated_from_token_index !== null &&
          tokenIndex >= item.regenerated_from_token_index,
      );
      const isSelected =
        selectedToken?.messageIndex === messageIndex &&
        selectedToken?.tokenIndex === tokenIndex &&
        selectedToken?.target === target;

      const tokenButtonSx = {
        border: "none",
        cursor: hasContinuationDraft ? "default" : "pointer",
        display: "inline",
        font: "inherit",
        letterSpacing: "normal",
        lineHeight: "inherit",
        whiteSpace: "inherit",
        verticalAlign: "baseline",
        color: (theme: Parameters<typeof getWorkspaceColors>[0]) =>
          isChanged
            ? getWorkspaceColors(theme).tokenChangedText
            : isUser
              ? "#f8fafc"
              : getWorkspaceColors(theme).textPrimary,
        px: 0.18,
        mx: 0,
        borderRadius: 1,
        backgroundColor: (theme: Parameters<typeof getWorkspaceColors>[0]) =>
          isChanged
            ? getWorkspaceColors(theme).tokenChangedBg
            : isSelected
              ? getWorkspaceColors(theme).tokenSelectedBg
              : isRegenerated
                ? getWorkspaceColors(theme).tokenRegeneratedBg
                : "transparent",
        boxShadow: (theme: Parameters<typeof getWorkspaceColors>[0]) =>
          isSelected
            ? `0 0 0 1px ${alpha(theme.palette.primary.main, 0.75)} inset`
            : "none",
        fontWeight: isChanged ? 800 : isSelected ? 700 : 500,
        transition: "background-color 120ms ease",
        "&:hover": {
          backgroundColor: (theme: Parameters<typeof getWorkspaceColors>[0]) =>
            hasContinuationDraft
              ? isChanged
                ? getWorkspaceColors(theme).tokenChangedBg
                : isSelected
                  ? getWorkspaceColors(theme).tokenSelectedBg
                  : isRegenerated
                    ? getWorkspaceColors(theme).tokenRegeneratedBg
                    : "transparent"
              : isChanged
                ? "#fbbf24"
                : getWorkspaceColors(theme).hoverBg,
        },
      };

      return segment.text.split("\n").flatMap((part, partIndex, parts) => {
        const items = [];
        if (part) {
          items.push(
            <Box
              key={`${messageIndex}-${target}-${tokenIndex}-${partIndex}`}
              component="button"
              type="button"
              onClick={() => {
                if (!hasContinuationDraft) {
                  onSelectToken(messageIndex, tokenIndex, target);
                }
              }}
              sx={tokenButtonSx}
            >
              {part}
            </Box>,
          );
        }
        if (partIndex < parts.length - 1) {
          items.push(
            <Box
              key={`${messageIndex}-${target}-${tokenIndex}-newline-${partIndex}`}
              component="button"
              type="button"
              title={t("Line break token")}
              aria-label={t("Line break token")}
              onClick={() => {
                if (!hasContinuationDraft) {
                  onSelectToken(messageIndex, tokenIndex, target);
                }
              }}
              sx={{
                ...tokenButtonSx,
                px: 0.12,
                minWidth: "0.9em",
                opacity: 0.5,
                fontFamily: '"IBM Plex Mono", "SFMono-Regular", monospace',
              }}
            >
              ↵
            </Box>,
          );
          items.push(
            <br
              key={`${messageIndex}-${target}-${tokenIndex}-br-${partIndex}`}
            />,
          );
        }
        return items;
      });
    });
  }

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
      }}
    >
      <Paper
        elevation={0}
        sx={{
          width: isEditing ? "92%" : "auto",
          maxWidth: "92%",
          px: 2,
          py: 1.5,
          borderRadius: 3,
          bgcolor: (theme) =>
            isUser
              ? getWorkspaceColors(theme).userBubbleBg
              : getWorkspaceColors(theme).panelBg,
          color: (theme) =>
            isUser ? "#f8fafc" : getWorkspaceColors(theme).textPrimary,
          border: isAssistant
            ? (theme) => `1px solid ${getWorkspaceColors(theme).border}`
            : "none",
        }}
      >
        <Stack spacing={1}>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            spacing={1}
          >
            {isEditing ? (
              <FormControl
                size="small"
                sx={{
                  ...inlineFieldSx,
                  minWidth: 88,
                  "& .MuiOutlinedInput-root": {
                    ...inlineFieldSx["& .MuiOutlinedInput-root"],
                    bgcolor: "transparent",
                    backdropFilter: "none",
                    minHeight: 24,
                    fontSize: 12,
                    "& fieldset": { borderColor: "transparent" },
                    "&:hover fieldset": { borderColor: "transparent" },
                    "&.Mui-focused fieldset": { borderColor: "transparent" },
                  },
                  "& .MuiSelect-select": {
                    py: 0,
                    pr: 3,
                    pl: 0,
                    minHeight: "24px !important",
                    display: "flex",
                    alignItems: "center",
                    color: (theme) =>
                      isUser
                        ? getWorkspaceColors(theme).userMutedText
                        : getWorkspaceColors(theme).textSecondary,
                  },
                  "& .MuiSelect-icon": {
                    right: 0,
                    color: (theme) =>
                      isUser
                        ? getWorkspaceColors(theme).userMutedText
                        : getWorkspaceColors(theme).textSecondary,
                  },
                }}
              >
                <Select
                  value={message.role}
                  variant="outlined"
                  onChange={(event) => onChangeRole(event.target.value)}
                >
                  <MenuItem value="system">system</MenuItem>
                  <MenuItem value="user">user</MenuItem>
                  <MenuItem value="assistant">assistant</MenuItem>
                </Select>
              </FormControl>
            ) : (
              <Typography
                variant="caption"
                sx={{
                  color: (theme) =>
                    isUser
                      ? getWorkspaceColors(theme).userMutedText
                      : getWorkspaceColors(theme).textSecondary,
                }}
              >
                {message.role}
              </Typography>
            )}

            <Stack direction="row" spacing={0.5}>
              <IconButton
                size="small"
                onClick={() => onSetEditing(!isEditing)}
                disabled={hasContinuationDraft}
                sx={{
                  color: (theme) =>
                    isUser
                      ? isEditing
                        ? "#ffffff"
                        : "rgba(255,255,255,0.78)"
                      : isEditing
                        ? theme.palette.primary.light
                        : getWorkspaceColors(theme).textSecondary,
                  bgcolor: (theme) =>
                    isUser
                      ? isEditing
                        ? alpha("#ffffff", 0.18)
                        : "transparent"
                      : isEditing
                        ? alpha(theme.palette.primary.main, 0.18)
                        : "transparent",
                  border: (theme) =>
                    isUser
                      ? isEditing
                        ? `1px solid ${alpha("#ffffff", 0.26)}`
                        : "1px solid transparent"
                      : isEditing
                        ? `1px solid ${alpha(theme.palette.primary.main, 0.4)}`
                        : "1px solid transparent",
                  "&:hover": {
                    bgcolor: (theme) =>
                      isUser
                        ? alpha("#ffffff", isEditing ? 0.24 : 0.12)
                        : isEditing
                          ? alpha(theme.palette.primary.main, 0.24)
                          : getWorkspaceColors(theme).hoverBg,
                  },
                }}
              >
                <EditRoundedIcon fontSize="small" />
              </IconButton>
              {onDelete ? (
                <IconButton
                  size="small"
                  onClick={onDelete}
                  disabled={hasContinuationDraft}
                  sx={{
                    color: (theme) =>
                      isUser
                        ? "rgba(255,255,255,0.74)"
                        : getWorkspaceColors(theme).textSecondary,
                    "&:hover": {
                      bgcolor: (theme) =>
                        isUser
                          ? alpha("#ffffff", 0.12)
                          : getWorkspaceColors(theme).hoverBg,
                    },
                  }}
                >
                  <DeleteOutlineRoundedIcon fontSize="small" />
                </IconButton>
              ) : null}
            </Stack>
          </Stack>

          <Box
            sx={{
              width: isEditing ? "100%" : "auto",
              fontSize: 15,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {isAssistant && (isEditing || reasoning) ? (
              isEditing ? (
                <TextField
                  value={message.reasoning ?? ""}
                  onChange={(event) => onChangeReasoning(event.target.value)}
                  multiline
                  minRows={3}
                  fullWidth
                  placeholder={t("Reasoning")}
                  variant="outlined"
                  sx={{
                    ...inlineFieldSx,
                    mb: 1.25,
                    "& .MuiOutlinedInput-root": {
                      ...inlineFieldSx["& .MuiOutlinedInput-root"],
                      bgcolor: (theme) =>
                        alpha(getWorkspaceColors(theme).hoverBg, 0.36),
                    },
                  }}
                />
              ) : (
                <Box
                  sx={{
                    mb: 1.25,
                    px: 1.25,
                    py: 1,
                    borderRadius: 2,
                    border: (theme) =>
                      `1px dashed ${alpha(getWorkspaceColors(theme).accent, 0.42)}`,
                    bgcolor: (theme) =>
                      alpha(getWorkspaceColors(theme).hoverBg, 0.5),
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      display: "block",
                      mb: 0.5,
                      color: (theme) => getWorkspaceColors(theme).textSecondary,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    {t("Reasoning")}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      color: (theme) => getWorkspaceColors(theme).textPrimary,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      lineHeight: 1.55,
                    }}
                  >
                    {renderTokenizedSegments(reasoningSegments, "reasoning")}
                  </Typography>
                </Box>
              )
            ) : null}
            {isEditing ? (
              <TextField
                value={message.content}
                onChange={(event) => onChangeContent(event.target.value)}
                onKeyDown={handleUserMessageEditorKeyDown}
                multiline
                minRows={message.role === "assistant" ? 6 : 4}
                fullWidth
                autoFocus
                variant="outlined"
                sx={{
                  ...inlineFieldSx,
                  "& .MuiOutlinedInput-root": {
                    ...inlineFieldSx["& .MuiOutlinedInput-root"],
                    bgcolor: "transparent",
                    backdropFilter: "none",
                    p: 0,
                    "& fieldset": { borderColor: "transparent" },
                    "&:hover fieldset": { borderColor: "transparent" },
                    "&.Mui-focused fieldset": { borderColor: "transparent" },
                  },
                  "& .MuiInputBase-input": {
                    p: 0,
                    color: isUser ? "#f8fafc" : undefined,
                  },
                  "& .MuiInputBase-inputMultiline": {
                    p: 0,
                    lineHeight: 1.8,
                    color: isUser ? "#f8fafc" : undefined,
                  },
                }}
              />
            ) : isAssistant ? (
              renderTokenizedSegments(contentSegments, "content")
            ) : (
              message.content
            )}
          </Box>
        </Stack>
      </Paper>
    </Box>
  );
}

export function MessageFlowPanel({
  generatingAssistant,
  hasContinuationDraft,
  samplesLoading,
  sample,
  sampleTokenization,
  savingSample,
  onGenerateAssistantMessage,
  selectedToken,
  onSaveSample,
  onSelectToken,
  onUpdateSampleMessages,
  onUpdateSampleTitle,
}: {
  generatingAssistant: boolean;
  hasContinuationDraft: boolean;
  samplesLoading: boolean;
  sample: DatasetSample | null;
  sampleTokenization: DatasetSampleTokenization | null;
  savingSample: boolean;
  onGenerateAssistantMessage: () => void;
  selectedToken: TokenSelection | null;
  onSaveSample: () => void;
  onSelectToken: (
    messageIndex: number,
    tokenIndex: number,
    target: "content" | "reasoning",
  ) => void;
  onUpdateSampleMessages: (
    updater: (messages: DatasetMessage[]) => DatasetMessage[],
  ) => void;
  onUpdateSampleTitle: (title: string) => void;
}) {
  const { t } = useI18n();
  const [editingMessageIndex, setEditingMessageIndex] = useState<number | null>(
    null,
  );
  const [editingTitle, setEditingTitle] = useState(false);
  const [viewMode, setViewMode] = useState<"flow" | "yaml">("flow");

  useEffect(() => {
    setEditingMessageIndex(null);
    setEditingTitle(false);
    setViewMode("flow");
  }, [sample?.id]);

  const yamlPreview = sample ? serializeSampleAsYaml(sample) : "";

  return (
    <Box
      sx={{
        height: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        bgcolor: (theme) => getWorkspaceColors(theme).canvasBg,
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          px: 2,
          py: 1.5,
          borderBottom: (theme) =>
            `1px solid ${getWorkspaceColors(theme).border}`,
          bgcolor: (theme) => getWorkspaceColors(theme).panelBg,
          display: "flex",
          flexDirection: "column",
          gap: 1.25,
        }}
      >
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <Box sx={{ minWidth: 0, flex: editingTitle ? 1 : "0 1 auto" }}>
            {sample && editingTitle ? (
              <TextField
                value={sample.title}
                onChange={(event) => onUpdateSampleTitle(event.target.value)}
                size="small"
                autoFocus
                variant="outlined"
                sx={{
                  ...inlineFieldSx,
                  flex: 1,
                  "& .MuiOutlinedInput-root": {
                    ...inlineFieldSx["& .MuiOutlinedInput-root"],
                    bgcolor: "transparent",
                    backdropFilter: "none",
                    p: 0,
                    fontSize: 16,
                    fontWeight: 700,
                    "& fieldset": { borderColor: "transparent" },
                    "&:hover fieldset": { borderColor: "transparent" },
                    "&.Mui-focused fieldset": { borderColor: "transparent" },
                  },
                  "& .MuiInputBase-input": {
                    p: 0,
                  },
                }}
              />
            ) : (
              <Typography
                variant="subtitle1"
                sx={{
                  color: (theme) => getWorkspaceColors(theme).textPrimary,
                  fontWeight: 700,
                  minWidth: 0,
                }}
                noWrap
              >
                {sample?.title || t("Message flow")}
              </Typography>
            )}
          </Box>
          <IconButton
            onClick={() => setEditingTitle((current) => !current)}
            disabled={!sample}
            sx={{
              width: 24,
              height: 24,
              p: 0.5,
              flexShrink: 0,
              color: (theme) =>
                editingTitle
                  ? theme.palette.primary.light
                  : getWorkspaceColors(theme).textSecondary,
              bgcolor: (theme) =>
                editingTitle
                  ? alpha(theme.palette.primary.main, 0.18)
                  : "transparent",
              border: (theme) =>
                editingTitle
                  ? `1px solid ${alpha(theme.palette.primary.main, 0.4)}`
                  : "1px solid transparent",
              "&:hover": {
                bgcolor: (theme) =>
                  editingTitle
                    ? alpha(theme.palette.primary.main, 0.24)
                    : getWorkspaceColors(theme).hoverBg,
              },
            }}
          >
            <EditRoundedIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Stack>
        <Stack direction="row" spacing={1}>
          <Stack direction="row" spacing={0.75} sx={{ mr: "auto" }}>
            <Button
              size="small"
              variant={viewMode === "flow" ? "contained" : "outlined"}
              onClick={() => setViewMode("flow")}
            >
              {t("Message flow")}
            </Button>
            <Button
              size="small"
              variant={viewMode === "yaml" ? "contained" : "outlined"}
              onClick={() => setViewMode("yaml")}
            >
              YAML
            </Button>
          </Stack>
          <Button
            variant="outlined"
            size="small"
            startIcon={<SmartToyRoundedIcon />}
            onClick={onGenerateAssistantMessage}
            disabled={generatingAssistant || !sample || hasContinuationDraft}
            sx={{ color: "text.primary", borderColor: "divider" }}
          >
            {generatingAssistant
              ? t("Generating...")
              : t("Generate AI message")}
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<SaveRoundedIcon />}
            onClick={onSaveSample}
            disabled={savingSample || !sample || hasContinuationDraft}
            sx={{ color: "text.primary", borderColor: "divider" }}
          >
            {savingSample ? t("Saving...") : t("Save sample")}
          </Button>
        </Stack>
      </Box>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
          touchAction: "pan-y",
          p: { xs: 1.5, md: 2 },
        }}
      >
        {samplesLoading ? (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {t("Loading samples...")}
          </Typography>
        ) : !sample ? (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {t("Select a sample to start editing.")}
          </Typography>
        ) : viewMode === "yaml" ? (
          <Paper
            variant="outlined"
            sx={{
              borderColor: (theme) => getWorkspaceColors(theme).border,
              bgcolor: (theme) => getWorkspaceColors(theme).panelBg,
              overflow: "hidden",
            }}
          >
            <Box
              component="pre"
              sx={{
                m: 0,
                p: 2,
                overflow: "auto",
                fontSize: 13,
                lineHeight: 1.75,
                fontFamily: '"IBM Plex Mono", "SFMono-Regular", monospace',
              }}
            >
              {yamlPreview.split("\n").map((line, lineIndex) => (
                <Box
                  key={`${lineIndex}-${line}`}
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "40px minmax(0, 1fr)",
                  }}
                >
                  <Box
                    sx={{
                      color: "text.secondary",
                      opacity: 0.65,
                      userSelect: "none",
                    }}
                  >
                    {lineIndex + 1}
                  </Box>
                  <Box component="span">
                    {highlightYamlLine(line).map((segment, segmentIndex) => (
                      <Box
                        key={`${lineIndex}-${segmentIndex}`}
                        component="span"
                        sx={{
                          color: (theme) => {
                            const colors = getWorkspaceColors(theme);
                            switch (segment.kind) {
                              case "bullet":
                                return colors.textMuted;
                              case "key":
                                return colors.accent;
                              case "string":
                                return theme.palette.mode === "dark"
                                  ? "#a7f3d0"
                                  : "#0f766e";
                              case "number":
                                return theme.palette.mode === "dark"
                                  ? "#fbbf24"
                                  : "#b45309";
                              case "keyword":
                                return theme.palette.mode === "dark"
                                  ? "#c4b5fd"
                                  : "#7c3aed";
                              default:
                                return colors.textPrimary;
                            }
                          },
                          fontWeight: segment.kind === "key" ? 600 : 400,
                        }}
                      >
                        {segment.text}
                      </Box>
                    ))}
                  </Box>
                </Box>
              ))}
            </Box>
          </Paper>
        ) : (
          <Stack spacing={2.25}>
            {sample.messages.map((message, messageIndex) => (
              <MessageBubble
                key={`${sample.id}-${messageIndex}`}
                edits={sample.edits.filter(
                  (item) => item.message_index === messageIndex,
                )}
                hasContinuationDraft={hasContinuationDraft}
                isEditing={editingMessageIndex === messageIndex}
                message={message}
                messageIndex={messageIndex}
                messageTokenization={
                  sampleTokenization?.messages.find(
                    (item) => item.message_index === messageIndex,
                  ) ?? null
                }
                onChangeContent={(content) =>
                  onUpdateSampleMessages((messages) =>
                    messages.map((item, index) =>
                      index === messageIndex ? { ...item, content } : item,
                    ),
                  )
                }
                onChangeReasoning={(reasoning) =>
                  onUpdateSampleMessages((messages) =>
                    messages.map((item, index) =>
                      index === messageIndex ? { ...item, reasoning } : item,
                    ),
                  )
                }
                onChangeRole={(role) =>
                  onUpdateSampleMessages((messages) =>
                    messages.map((item, index) =>
                      index === messageIndex ? { ...item, role } : item,
                    ),
                  )
                }
                onDelete={
                  sample.messages.length > 1
                    ? () => {
                        onUpdateSampleMessages((messages) =>
                          messages.filter((_, index) => index !== messageIndex),
                        );
                        setEditingMessageIndex((current) => {
                          if (current === null) {
                            return current;
                          }
                          if (current === messageIndex) {
                            return null;
                          }
                          return current > messageIndex ? current - 1 : current;
                        });
                      }
                    : undefined
                }
                selectedToken={selectedToken}
                onSetEditing={(editing) =>
                  setEditingMessageIndex(editing ? messageIndex : null)
                }
                onSelectToken={onSelectToken}
              />
            ))}

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <Button
                variant="outlined"
                startIcon={<AddRoundedIcon />}
                onClick={() => {
                  onUpdateSampleMessages((messages) => [
                    ...messages,
                    { role: "user", content: "" },
                  ]);
                  setEditingMessageIndex(sample.messages.length);
                }}
                disabled={hasContinuationDraft}
                sx={{ color: "text.primary", borderColor: "divider" }}
              >
                {t("Add user message")}
              </Button>
              <Button
                variant="outlined"
                startIcon={<AddRoundedIcon />}
                onClick={() => {
                  onUpdateSampleMessages((messages) => [
                    ...messages,
                    { role: "assistant", content: "" },
                  ]);
                  setEditingMessageIndex(sample.messages.length);
                }}
                disabled={hasContinuationDraft}
                sx={{ color: "text.primary", borderColor: "divider" }}
              >
                {t("Add assistant message")}
              </Button>
            </Stack>
          </Stack>
        )}
      </Box>
    </Box>
  );
}
