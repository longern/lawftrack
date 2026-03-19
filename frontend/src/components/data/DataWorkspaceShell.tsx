import { type ChangeEvent, type RefObject, type SyntheticEvent, useEffect, useState } from "react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CloudUploadRoundedIcon from "@mui/icons-material/CloudUploadRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DataObjectRoundedIcon from "@mui/icons-material/DataObjectRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import FolderOpenRoundedIcon from "@mui/icons-material/FolderOpenRounded";
import KeyboardDoubleArrowLeftRoundedIcon from "@mui/icons-material/KeyboardDoubleArrowLeftRounded";
import KeyboardDoubleArrowRightRoundedIcon from "@mui/icons-material/KeyboardDoubleArrowRightRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import SmartToyRoundedIcon from "@mui/icons-material/SmartToyRounded";
import StorageRoundedIcon from "@mui/icons-material/StorageRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Drawer,
  FormControl,
  IconButton,
  InputLabel,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import type {
  DatasetMessage,
  DatasetMessageTokenization,
  DatasetRecord,
  DatasetSample,
  DatasetSampleTokenization,
  DatasetTokenEdit,
  DataSummaryItem,
  UploadedFile,
} from "../../types/app";
import { darkFieldSx, inlineFieldSx, panelCardSx } from "./dataWorkspaceStyles";
import type { DatasetDraft, TokenCandidate, TokenSelection } from "./dataWorkspaceTypes";
import { buildTokenRenderSegments, describeSample, renderSummaryIcon } from "./dataWorkspaceUtils";

export interface WorkspaceShellProps {
  activeDataset: DatasetRecord | null;
  creating: boolean;
  dataSummary: DataSummaryItem[];
  datasets: DatasetRecord[];
  datasetTabs: DatasetRecord[];
  draft: DatasetDraft | null;
  error: string;
  fineTuneFiles: UploadedFile[];
  importInputRef: RefObject<HTMLInputElement | null>;
  isMobile: boolean;
  loading: boolean;
  mobileExplorerOpen: boolean;
  mobileSamplesOpen: boolean;
  mobileMetadataOpen: boolean;
  desktopExplorerCollapsed: boolean;
  modelOptions: string[];
  modelOptionsError: string;
  modelsLoading: boolean;
  onChangeDraft: (draft: DatasetDraft | null) => void;
  onCloseDataset: (datasetId: string) => void;
  onCreateDataset: () => void;
  onDeleteDataset: (dataset: DatasetRecord) => void;
  onImportDataset: (event: ChangeEvent<HTMLInputElement>) => void;
  onOpenDataset: (dataset: DatasetRecord) => void;
  onOpenNextDataset: () => void;
  onLoadModelOptions: () => void;
  onSaveDataset: () => void;
  onSelectDataset: (datasetId: string | null) => void;
  onSetDesktopExplorerCollapsed: (collapsed: boolean) => void;
  onSetMobileExplorerOpen: (open: boolean) => void;
  onSetMobileSamplesOpen: (open: boolean) => void;
  onSetMobileMetadataOpen: (open: boolean) => void;
  samples: DatasetSample[];
  samplesLoading: boolean;
  selectedSample: DatasetSample | null;
  selectedSampleTokenization: DatasetSampleTokenization | null;
  selectedSampleId: string | null;
  dirtySampleIds: string[];
  selectedToken: TokenSelection | null;
  replacementToken: string;
  generating: boolean;
  generatingAssistant: boolean;
  saving: boolean;
  savingSample: boolean;
  tokenCandidates: TokenCandidate[];
  candidatesLoading: boolean;
  onCreateSample: () => void;
  onGenerateAssistantMessage: () => void;
  onGenerateContinuation: () => void;
  onSaveSample: () => void;
  onUpdateSelectedSampleTitle: (title: string) => void;
  onUpdateSelectedSampleMessages: (updater: (messages: DatasetMessage[]) => DatasetMessage[]) => void;
  onSelectSample: (sampleId: string | null) => void;
  onSelectToken: (messageIndex: number, tokenIndex: number) => void;
  onSetReplacementToken: (value: string) => void;
}

function formatCandidateLabel(value: string): string {
  if (!value) {
    return "∅";
  }
  return value.replace(/ /g, "␠").replace(/\n/g, "↵\n").replace(/\t/g, "⇥");
}

function ActivityRail({ explorerCollapsed, onToggleExplorer }: { explorerCollapsed: boolean; onToggleExplorer: () => void }) {
  return (
    <Box
      sx={{
        width: 56,
        bgcolor: "#111827",
        borderRight: "1px solid rgba(148, 163, 184, 0.12)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        py: 1.5,
        gap: 1,
      }}
    >
      <IconButton color="primary" sx={{ color: "#93c5fd" }}>
        <StorageRoundedIcon />
      </IconButton>
      <IconButton onClick={onToggleExplorer} sx={{ color: explorerCollapsed ? "#93c5fd" : "#64748b" }}>
        {explorerCollapsed ? <KeyboardDoubleArrowRightRoundedIcon /> : <KeyboardDoubleArrowLeftRoundedIcon />}
      </IconButton>
      <IconButton sx={{ color: "#64748b" }}>
        <DataObjectRoundedIcon />
      </IconButton>
      <IconButton sx={{ color: "#64748b" }}>
        <TuneRoundedIcon />
      </IconButton>
    </Box>
  );
}

