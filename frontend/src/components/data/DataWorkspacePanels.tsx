import {
  type ChangeEvent,
  type ReactNode,
  type RefObject,
  useState,
} from "react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CloudUploadRoundedIcon from "@mui/icons-material/CloudUploadRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DataObjectRoundedIcon from "@mui/icons-material/DataObjectRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import FolderOpenRoundedIcon from "@mui/icons-material/FolderOpenRounded";
import KeyboardDoubleArrowLeftRoundedIcon from "@mui/icons-material/KeyboardDoubleArrowLeftRounded";
import KeyboardDoubleArrowRightRoundedIcon from "@mui/icons-material/KeyboardDoubleArrowRightRounded";
import StorageRoundedIcon from "@mui/icons-material/StorageRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import {
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Collapse,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { useI18n } from "../../i18n";
import type { DatasetRecord, DatasetSample } from "../../types/app";
import { darkFieldSx } from "./dataWorkspaceStyles";
import type { DatasetDraft } from "./dataWorkspaceTypes";
import { describeSample } from "./dataWorkspaceUtils";
import { getWorkspaceColors } from "./dataWorkspaceTheme";

export function ActivityRail({
  explorerCollapsed,
  onToggleExplorer,
}: {
  explorerCollapsed: boolean;
  onToggleExplorer: () => void;
}) {
  return (
    <Box
      sx={{
        width: 56,
        bgcolor: (theme) => getWorkspaceColors(theme).railBg,
        borderRight: (theme) => `1px solid ${getWorkspaceColors(theme).border}`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        py: 1.5,
        gap: 1,
      }}
    >
      <IconButton
        color="primary"
        sx={{ color: (theme) => getWorkspaceColors(theme).accent }}
      >
        <StorageRoundedIcon />
      </IconButton>
      <IconButton
        onClick={onToggleExplorer}
        sx={{
          color: (theme) =>
            explorerCollapsed
              ? getWorkspaceColors(theme).accent
              : getWorkspaceColors(theme).textMuted,
        }}
      >
        {explorerCollapsed ? (
          <KeyboardDoubleArrowRightRoundedIcon />
        ) : (
          <KeyboardDoubleArrowLeftRoundedIcon />
        )}
      </IconButton>
      <IconButton
        sx={{ color: (theme) => getWorkspaceColors(theme).textMuted }}
      >
        <DataObjectRoundedIcon />
      </IconButton>
      <IconButton
        sx={{ color: (theme) => getWorkspaceColors(theme).textMuted }}
      >
        <TuneRoundedIcon />
      </IconButton>
    </Box>
  );
}