function ExplorerPane({
  activeDatasetId,
  collapsed,
  creating,
  dataSummary,
  datasets,
  importInputRef,
  loading,
  onCreateDataset,
  onDeleteDataset,
  onImportDataset,
  onOpenDataset,
  onOpenNextDataset,
  onToggleCollapse,
}: {
  activeDatasetId: string | null;
  collapsed: boolean;
  creating: boolean;
  dataSummary: DataSummaryItem[];
  datasets: DatasetRecord[];
  importInputRef: RefObject<HTMLInputElement | null>;
  loading: boolean;
  onCreateDataset: () => void;
  onDeleteDataset: (dataset: DatasetRecord) => void;
  onImportDataset: (event: ChangeEvent<HTMLInputElement>) => void;
  onOpenDataset: (dataset: DatasetRecord) => void;
  onOpenNextDataset: () => void;
  onToggleCollapse: () => void;
}) {
  return (
    <Box
      sx={{
        position: "absolute",
        inset: 0,
        width: 320,
        minHeight: 0,
        borderRight: "1px solid rgba(148, 163, 184, 0.12)",
        bgcolor: "#111827",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        transform: collapsed ? "translateX(-100%)" : "translateX(0)",
        transition: "transform 160ms ease",
        pointerEvents: collapsed ? "none" : "auto",
      }}
    >
      <Box
        sx={{
          px: 2,
          py: 1.5,
          borderBottom: "1px solid rgba(148, 163, 184, 0.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="overline" sx={{ color: "#94a3b8" }}>
            Explorer
          </Typography>
          <Typography variant="subtitle1" sx={{ color: "#f8fafc", fontWeight: 700 }}>
            数据集工作区
          </Typography>
        </Box>
        <IconButton size="small" onClick={onToggleCollapse} sx={{ color: "#94a3b8", flexShrink: 0 }}>
          <KeyboardDoubleArrowLeftRoundedIcon fontSize="small" />
        </IconButton>
      </Box>

      <Stack direction="row" spacing={1} sx={{ p: 2 }}>
        <Button variant="contained" size="small" startIcon={<AddRoundedIcon />} onClick={onCreateDataset} disabled={creating} sx={{ flex: 1 }}>
          {creating ? "创建中" : "新建"}
        </Button>
        <Button
          variant="outlined"
          size="small"
          startIcon={<CloudUploadRoundedIcon />}
          onClick={() => importInputRef.current?.click()}
          sx={{ color: "#e2e8f0", borderColor: "rgba(148, 163, 184, 0.28)" }}
        >
          上传
        </Button>
        <Button
          variant="outlined"
          size="small"
          startIcon={<FolderOpenRoundedIcon />}
          onClick={onOpenNextDataset}
          sx={{ flex: 1, color: "#e2e8f0", borderColor: "rgba(148, 163, 184, 0.28)" }}
        >
          打开
        </Button>
        <input ref={importInputRef} hidden type="file" accept=".yaml,.yml,.json,.jsonl" onChange={onImportDataset} />
      </Stack>

      <Box sx={{ px: 1.5, pb: 1.5, flex: 1, minHeight: 0, overflow: "auto" }}>
        <Typography variant="caption" sx={{ px: 1, color: "#94a3b8" }}>
          数据集
        </Typography>
        <List sx={{ pt: 0.5 }}>
          {datasets.map((dataset) => (
            <ListItemButton
              key={dataset.id}
              selected={activeDatasetId === dataset.id}
              onClick={() => onOpenDataset(dataset)}
              sx={{ borderRadius: 2, color: "#e2e8f0", mb: 0.5, "&.Mui-selected": { bgcolor: "rgba(59, 130, 246, 0.18)" } }}
            >
              <ListItemIcon sx={{ minWidth: 34, color: "#93c5fd" }}>
                <StorageRoundedIcon fontSize="small" />
              </ListItemIcon>
              <Box sx={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 1 }}>
                <ListItemText
                  primary={dataset.name}
                  secondary={`${dataset.sample_count ?? 0} 条样本`}
                  slotProps={{ primary: { fontSize: 14 }, secondary: { sx: { color: "#94a3b8" } } }}
                />
                <IconButton
                  size="small"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDeleteDataset(dataset);
                  }}
                  sx={{ color: "#94a3b8", flexShrink: 0 }}
                >
                  <DeleteOutlineRoundedIcon fontSize="small" />
                </IconButton>
              </Box>
            </ListItemButton>
          ))}
          {!loading && datasets.length === 0 ? (
            <Typography variant="body2" sx={{ px: 1, py: 2, color: "#94a3b8" }}>
              还没有数据集，先新建一个。
            </Typography>
          ) : null}
        </List>
      </Box>

      <Box sx={{ p: 1.5, borderTop: "1px solid rgba(148, 163, 184, 0.12)", flexShrink: 0 }}>
        <Stack spacing={1}>
          {dataSummary.map((item) => (
            <Stack key={item.title} direction="row" alignItems="center" justifyContent="space-between" sx={{ color: "#cbd5e1" }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Box sx={{ display: "flex", color: "#7dd3fc" }}>{renderSummaryIcon(item.icon)}</Box>
                <Typography variant="caption">{item.title}</Typography>
              </Stack>
              <Typography variant="caption" sx={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>
                {item.value}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </Box>
    </Box>
  );
}

function SampleListPane({
  compact = false,
  dirtySampleIds,
  onCreateSample,
  onSelectSample,
  samples,
  samplesLoading,
  savingSample,
  selectedSampleId,
}: {
  compact?: boolean;
  dirtySampleIds: string[];
  onCreateSample: () => void;
  onSelectSample: (sampleId: string | null) => void;
  samples: DatasetSample[];
  samplesLoading: boolean;
  savingSample: boolean;
  selectedSampleId: string | null;
}) {
  return (
    <Box sx={{ minHeight: 0, borderRight: compact ? "none" : "1px solid rgba(148, 163, 184, 0.12)", bgcolor: "#111827", display: "flex", flexDirection: "column" }}>
      <Box
        sx={{
          px: 2,
          py: 1.5,
          borderBottom: "1px solid rgba(148, 163, 184, 0.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
        }}
      >
        <Stack spacing={0.25} sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ color: "#f8fafc", fontWeight: 700 }}>
            样本
          </Typography>
          <Typography variant="caption" sx={{ color: "#94a3b8" }}>
            {samples.length} 条
          </Typography>
        </Stack>
        <Button size="small" variant="contained" startIcon={<AddRoundedIcon />} onClick={onCreateSample} disabled={savingSample} sx={{ flexShrink: 0 }}>
          {savingSample ? "创建中" : "新建"}
        </Button>
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", p: 1.5 }}>
        {samplesLoading ? (
          <Typography variant="body2" sx={{ color: "#94a3b8" }}>
            加载样本中...
          </Typography>
        ) : samples.length === 0 ? (
          <Typography variant="body2" sx={{ color: "#94a3b8" }}>
            当前数据集没有样本。
          </Typography>
        ) : (
          <List sx={{ p: 0 }}>
            {samples.map((sample) => (
              <ListItemButton
                key={sample.id}
                selected={selectedSampleId === sample.id}
                onClick={() => onSelectSample(sample.id)}
                sx={{
                  borderRadius: 2,
                  color: "#e2e8f0",
                  mb: 0.75,
                  px: compact ? 1.25 : 1.5,
                  alignItems: "flex-start",
                  "&.Mui-selected": { bgcolor: "rgba(59, 130, 246, 0.18)" },
                }}
              >
                <ListItemText
                  primary={
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="body2" fontWeight={700} noWrap>
                        {sample.title}
                      </Typography>
                      {dirtySampleIds.includes(sample.id) ? (
                        <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: "#f59e0b" }} />
                      ) : null}
                    </Stack>
                  }
                  secondary={<Typography variant="caption" sx={{ color: "#94a3b8" }}>{describeSample(sample).slice(0, 48)}</Typography>}
                />
              </ListItemButton>
            ))}
          </List>
        )}
      </Box>
    </Box>
  );
}

function MessageBubble({
  edit,
  isEditing,
  message,
  messageIndex,
  messageTokenization,
  onChangeContent,
  onChangeRole,
  onDelete,
  onSetEditing,
  selectedToken,
  onSelectToken,
}: {
  edit: DatasetTokenEdit | null;
  isEditing: boolean;
  message: DatasetMessage;
  messageIndex: number;
  messageTokenization: DatasetMessageTokenization | null;
  onChangeContent: (content: string) => void;
  onChangeRole: (role: string) => void;
  onDelete?: () => void;
  onSetEditing: (editing: boolean) => void;
  selectedToken: TokenSelection | null;
  onSelectToken: (messageIndex: number, tokenIndex: number) => void;
}) {
  const isAssistant = message.role === "assistant";
  const isUser = message.role === "user";
  const renderSegments = buildTokenRenderSegments(message, messageTokenization);

  return (
    <Box sx={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}>
      <Paper
        elevation={0}
        sx={{
          width: isEditing ? "92%" : "auto",
          maxWidth: "92%",
          px: 2,
          py: 1.5,
          borderRadius: 3,
          bgcolor: isUser ? "#1f4b99" : "#111827",
          color: "#f8fafc",
          border: isAssistant ? "1px solid rgba(148, 163, 184, 0.12)" : "none",
        }}
      >
        <Stack spacing={1}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
            {isEditing ? (
              <FormControl size="small" sx={{ ...inlineFieldSx, minWidth: 128 }}>
                <InputLabel id={`message-role-${messageIndex}`}>角色</InputLabel>
                <Select labelId={`message-role-${messageIndex}`} label="角色" value={message.role} onChange={(event) => onChangeRole(event.target.value)}>
                  <MenuItem value="system">system</MenuItem>
                  <MenuItem value="user">user</MenuItem>
                  <MenuItem value="assistant">assistant</MenuItem>
                </Select>
              </FormControl>
            ) : (
              <Typography variant="caption" sx={{ color: isUser ? "rgba(255,255,255,0.72)" : "#94a3b8" }}>
                {message.role}
              </Typography>
            )}

            <Stack direction="row" spacing={0.5}>
              <IconButton size="small" onClick={() => onSetEditing(!isEditing)} sx={{ color: "#94a3b8" }}>
                <EditRoundedIcon fontSize="small" />
              </IconButton>
              {onDelete ? (
                <IconButton size="small" onClick={onDelete} sx={{ color: "#94a3b8" }}>
                  <DeleteOutlineRoundedIcon fontSize="small" />
                </IconButton>
              ) : null}
            </Stack>
          </Stack>

          {edit ? (
            <Box
              sx={{
                px: 1.25,
                py: 0.75,
                borderRadius: 2,
                bgcolor: "rgba(245, 158, 11, 0.14)",
                color: "#fcd34d",
                border: "1px solid rgba(245, 158, 11, 0.32)",
                fontSize: 12,
              }}
            >
              已改写 token: <s>{edit.original_token}</s> → <strong>{edit.replacement_token}</strong>
            </Box>
          ) : null}

          <Box
            sx={{
              width: isEditing ? "100%" : "auto",
              fontSize: 15,
              lineHeight: 1.8,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {isEditing ? (
              <TextField
                value={message.content}
                onChange={(event) => onChangeContent(event.target.value)}
                multiline
                minRows={message.role === "assistant" ? 6 : 4}
                fullWidth
                autoFocus
                variant="outlined"
                sx={inlineFieldSx}
              />
            ) : isAssistant ? (
              renderSegments.map((segment, index) => {
                if (segment.kind === "text") {
                  return <Box component="span" key={`${messageIndex}-gap-${index}`}>{segment.text}</Box>;
                }

                const tokenIndex = segment.tokenIndex;
                const isChanged = Boolean(edit && tokenIndex === edit.token_index);
                const isRegenerated = Boolean(edit && tokenIndex >= edit.regenerated_from_token_index);
                const isSelected = selectedToken?.messageIndex === messageIndex && selectedToken?.tokenIndex === tokenIndex;

                return (
                  <Box
                    key={`${messageIndex}-${tokenIndex}`}
                    component="button"
                    type="button"
                    onClick={() => onSelectToken(messageIndex, tokenIndex)}
                    sx={{
                      border: "none",
                      cursor: "pointer",
                      display: "inline",
                      font: "inherit",
                      color: isChanged ? "#111827" : "#f8fafc",
                      px: 0.35,
                      mx: 0.05,
                      borderRadius: 1,
                      backgroundColor: isChanged
                        ? "#f59e0b"
                        : isSelected
                          ? "rgba(96, 165, 250, 0.28)"
                          : isRegenerated
                            ? "rgba(59, 130, 246, 0.18)"
                            : "transparent",
                      boxShadow: isSelected ? "0 0 0 1px rgba(96, 165, 250, 0.9) inset" : "none",
                      fontWeight: isChanged ? 800 : isSelected ? 700 : 500,
                      transition: "background-color 120ms ease",
                      "&:hover": {
                        backgroundColor: isChanged ? "#fbbf24" : "rgba(148, 163, 184, 0.18)",
                      },
                    }}
                  >
                    {segment.text}
                  </Box>
                );
              })
            ) : (
              message.content
            )}
          </Box>
        </Stack>
      </Paper>
    </Box>
  );
}

function MessageFlowPanel({
  generatingAssistant,
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
  samplesLoading: boolean;
  sample: DatasetSample | null;
  sampleTokenization: DatasetSampleTokenization | null;
  savingSample: boolean;
  onGenerateAssistantMessage: () => void;
  selectedToken: TokenSelection | null;
  onSaveSample: () => void;
  onSelectToken: (messageIndex: number, tokenIndex: number) => void;
  onUpdateSampleMessages: (updater: (messages: DatasetMessage[]) => DatasetMessage[]) => void;
  onUpdateSampleTitle: (title: string) => void;
}) {
  const [editingMessageIndex, setEditingMessageIndex] = useState<number | null>(null);

  useEffect(() => {
    setEditingMessageIndex(null);
  }, [sample?.id]);

  return (
    <Box sx={{ minHeight: 0, display: "flex", flexDirection: "column", bgcolor: "#0f172a" }}>
      <Box
        sx={{
          px: 2,
          py: 1.5,
          borderBottom: "1px solid rgba(148, 163, 184, 0.12)",
          bgcolor: "#111827",
          display: "flex",
          flexDirection: "column",
          gap: 1.25,
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1.5}>
          <Typography variant="subtitle1" sx={{ color: "#f8fafc", fontWeight: 700 }}>
            消息流
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<SmartToyRoundedIcon />}
              onClick={onGenerateAssistantMessage}
              disabled={generatingAssistant || !sample}
              sx={{ color: "#e2e8f0", borderColor: "rgba(148, 163, 184, 0.28)" }}
            >
              {generatingAssistant ? "生成中..." : "生成 AI 消息"}
            </Button>
            <Button
              variant="outlined"
              size="small"
              startIcon={<SaveRoundedIcon />}
              onClick={onSaveSample}
              disabled={savingSample || !sample}
              sx={{ color: "#e2e8f0", borderColor: "rgba(148, 163, 184, 0.28)" }}
            >
              {savingSample ? "保存中..." : "保存样本"}
            </Button>
          </Stack>
        </Stack>

        {sample ? (
          <TextField label="样本标题" value={sample.title} onChange={(event) => onUpdateSampleTitle(event.target.value)} size="small" fullWidth sx={darkFieldSx} />
        ) : null}
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", p: { xs: 1.5, md: 2 } }}>
        {samplesLoading ? (
          <Typography variant="body2" sx={{ color: "#94a3b8" }}>
            加载样本中...
          </Typography>
        ) : !sample ? (
          <Typography variant="body2" sx={{ color: "#94a3b8" }}>
            选择一条样本开始编辑。
          </Typography>
        ) : (
          <Stack spacing={2.25}>
            {sample.messages.map((message, messageIndex) => (
              <MessageBubble
                key={`${sample.id}-${messageIndex}`}
                edit={sample.edits.find((item) => item.message_index === messageIndex) ?? null}
                isEditing={editingMessageIndex === messageIndex}
                message={message}
                messageIndex={messageIndex}
                messageTokenization={sampleTokenization?.messages.find((item) => item.message_index === messageIndex) ?? null}
                onChangeContent={(content) => onUpdateSampleMessages((messages) => messages.map((item, index) => (index === messageIndex ? { ...item, content } : item)))}
                onChangeRole={(role) => onUpdateSampleMessages((messages) => messages.map((item, index) => (index === messageIndex ? { ...item, role } : item)))}
                onDelete={
                  sample.messages.length > 1
                    ? () => {
                        onUpdateSampleMessages((messages) => messages.filter((_, index) => index !== messageIndex));
                        setEditingMessageIndex((current) => {
                          if (current === null) return current;
                          if (current === messageIndex) return null;
                          return current > messageIndex ? current - 1 : current;
                        });
                      }
                    : undefined
                }
                selectedToken={selectedToken}
                onSetEditing={(editing) => setEditingMessageIndex(editing ? messageIndex : null)}
                onSelectToken={onSelectToken}
              />
            ))}

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <Button
                variant="outlined"
                startIcon={<AddRoundedIcon />}
                onClick={() => {
                  onUpdateSampleMessages((messages) => [...messages, { role: "user", content: "" }]);
                  setEditingMessageIndex(sample.messages.length);
                }}
                sx={{ color: "#e2e8f0", borderColor: "rgba(148, 163, 184, 0.28)" }}
              >
                添加用户消息
              </Button>
              <Button
                variant="outlined"
                startIcon={<AddRoundedIcon />}
                onClick={() => {
                  onUpdateSampleMessages((messages) => [...messages, { role: "assistant", content: "" }]);
                  setEditingMessageIndex(sample.messages.length);
                }}
                sx={{ color: "#e2e8f0", borderColor: "rgba(148, 163, 184, 0.28)" }}
              >
                添加助手消息
              </Button>
            </Stack>
          </Stack>
        )}
      </Box>
    </Box>
  );
}

function MetadataAndTokenPanel({
  candidatesLoading,
  dataset,
  draft,
  fineTuneFiles,
  generating,
  modelOptions,
  modelOptionsError,
  modelsLoading,
  onChangeDraft,
  onGenerateContinuation,
  onLoadModelOptions,
  onSaveDataset,
  onSaveSample,
  onSetReplacementToken,
  replacementToken,
  saving,
  savingSample,
  selectedSample,
  selectedToken,
  tokenCandidates,
}: {
  candidatesLoading: boolean;
  dataset: DatasetRecord;
  draft: DatasetDraft;
  fineTuneFiles: UploadedFile[];
  generating: boolean;
  modelOptions: string[];
  modelOptionsError: string;
  modelsLoading: boolean;
  onChangeDraft: (draft: DatasetDraft | null) => void;
  onGenerateContinuation: () => void;
  onLoadModelOptions: () => void;
  onSaveDataset: () => void;
  onSaveSample: () => void;
  onSetReplacementToken: (value: string) => void;
  replacementToken: string;
  saving: boolean;
  savingSample: boolean;
  selectedSample: DatasetSample | null;
  selectedToken: TokenSelection | null;
  tokenCandidates: TokenCandidate[];
}) {
  return (
    <Box sx={{ minHeight: 0, bgcolor: "#111827", borderLeft: "1px solid rgba(148, 163, 184, 0.12)", display: "flex", flexDirection: "column" }}>
      <Box sx={{ px: 2, py: 1.5, borderBottom: "1px solid rgba(148, 163, 184, 0.12)" }}>
        <Typography variant="subtitle1" sx={{ color: "#f8fafc", fontWeight: 700 }}>
          改写与保存
        </Typography>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", p: 2 }}>
        <Stack spacing={2}>
          <Paper variant="outlined" sx={panelCardSx}>
            <Stack spacing={1.5}>
              <Typography variant="subtitle2" fontWeight={700}>
                Token 改写
              </Typography>
              {selectedToken ? (
                <>
                  <Typography variant="caption" sx={{ color: "#94a3b8" }}>
                    当前样本: {selectedSample?.title}
                  </Typography>
                  <Typography variant="body2" sx={{ color: "#fca5a5" }}>
                    原 token: {selectedToken.originalToken}
                  </Typography>
                  <TextField label="替换为" value={replacementToken} onChange={(event) => onSetReplacementToken(event.target.value)} fullWidth size="small" sx={darkFieldSx} />
                  <Stack spacing={0.75}>
                    <Typography variant="caption" sx={{ color: "#94a3b8" }}>
                      候选 token
                    </Typography>
                    {candidatesLoading ? (
                      <Typography variant="caption" sx={{ color: "#64748b" }}>
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
                              color: candidate.text === replacementToken ? "#0f172a" : "#e2e8f0",
                              borderColor: "rgba(148, 163, 184, 0.28)",
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            {formatCandidateLabel(candidate.text)}
                          </Button>
                        ))}
                      </Box>
                    ) : (
                      <Typography variant="caption" sx={{ color: "#64748b" }}>
                        暂无候选。
                      </Typography>
                    )}
                  </Stack>
                  <Button variant="contained" onClick={onGenerateContinuation} disabled={generating}>
                    {generating ? "生成中..." : "替换并继续生成"}
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<SaveRoundedIcon />}
                    onClick={onSaveSample}
                    disabled={savingSample}
                    sx={{ color: "#e2e8f0", borderColor: "rgba(148, 163, 184, 0.28)" }}
                  >
                    {savingSample ? "保存中..." : "保存到数据集"}
                  </Button>
                </>
              ) : (
                <Typography variant="body2" sx={{ color: "#94a3b8" }}>
                  点击 assistant 消息中的任意 token 后，可将它替换为新 token，并让模型从该位置继续生成。
                </Typography>
              )}
            </Stack>
          </Paper>

          <Paper variant="outlined" sx={panelCardSx}>
            <Stack spacing={2}>
              <Typography variant="subtitle2" fontWeight={700}>
                数据集元数据
              </Typography>
              <Typography variant="caption" sx={{ color: "#94a3b8" }}>
                datasets/{dataset.id}/dataset.yaml
              </Typography>
              <TextField label="数据集名称" value={draft.name} onChange={(event) => onChangeDraft({ ...draft, name: event.target.value })} fullWidth size="small" sx={darkFieldSx} />
              <Autocomplete
                freeSolo
                options={modelOptions}
                value={draft.base_model}
                inputValue={draft.base_model}
                loading={modelsLoading}
                onOpen={onLoadModelOptions}
                onChange={(_, value) => onChangeDraft({ ...draft, base_model: typeof value === "string" ? value : value ?? "" })}
                onInputChange={(_, value) => onChangeDraft({ ...draft, base_model: value })}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="标注模型 / Base Model"
                    helperText={modelOptionsError || "可从模型列表选择，也可直接输入本地模型目录路径。"}
                    fullWidth
                    size="small"
                    sx={darkFieldSx}
                    slotProps={{
                      input: {
                        ...params.InputProps,
                        endAdornment: (
                          <>
                            {modelsLoading ? <CircularProgress color="inherit" size={16} /> : null}
                            {params.InputProps.endAdornment}
                          </>
                        ),
                      },
                    }}
                  />
                )}
              />
              <FormControl fullWidth size="small" sx={darkFieldSx}>
                <InputLabel id={`dataset-training-file-label-${dataset.id}`}>训练文件</InputLabel>
                <Select
                  labelId={`dataset-training-file-label-${dataset.id}`}
                  label="训练文件"
                  value={draft.training_file_id}
                  onChange={(event) => onChangeDraft({ ...draft, training_file_id: event.target.value })}
                >
                  <MenuItem value="">未绑定</MenuItem>
                  {fineTuneFiles.map((file) => (
                    <MenuItem key={file.id} value={file.id}>
                      {file.filename}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button variant="outlined" onClick={onSaveDataset} disabled={saving}>
                {saving ? "保存中..." : "保存数据集配置"}
              </Button>
            </Stack>
          </Paper>
        </Stack>
      </Box>
    </Box>
  );
}

function TokenActionMiniPanel({
  candidatesLoading,
  generating,
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
  onGenerateContinuation: () => void;
  onSaveSample: () => void;
  onSetReplacementToken: (value: string) => void;
  replacementToken: string;
  savingSample: boolean;
  selectedSample: DatasetSample | null;
  selectedToken: TokenSelection | null;
  tokenCandidates: TokenCandidate[];
}) {
  if (!selectedToken) {
    return <Typography variant="body2" sx={{ color: "#94a3b8" }}>点击 assistant 消息里的 token 开始改写。</Typography>;
  }

  return (
    <Stack spacing={1.25}>
      <Typography variant="caption" sx={{ color: "#94a3b8" }}>
        {selectedSample?.title} · 原 token: {selectedToken.originalToken}
      </Typography>
      <TextField label="替换为" value={replacementToken} onChange={(event) => onSetReplacementToken(event.target.value)} size="small" fullWidth sx={darkFieldSx} />
      <Stack spacing={0.75}>
        <Typography variant="caption" sx={{ color: "#94a3b8" }}>
          候选 token
        </Typography>
        {candidatesLoading ? (
          <Typography variant="caption" sx={{ color: "#64748b" }}>
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
                  color: candidate.text === replacementToken ? "#0f172a" : "#e2e8f0",
                  borderColor: "rgba(148, 163, 184, 0.28)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {formatCandidateLabel(candidate.text)}
              </Button>
            ))}
          </Box>
        ) : (
          <Typography variant="caption" sx={{ color: "#64748b" }}>
            暂无候选。
          </Typography>
        )}
      </Stack>
      <Stack direction="row" spacing={1}>
        <Button variant="contained" size="small" onClick={onGenerateContinuation} disabled={generating} sx={{ flex: 1 }}>
          {generating ? "生成中..." : "继续生成"}
        </Button>
        <Button variant="outlined" size="small" onClick={onSaveSample} disabled={savingSample} sx={{ flex: 1, color: "#e2e8f0", borderColor: "rgba(148, 163, 184, 0.28)" }}>
          {savingSample ? "保存中..." : "保存"}
        </Button>
      </Stack>
    </Stack>
  );
}