export function ExplorerPane({
  activeDatasetId,
  collapsed,
  creating,
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
  const { t, formatDatasetCount } = useI18n();

  return (
    <Box
      sx={{
        position: "absolute",
        inset: 0,
        width: 320,
        minHeight: 0,
        borderRight: (theme) => `1px solid ${getWorkspaceColors(theme).border}`,
        bgcolor: (theme) => getWorkspaceColors(theme).panelBg,
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
          borderBottom: (theme) =>
            `1px solid ${getWorkspaceColors(theme).border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="overline"
            sx={{ color: (theme) => getWorkspaceColors(theme).textSecondary }}
          >
            Explorer
          </Typography>
          <Typography
            variant="subtitle1"
            sx={{
              color: (theme) => getWorkspaceColors(theme).textPrimary,
              fontWeight: 700,
            }}
          >
            {t("Dataset workspace")}
          </Typography>
        </Box>
        <IconButton
          size="small"
          onClick={onToggleCollapse}
          sx={{
            color: (theme) => getWorkspaceColors(theme).textSecondary,
            flexShrink: 0,
          }}
        >
          <KeyboardDoubleArrowLeftRoundedIcon fontSize="small" />
        </IconButton>
      </Box>

      <Stack direction="row" spacing={1} sx={{ p: 2 }}>
        <Button
          variant="contained"
          size="small"
          startIcon={<AddRoundedIcon />}
          onClick={onCreateDataset}
          disabled={creating}
          sx={{ flex: 1 }}
        >
          {creating ? t("Creating") : t("New")}
        </Button>
        <Button
          variant="outlined"
          size="small"
          startIcon={<CloudUploadRoundedIcon />}
          onClick={() => importInputRef.current?.click()}
          sx={{ color: "text.primary", borderColor: "divider" }}
        >
          {t("Import")}
        </Button>
        <Button
          variant="outlined"
          size="small"
          startIcon={<FolderOpenRoundedIcon />}
          onClick={onOpenNextDataset}
          sx={{ flex: 1, color: "text.primary", borderColor: "divider" }}
        >
          {t("Open")}
        </Button>
        <input
          ref={importInputRef}
          hidden
          type="file"
          accept=".yaml,.yml,.json,.jsonl"
          onChange={onImportDataset}
        />
      </Stack>

      <Box sx={{ px: 1.5, pb: 1.5, flex: 1, minHeight: 0, overflow: "auto" }}>
        <Typography
          variant="caption"
          sx={{
            px: 1,
            color: (theme) => getWorkspaceColors(theme).textSecondary,
          }}
        >
          {t("Datasets")}
        </Typography>
        <List sx={{ pt: 0.5 }}>
          {datasets.map((dataset) => (
            <ListItemButton
              key={dataset.id}
              selected={activeDatasetId === dataset.id}
              onClick={() => onOpenDataset(dataset)}
              sx={{
                borderRadius: 2,
                color: "text.primary",
                mb: 0.5,
                "&.Mui-selected": {
                  bgcolor: (theme) => getWorkspaceColors(theme).selectedBg,
                },
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: 34,
                  color: (theme) => getWorkspaceColors(theme).accent,
                }}
              >
                <StorageRoundedIcon fontSize="small" />
              </ListItemIcon>
              <Box
                sx={{
                  flex: 1,
                  minWidth: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                }}
              >
                <ListItemText
                  primary={dataset.name}
                  secondary={formatDatasetCount(dataset.sample_count)}
                  slotProps={{
                    primary: { fontSize: 14 },
                    secondary: { sx: { color: "text.secondary" } },
                  }}
                />
                <IconButton
                  size="small"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDeleteDataset(dataset);
                  }}
                  sx={{ color: "text.secondary", flexShrink: 0 }}
                >
                  <DeleteOutlineRoundedIcon fontSize="small" />
                </IconButton>
              </Box>
            </ListItemButton>
          ))}
          {!loading && datasets.length === 0 ? (
            <Typography
              variant="body2"
              sx={{ px: 1, py: 2, color: "text.secondary" }}
            >
              {t("No datasets yet. Create one to get started.")}
            </Typography>
          ) : null}
        </List>
      </Box>
    </Box>
  );
}

export function SampleListPane({
  compact = false,
  dirtySampleIds,
  metadataSection,
  onCreateSample,
  onDeleteSample,
  onSelectSample,
  samples,
  samplesLoading,
  savingSample,
  selectedSampleId,
}: {
  compact?: boolean;
  dirtySampleIds: string[];
  metadataSection?: ReactNode;
  onCreateSample: () => void;
  onDeleteSample: (sample: DatasetSample) => void;
  onSelectSample: (sampleId: string | null) => void;
  samples: DatasetSample[];
  samplesLoading: boolean;
  savingSample: boolean;
  selectedSampleId: string | null;
}) {
  const { t } = useI18n();

  return (
    <Box
      sx={{
        minHeight: 0,
        borderRight: compact
          ? "none"
          : (theme) => `1px solid ${getWorkspaceColors(theme).border}`,
        bgcolor: (theme) => getWorkspaceColors(theme).panelBg,
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
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
        }}
      >
        <Stack spacing={0.25} sx={{ minWidth: 0 }}>
          <Typography
            variant="subtitle1"
            sx={{
              color: (theme) => getWorkspaceColors(theme).textPrimary,
              fontWeight: 700,
            }}
          >
            {t("Samples")}
          </Typography>
          <Typography
            variant="caption"
            sx={{ color: (theme) => getWorkspaceColors(theme).textSecondary }}
          >{`${samples.length} ${t("items")}`}</Typography>
        </Stack>
        <Button
          size="small"
          variant="contained"
          startIcon={<AddRoundedIcon />}
          onClick={onCreateSample}
          disabled={savingSample}
          sx={{ flexShrink: 0 }}
        >
          {savingSample ? t("Creating") : t("New")}
        </Button>
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", p: 1.5 }}>
        {samplesLoading ? (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {t("Loading samples...")}
          </Typography>
        ) : samples.length === 0 ? (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {t("This dataset has no samples yet.")}
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
                  color: "text.primary",
                  mb: 0.75,
                  px: compact ? 1.25 : 1.5,
                  alignItems: "flex-start",
                  "&.Mui-selected": {
                    bgcolor: (theme) => getWorkspaceColors(theme).selectedBg,
                  },
                }}
              >
                <Box
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 1,
                  }}
                >
                  <ListItemText
                    primary={
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="body2" fontWeight={700} noWrap>
                          {sample.title}
                        </Typography>
                        {dirtySampleIds.includes(sample.id) ? (
                          <Box
                            sx={{
                              width: 7,
                              height: 7,
                              borderRadius: "50%",
                              bgcolor: (theme) =>
                                getWorkspaceColors(theme).tokenChangedBg,
                            }}
                          />
                        ) : null}
                      </Stack>
                    }
                    secondary={
                      <Typography
                        variant="caption"
                        sx={{ color: "text.secondary" }}
                      >
                        {describeSample(sample).slice(0, 48)}
                      </Typography>
                    }
                  />
                  <IconButton
                    size="small"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDeleteSample(sample);
                    }}
                    sx={{ mt: 0.25, color: "text.secondary", flexShrink: 0 }}
                  >
                    <DeleteOutlineRoundedIcon fontSize="small" />
                  </IconButton>
                </Box>
              </ListItemButton>
            ))}
          </List>
        )}
      </Box>
      {metadataSection ? (
        <Box
          sx={{
            borderTop: (theme) =>
              `1px solid ${getWorkspaceColors(theme).border}`,
            flexShrink: 0,
          }}
        >
          {metadataSection}
        </Box>
      ) : null}
    </Box>
  );
}

export function DatasetMetadataForm({
  dataset,
  draft,
  modelOptions,
  modelOptionsError,
  modelsLoading,
  onChangeDraft,
  onLoadModelOptions,
  onSaveDataset,
  saving,
}: {
  dataset: DatasetRecord;
  draft: DatasetDraft;
  modelOptions: string[];
  modelOptionsError: string;
  modelsLoading: boolean;
  onChangeDraft: (draft: DatasetDraft | null) => void;
  onLoadModelOptions: () => void;
  onSaveDataset: () => void;
  saving: boolean;
}) {
  const { t } = useI18n();

  return (
    <Stack spacing={2}>
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        datasets/{dataset.id}/dataset.yaml
      </Typography>
      <TextField
        label={t("Dataset name")}
        value={draft.name}
        onChange={(event) =>
          onChangeDraft({ ...draft, name: event.target.value })
        }
        fullWidth
        size="small"
        sx={darkFieldSx}
      />
      <Autocomplete
        freeSolo
        options={modelOptions}
        value={draft.base_model}
        inputValue={draft.base_model}
        loading={modelsLoading}
        onOpen={onLoadModelOptions}
        onChange={(_, value) =>
          onChangeDraft({
            ...draft,
            base_model: typeof value === "string" ? value : (value ?? ""),
          })
        }
        onInputChange={(_, value) =>
          onChangeDraft({ ...draft, base_model: value })
        }
        renderInput={(params) => (
          <TextField
            {...params}
            label={t("Annotation model / Base model")}
            helperText={
              modelOptionsError ||
              t(
                "Choose from the model list or enter a local model path directly.",
              )
            }
            fullWidth
            size="small"
            sx={darkFieldSx}
            slotProps={{
              input: {
                ...params.InputProps,
                endAdornment: (
                  <>
                    {modelsLoading ? (
                      <CircularProgress color="inherit" size={16} />
                    ) : null}
                    {params.InputProps.endAdornment}
                  </>
                ),
              },
            }}
          />
        )}
      />
      <Button variant="outlined" onClick={onSaveDataset} disabled={saving}>
        {saving ? t("Saving...") : t("Save dataset config")}
      </Button>
    </Stack>
  );
}

export function DatasetMetadataSection(props: {
  dataset: DatasetRecord;
  draft: DatasetDraft;
  modelOptions: string[];
  modelOptionsError: string;
  modelsLoading: boolean;
  onChangeDraft: (draft: DatasetDraft | null) => void;
  onLoadModelOptions: () => void;
  onSaveDataset: () => void;
  saving: boolean;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);

  return (
    <Box sx={{ overflow: "hidden" }}>
      <Button
        fullWidth
        onClick={() => setExpanded((current) => !current)}
        endIcon={
          <ExpandMoreRoundedIcon
            sx={{
              fontSize: 18,
              transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 160ms ease",
            }}
          />
        }
        sx={{
          minHeight: 32,
          justifyContent: "space-between",
          px: 1.5,
          py: 0.375,
          color: "text.primary",
          borderRadius: 0,
        }}
      >
        {t("Dataset metadata")}
      </Button>
      <Collapse in={expanded}>
        <Box
          sx={{
            px: 1.5,
            pb: 1.5,
            borderTop: (theme) =>
              `1px solid ${getWorkspaceColors(theme).border}`,
          }}
        >
          <DatasetMetadataForm {...props} />
        </Box>
      </Collapse>
    </Box>
  );
}

export function MobileDatasetSheet({
  activeDatasetId,
  creating,
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
  datasets: DatasetRecord[];
  importInputRef: RefObject<HTMLInputElement | null>;
  loading: boolean;
  onCreateDataset: () => void;
  onDeleteDataset: (dataset: DatasetRecord) => void;
  onImportDataset: (event: ChangeEvent<HTMLInputElement>) => void;
  onOpenDataset: (dataset: DatasetRecord) => void;
  onOpenNextDataset: () => void;
}) {
  const { t, formatDatasetCount } = useI18n();

  return (
    <Box
      sx={{
        height: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          px: 2,
          py: 1.5,
          borderBottom: (theme) =>
            `1px solid ${getWorkspaceColors(theme).border}`,
          flexShrink: 0,
        }}
      >
        <Typography variant="subtitle1" fontWeight={700}>
          {t("Datasets")}
        </Typography>
      </Box>
      <Stack direction="row" spacing={1} sx={{ p: 2, flexShrink: 0 }}>
        <Button
          variant="contained"
          size="small"
          startIcon={<AddRoundedIcon />}
          onClick={onCreateDataset}
          disabled={creating}
          sx={{ flex: 1 }}
        >
          {creating ? t("Creating") : t("New")}
        </Button>
        <Button
          variant="outlined"
          size="small"
          startIcon={<CloudUploadRoundedIcon />}
          onClick={() => importInputRef.current?.click()}
          sx={{ color: "text.primary", borderColor: "divider" }}
        >
          {t("Import")}
        </Button>
        <Button
          variant="outlined"
          size="small"
          startIcon={<FolderOpenRoundedIcon />}
          onClick={onOpenNextDataset}
          sx={{ color: "text.primary", borderColor: "divider" }}
        >
          {t("Open")}
        </Button>
        <input
          ref={importInputRef}
          hidden
          type="file"
          accept=".yaml,.yml,.json,.jsonl"
          onChange={onImportDataset}
        />
      </Stack>
      <Box sx={{ px: 1.5, flex: 1, minHeight: 0, overflow: "auto" }}>
        <List sx={{ p: 0 }}>
          {datasets.map((dataset) => (
            <ListItemButton
              key={dataset.id}
              selected={activeDatasetId === dataset.id}
              onClick={() => onOpenDataset(dataset)}
              sx={{
                borderRadius: 2,
                color: "text.primary",
                mb: 0.75,
                "&.Mui-selected": {
                  bgcolor: (theme) => getWorkspaceColors(theme).selectedBg,
                },
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: 34,
                  color: (theme) => getWorkspaceColors(theme).accent,
                }}
              >
                <StorageRoundedIcon fontSize="small" />
              </ListItemIcon>
              <Box
                sx={{
                  flex: 1,
                  minWidth: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                }}
              >
                <ListItemText
                  primary={dataset.name}
                  secondary={formatDatasetCount(dataset.sample_count)}
                  slotProps={{
                    primary: { fontSize: 14 },
                    secondary: { sx: { color: "text.secondary" } },
                  }}
                />
                <IconButton
                  size="small"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDeleteDataset(dataset);
                  }}
                  sx={{ color: "text.secondary", flexShrink: 0 }}
                >
                  <DeleteOutlineRoundedIcon fontSize="small" />
                </IconButton>
              </Box>
            </ListItemButton>
          ))}
          {!loading && datasets.length === 0 ? (
            <Typography
              variant="body2"
              sx={{ px: 1, py: 2, color: "text.secondary" }}
            >
              {t("No datasets yet.")}
            </Typography>
          ) : null}
        </List>
      </Box>
    </Box>
  );
}

export function EditorTabs({
  activeDatasetId,
  datasetTabs,
  hasWelcomeTab = false,
  onCloseDataset,
  onSelectDataset,
}: {
  activeDatasetId: string | null;
  datasetTabs: DatasetRecord[];
  hasWelcomeTab?: boolean;
  onCloseDataset: (datasetId: string) => void;
  onSelectDataset: (datasetId: string | null) => void;
}) {
  const { t } = useI18n();
  const tabValue = activeDatasetId ?? (hasWelcomeTab ? "__welcome__" : false);

  return (
    <Box
      sx={{
        minHeight: 48,
        bgcolor: (theme) => getWorkspaceColors(theme).tabBg,
        borderBottom: (theme) =>
          `1px solid ${getWorkspaceColors(theme).border}`,
        display: "flex",
        alignItems: "center",
        flexShrink: 0,
      }}
    >
      <Tabs
        value={tabValue}
        onChange={(_, value: string | false) =>
          onSelectDataset(value === "__welcome__" ? null : value || null)
        }
        variant="scrollable"
        scrollButtons="auto"
        sx={{
          minHeight: 48,
          width: "100%",
          "& .MuiTabs-indicator": { backgroundColor: "primary.main" },
          "& .MuiTabScrollButton-root": { color: "text.secondary" },
        }}
      >
        {hasWelcomeTab ? (
          <Tab
            value="__welcome__"
            disableRipple
            sx={{
              minHeight: 48,
              textTransform: "none",
              color: "text.secondary",
              alignItems: "stretch",
              px: 0,
            }}
            label={
              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                sx={{ px: 1.5, minWidth: 0 }}
              >
                <Typography variant="body2">{t("Welcome")}</Typography>
              </Stack>
            }
          />
        ) : null}
        {datasetTabs.map((tab) => (
          <Tab
            key={tab.id}
            value={tab.id}
            disableRipple
            sx={{
              minHeight: 48,
              textTransform: "none",
              color: "text.secondary",
              alignItems: "stretch",
              px: 0,
            }}
            label={
              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                sx={{ px: 1.5, minWidth: 0 }}
              >
                <Typography
                  variant="body2"
                  sx={{
                    maxWidth: 180,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {tab.name}
                </Typography>
                <IconButton
                  size="small"
                  sx={{ color: "text.secondary" }}
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