function MobileDatasetSheet({
  activeDatasetId,
  creating,
  dataSummary,
  datasets,
  importInputRef,
  loading,
  onCreateDataset,
  onDeleteDataset,
  onImportDataset,
  onOpenDataset,
  onOpenNextDataset,
}: {
  activeDatasetId: string | null;
  creating: boolean;
  dataSummary: DataSummaryItem[];
  datasets: DatasetRecord[];
  importInputRef: RefObject<HTMLInputElement | null>;
  loading: boolean;
  onCreateDataset: () => void;
  onDeleteDataset: (dataset: DatasetRecord) => void;
  onImportDataset: (event: ChangeEvent<HTMLInputElement>) => void;
  onOpenDataset: (dataset: DatasetRecord) => void;
  onOpenNextDataset: () => void;
}) {
  return (
    <Box sx={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}>
      <Box sx={{ px: 2, py: 1.5, borderBottom: "1px solid rgba(148, 163, 184, 0.12)", flexShrink: 0 }}>
        <Typography variant="subtitle1" fontWeight={700}>
          数据集
        </Typography>
      </Box>

      <Stack direction="row" spacing={1} sx={{ p: 2, flexShrink: 0 }}>
        <Button variant="contained" size="small" startIcon={<AddRoundedIcon />} onClick={onCreateDataset} disabled={creating} sx={{ flex: 1 }}>
          {creating ? "创建中" : "新建"}
        </Button>
        <Button
          variant="outlined"
          size="small"
          startIcon={<CloudUploadRoundedIcon />}
          onClick={() => importInputRef.current?.click()}
          sx={{ color: "#e2e8f0", borderColor: "rgba(148, 163, 184, 0.28)" }}
        >
          上传
        </Button>
        <Button
          variant="outlined"
          size="small"
          startIcon={<FolderOpenRoundedIcon />}
          onClick={onOpenNextDataset}
          sx={{ color: "#e2e8f0", borderColor: "rgba(148, 163, 184, 0.28)" }}
        >
          打开
        </Button>
        <input ref={importInputRef} hidden type="file" accept=".yaml,.yml,.json,.jsonl" onChange={onImportDataset} />
      </Stack>

      <Box sx={{ px: 1.5, flex: 1, minHeight: 0, overflow: "auto" }}>
        <List sx={{ p: 0 }}>
          {datasets.map((dataset) => (
            <ListItemButton
              key={dataset.id}
              selected={activeDatasetId === dataset.id}
              onClick={() => onOpenDataset(dataset)}
              sx={{ borderRadius: 2, color: "#e2e8f0", mb: 0.75, "&.Mui-selected": { bgcolor: "rgba(59, 130, 246, 0.18)" } }}
            >
              <ListItemIcon sx={{ minWidth: 34, color: "#93c5fd" }}>
                <StorageRoundedIcon fontSize="small" />
              </ListItemIcon>
              <Box sx={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 1 }}>
                <ListItemText
                  primary={dataset.name}
                  secondary={`${dataset.sample_count ?? 0} 条样本`}
                  slotProps={{ primary: { fontSize: 14 }, secondary: { sx: { color: "#94a3b8" } } }}
                />
                <IconButton
                  size="small"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDeleteDataset(dataset);
                  }}
                  sx={{ color: "#94a3b8", flexShrink: 0 }}
                >
                  <DeleteOutlineRoundedIcon fontSize="small" />
                </IconButton>
              </Box>
            </ListItemButton>
          ))}
          {!loading && datasets.length === 0 ? (
            <Typography variant="body2" sx={{ px: 1, py: 2, color: "#94a3b8" }}>
              还没有数据集。
            </Typography>
          ) : null}
        </List>
      </Box>

      <Box sx={{ p: 1.5, borderTop: "1px solid rgba(148, 163, 184, 0.12)", flexShrink: 0 }}>
        <Box sx={{ display: "flex", gap: 1, overflowX: "auto" }}>
          {dataSummary.map((item) => (
            <Paper
              key={item.title}
              variant="outlined"
              sx={{ minWidth: 120, p: 1.25, bgcolor: "#0f172a", borderColor: "rgba(148, 163, 184, 0.12)", color: "#e2e8f0", flexShrink: 0 }}
            >
              <Stack spacing={0.75}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Box sx={{ display: "flex", color: "#7dd3fc" }}>{renderSummaryIcon(item.icon)}</Box>
                  <Typography variant="caption">{item.title}</Typography>
                </Stack>
                <Typography variant="caption" sx={{ color: "#94a3b8" }}>
                  {item.value}
                </Typography>
              </Stack>
            </Paper>
          ))}
        </Box>
      </Box>
    </Box>
  );
}

function EditorTabs({
  activeDatasetId,
  datasetTabs,
  onCloseDataset,
  onSelectDataset,
}: {
  activeDatasetId: string | null;
  datasetTabs: DatasetRecord[];
  onCloseDataset: (datasetId: string) => void;
  onSelectDataset: (datasetId: string | null) => void;
}) {
  return (
    <Box
      sx={{
        minHeight: 48,
        bgcolor: "#0b1220",
        borderBottom: "1px solid rgba(148, 163, 184, 0.12)",
        display: "flex",
        alignItems: "center",
        flexShrink: 0,
      }}
    >
      <Tabs
        value={activeDatasetId ?? false}
        onChange={(_: SyntheticEvent, value: string) => onSelectDataset(value)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ minHeight: 48, width: "100%", "& .MuiTabs-indicator": { backgroundColor: "#60a5fa" } }}
      >
        {datasetTabs.map((tab) => (
          <Tab
            key={tab.id}
            value={tab.id}
            disableRipple
            sx={{ minHeight: 48, textTransform: "none", color: "#cbd5e1", alignItems: "stretch", px: 0 }}
            label={
              <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 1.5, minWidth: 0 }}>
                <Typography variant="body2" sx={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {tab.name}
                </Typography>
                <IconButton
                  size="small"
                  sx={{ color: "#94a3b8" }}
                  onClick={(event) => {
                    event.stopPropagation();
                    onCloseDataset(tab.id);
                  }}
                >
                  <CloseRoundedIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Stack>
            }
          />
        ))}
      </Tabs>
    </Box>
  );
}

export function WorkspaceShell({
  activeDataset,
  creating,
  dataSummary,
  datasets,
  datasetTabs,
  draft,
  error,
  fineTuneFiles,
  importInputRef,
  isMobile,
  loading,
  mobileExplorerOpen,
  mobileSamplesOpen,
  mobileMetadataOpen,
  desktopExplorerCollapsed,
  modelOptions,
  modelOptionsError,
  modelsLoading,
  onChangeDraft,
  onCloseDataset,
  onCreateDataset,
  onDeleteDataset,
  onImportDataset,
  onOpenDataset,
  onOpenNextDataset,
  onLoadModelOptions,
  onSaveDataset,
  onSelectDataset,
  onSetDesktopExplorerCollapsed,
  onSetMobileExplorerOpen,
  onSetMobileSamplesOpen,
  onSetMobileMetadataOpen,
  samples,
  samplesLoading,
  selectedSample,
  selectedSampleTokenization,
  selectedSampleId,
  dirtySampleIds,
  selectedToken,
  tokenCandidates,
  candidatesLoading,
  replacementToken,
  generating,
  generatingAssistant,
  saving,
  savingSample,
  onCreateSample,
  onGenerateAssistantMessage,
  onGenerateContinuation,
  onSaveSample,
  onUpdateSelectedSampleTitle,
  onUpdateSelectedSampleMessages,
  onSelectSample,
  onSelectToken,
  onSetReplacementToken,
}: WorkspaceShellProps) {
  const metadataPanel = activeDataset && draft ? (
    <MetadataAndTokenPanel
      dataset={activeDataset}
      draft={draft}
      fineTuneFiles={fineTuneFiles}
      generating={generating}
      modelOptions={modelOptions}
      modelOptionsError={modelOptionsError}
      modelsLoading={modelsLoading}
      onChangeDraft={onChangeDraft}
      onGenerateContinuation={onGenerateContinuation}
      onLoadModelOptions={onLoadModelOptions}
      onSaveDataset={onSaveDataset}
      onSaveSample={onSaveSample}
      onSetReplacementToken={onSetReplacementToken}
      replacementToken={replacementToken}
      saving={saving}
      savingSample={savingSample}
      selectedSample={selectedSample}
      selectedToken={selectedToken}
      tokenCandidates={tokenCandidates}
      candidatesLoading={candidatesLoading}
    />
  ) : null;

  return isMobile ? (
    <Box sx={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}>
      <Box
        sx={{
          px: 1.5,
          py: 1,
          bgcolor: "#111827",
          borderBottom: "1px solid rgba(148, 163, 184, 0.12)",
          display: "flex",
          gap: 1,
          flexShrink: 0,
        }}
      >
        <Button size="small" variant="outlined" startIcon={<StorageRoundedIcon />} onClick={() => onSetMobileExplorerOpen(true)} sx={{ flex: 1, color: "#e2e8f0", borderColor: "rgba(148, 163, 184, 0.24)" }}>
          数据集
        </Button>
        <Button size="small" variant="outlined" startIcon={<DataObjectRoundedIcon />} onClick={() => onSetMobileSamplesOpen(true)} sx={{ flex: 1, color: "#e2e8f0", borderColor: "rgba(148, 163, 184, 0.24)" }}>
          样本
        </Button>
        <Button size="small" variant="outlined" startIcon={<TuneRoundedIcon />} onClick={() => onSetMobileMetadataOpen(true)} sx={{ flex: 1, color: "#e2e8f0", borderColor: "rgba(148, 163, 184, 0.24)" }}>
          编辑
        </Button>
      </Box>

      <EditorTabs activeDatasetId={activeDataset?.id ?? null} datasetTabs={datasetTabs} onCloseDataset={onCloseDataset} onSelectDataset={onSelectDataset} />

      {error ? (
        <Box sx={{ p: 1.5, bgcolor: "#111827", borderBottom: "1px solid rgba(148, 163, 184, 0.12)" }}>
          <Alert severity="error">{error}</Alert>
        </Box>
      ) : null}

      <Box sx={{ px: 1.5, py: 1, borderBottom: "1px solid rgba(148, 163, 184, 0.12)", flexShrink: 0 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
          <Typography variant="caption" sx={{ color: "#94a3b8" }}>
            {selectedSample ? `当前样本: ${selectedSample.title}` : "当前没有样本"}
          </Typography>
          <Button size="small" variant="text" onClick={() => onSetMobileSamplesOpen(true)} sx={{ minWidth: 0, px: 0, color: "#93c5fd" }}>
            切换
          </Button>
        </Stack>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0 }}>
        <MessageFlowPanel
          generatingAssistant={generatingAssistant}
          samplesLoading={samplesLoading}
          sample={selectedSample}
          sampleTokenization={selectedSampleTokenization}
          savingSample={savingSample}
          onGenerateAssistantMessage={onGenerateAssistantMessage}
          selectedToken={selectedToken}
          onSaveSample={onSaveSample}
          onSelectToken={onSelectToken}
          onUpdateSampleMessages={onUpdateSelectedSampleMessages}
          onUpdateSampleTitle={onUpdateSelectedSampleTitle}
        />
      </Box>

      <Paper elevation={0} sx={{ borderTop: "1px solid rgba(148, 163, 184, 0.12)", bgcolor: "#111827", p: 1.5, flexShrink: 0 }}>
        <TokenActionMiniPanel
          generating={generating}
          onGenerateContinuation={onGenerateContinuation}
          onSaveSample={onSaveSample}
          onSetReplacementToken={onSetReplacementToken}
          replacementToken={replacementToken}
          savingSample={savingSample}
          selectedSample={selectedSample}
          selectedToken={selectedToken}
          tokenCandidates={tokenCandidates}
          candidatesLoading={candidatesLoading}
        />
      </Paper>

      <Drawer
        anchor="bottom"
        open={mobileExplorerOpen}
        onClose={() => onSetMobileExplorerOpen(false)}
        PaperProps={{ sx: { height: "72dvh", borderTopLeftRadius: 18, borderTopRightRadius: 18, bgcolor: "#111827", color: "#e2e8f0", overflow: "hidden" } }}
      >
        <MobileDatasetSheet
          activeDatasetId={activeDataset?.id ?? null}
          creating={creating}
          dataSummary={dataSummary}
          datasets={datasets}
          importInputRef={importInputRef}
          loading={loading}
          onCreateDataset={onCreateDataset}
          onDeleteDataset={onDeleteDataset}
          onImportDataset={onImportDataset}
          onOpenDataset={onOpenDataset}
          onOpenNextDataset={onOpenNextDataset}
        />
      </Drawer>

      <Drawer
        anchor="bottom"
        open={mobileSamplesOpen}
        onClose={() => onSetMobileSamplesOpen(false)}
        PaperProps={{ sx: { height: "72dvh", borderTopLeftRadius: 18, borderTopRightRadius: 18, bgcolor: "#111827", color: "#e2e8f0", overflow: "hidden" } }}
      >
        <SampleListPane
          compact
          dirtySampleIds={dirtySampleIds}
          onCreateSample={onCreateSample}
          onSelectSample={(sampleId) => {
            onSelectSample(sampleId);
            onSetMobileSamplesOpen(false);
          }}
          samples={samples}
          samplesLoading={samplesLoading}
          savingSample={savingSample}
          selectedSampleId={selectedSampleId}
        />
      </Drawer>

      <Drawer
        anchor="bottom"
        open={mobileMetadataOpen}
        onClose={() => onSetMobileMetadataOpen(false)}
        PaperProps={{ sx: { height: "72dvh", borderTopLeftRadius: 18, borderTopRightRadius: 18, bgcolor: "#111827", color: "#e2e8f0", overflow: "hidden" } }}
      >
        {metadataPanel}
      </Drawer>
    </Box>
  ) : (
    <Box sx={{ display: "flex", height: "100%", minHeight: 0 }}>
      <ActivityRail explorerCollapsed={desktopExplorerCollapsed} onToggleExplorer={() => onSetDesktopExplorerCollapsed(!desktopExplorerCollapsed)} />
      <Box
        sx={{
          position: "relative",
          width: 320,
          marginRight: desktopExplorerCollapsed ? "-320px" : 0,
          minHeight: 0,
          flexShrink: 0,
          overflow: "hidden",
          transition: "margin-right 160ms ease",
          pointerEvents: desktopExplorerCollapsed ? "none" : "auto",
        }}
      >
        <ExplorerPane
          activeDatasetId={activeDataset?.id ?? null}
          collapsed={desktopExplorerCollapsed}
          creating={creating}
          dataSummary={dataSummary}
          datasets={datasets}
          importInputRef={importInputRef}
          loading={loading}
          onCreateDataset={onCreateDataset}
          onDeleteDataset={onDeleteDataset}
          onImportDataset={onImportDataset}
          onOpenDataset={onOpenDataset}
          onOpenNextDataset={onOpenNextDataset}
          onToggleCollapse={() => onSetDesktopExplorerCollapsed(!desktopExplorerCollapsed)}
        />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <EditorTabs activeDatasetId={activeDataset?.id ?? null} datasetTabs={datasetTabs} onCloseDataset={onCloseDataset} onSelectDataset={onSelectDataset} />

        {error ? (
          <Box sx={{ p: 1.5, bgcolor: "#111827", borderBottom: "1px solid rgba(148, 163, 184, 0.12)" }}>
            <Alert severity="error">{error}</Alert>
          </Box>
        ) : null}

        <Box sx={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "260px minmax(0, 1fr) 360px" }}>
          <SampleListPane
            dirtySampleIds={dirtySampleIds}
            onCreateSample={onCreateSample}
            onSelectSample={onSelectSample}
            samples={samples}
            samplesLoading={samplesLoading}
            savingSample={savingSample}
            selectedSampleId={selectedSampleId}
          />
          <MessageFlowPanel
            generatingAssistant={generatingAssistant}
            samplesLoading={samplesLoading}
            sample={selectedSample}
            sampleTokenization={selectedSampleTokenization}
            savingSample={savingSample}
            onGenerateAssistantMessage={onGenerateAssistantMessage}
            selectedToken={selectedToken}
            onSaveSample={onSaveSample}
            onSelectToken={onSelectToken}
            onUpdateSampleMessages={onUpdateSelectedSampleMessages}
            onUpdateSampleTitle={onUpdateSelectedSampleTitle}
          />
          {metadataPanel}
        </Box>
      </Box>
    </Box>
  );
}
