import {
  type ChangeEvent,
  type RefObject,
  type SyntheticEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
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
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CloudDoneRoundedIcon from "@mui/icons-material/CloudDoneRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import CloudUploadRoundedIcon from "@mui/icons-material/CloudUploadRounded";
import DataObjectRoundedIcon from "@mui/icons-material/DataObjectRounded";
import DnsRoundedIcon from "@mui/icons-material/DnsRounded";
import FolderOpenRoundedIcon from "@mui/icons-material/FolderOpenRounded";
import KeyRoundedIcon from "@mui/icons-material/KeyRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import StorageRoundedIcon from "@mui/icons-material/StorageRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import type { ApiListResponse, DatasetRecord, DataSummaryItem, UploadedFile } from "../../types/app";

interface DataWorkspaceProps {
  dataSummary: DataSummaryItem[];
  isMobile: boolean;
}

interface DatasetDraft {
  name: string;
  base_model: string;
  training_file_id: string;
}

interface DatasetEditorSharedProps {
  dataset: DatasetRecord;
  draft: DatasetDraft;
  fineTuneFiles: UploadedFile[];
  onChangeDraft: (draft: DatasetDraft) => void;
  onSaveDataset: () => void;
  saving: boolean;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const payload = (await response.json()) as { detail?: string };
      if (payload.detail) {
        message = payload.detail;
      }
    } catch {
      message = response.statusText || message;
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

function DataWorkspace({ dataSummary, isMobile }: DataWorkspaceProps) {
  const [datasets, setDatasets] = useState<DatasetRecord[]>([]);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [datasetTabs, setDatasetTabs] = useState<DatasetRecord[]>([]);
  const [activeDatasetId, setActiveDatasetId] = useState<string | null>(null);
  const [recentDatasetIds, setRecentDatasetIds] = useState<string[]>([]);
  const [draft, setDraft] = useState<DatasetDraft | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [mobileExplorerOpen, setMobileExplorerOpen] = useState(false);
  const [mobileMetadataOpen, setMobileMetadataOpen] = useState(false);
  const untitledCountRef = useRef(1);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const fineTuneFiles = useMemo(
    () => files.filter((file) => file.purpose === "fine-tune"),
    [files],
  );
  const activeDataset = datasetTabs.find((tab) => tab.id === activeDatasetId) ?? null;
  const recentDatasets = useMemo(
    () =>
      recentDatasetIds
        .map((id) => datasets.find((dataset) => dataset.id === id))
        .filter((dataset): dataset is DatasetRecord => Boolean(dataset)),
    [datasets, recentDatasetIds],
  );

  useEffect(() => {
    void refreshWorkspace();
  }, []);

  useEffect(() => {
    if (!activeDataset) {
      setDraft(null);
      setMobileMetadataOpen(false);
      return;
    }
    setDraft({
      name: activeDataset.name,
      base_model: activeDataset.base_model ?? "Qwen/Qwen2.5-7B-Instruct",
      training_file_id: activeDataset.training_file_id ?? "",
    });
  }, [activeDataset]);

  async function refreshWorkspace() {
    setLoading(true);
    try {
      const [datasetsPayload, filesPayload] = await Promise.all([
        fetchJson<ApiListResponse<DatasetRecord>>("/api/datasets"),
        fetchJson<ApiListResponse<UploadedFile>>("/api/files"),
      ]);
      setDatasets(datasetsPayload.data);
      setFiles(filesPayload.data);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载数据工作区失败");
    } finally {
      setLoading(false);
    }
  }

  function openDataset(dataset: DatasetRecord) {
    setRecentDatasetIds((current) => [dataset.id, ...current.filter((id) => id !== dataset.id)].slice(0, 6));
    setMobileExplorerOpen(false);
    setDatasetTabs((currentTabs) => {
      if (currentTabs.some((tab) => tab.id === dataset.id)) {
        setActiveDatasetId(dataset.id);
        return currentTabs;
      }
      setActiveDatasetId(dataset.id);
      return [...currentTabs, dataset];
    });
  }

  async function handleCreateDataset() {
    setCreating(true);
    try {
      const nextName = `dataset-${untitledCountRef.current}`;
      untitledCountRef.current += 1;
      const created = await fetchJson<DatasetRecord>("/api/datasets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nextName,
          base_model: "Qwen/Qwen2.5-7B-Instruct",
        }),
      });
      setDatasets((current) => [created, ...current]);
      openDataset(created);
      setError("");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "创建数据集失败");
    } finally {
      setCreating(false);
    }
  }

  function handleOpenNextDataset() {
    const nextDataset = datasets.find((dataset) => !datasetTabs.some((tab) => tab.id === dataset.id));
    if (nextDataset) {
      openDataset(nextDataset);
    }
  }

  function handleCloseDataset(datasetId: string) {
    setDatasetTabs((currentTabs) => {
      const nextTabs = currentTabs.filter((tab) => tab.id !== datasetId);
      if (activeDatasetId === datasetId) {
        setActiveDatasetId(nextTabs.length > 0 ? nextTabs[nextTabs.length - 1].id : null);
      }
      return nextTabs;
    });
  }

  async function handleSaveDataset() {
    if (!activeDataset || !draft) {
      return;
    }
    setSaving(true);
    try {
      const updated = await fetchJson<DatasetRecord>(`/api/datasets/${activeDataset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name.trim() || activeDataset.name,
          base_model: draft.base_model.trim(),
          training_file_id: draft.training_file_id || null,
        }),
      });
      setDatasets((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setDatasetTabs((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setActiveDatasetId(updated.id);
      setError("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存数据集失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleImportDataset(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setCreating(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const imported = await fetchJson<DatasetRecord>("/api/datasets/import", {
        method: "POST",
        body: formData,
      });
      await refreshWorkspace();
      openDataset(imported);
      setError("");
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "导入数据集失败");
    } finally {
      setCreating(false);
      event.target.value = "";
    }
  }

  return (
    <Paper
      elevation={0}
      sx={{
        height: "100%",
        minHeight: 0,
        borderRadius: 0,
        overflow: "hidden",
        border: 0,
        bgcolor: "#0f172a",
      }}
    >
      {datasetTabs.length === 0 ? (
        <DatasetHome
          creating={creating}
          dataSummary={dataSummary}
          datasets={datasets}
          importInputRef={importInputRef}
          isMobile={isMobile}
          loading={loading}
          onCreateDataset={() => void handleCreateDataset()}
          onImportDataset={handleImportDataset}
          onOpenDataset={openDataset}
          recentDatasets={recentDatasets}
        />
      ) : isMobile ? (
        <MobileWorkspace
          activeDataset={activeDataset}
          creating={creating}
          dataSummary={dataSummary}
          datasets={datasets}
          datasetTabs={datasetTabs}
          draft={draft}
          error={error}
          fineTuneFiles={fineTuneFiles}
          importInputRef={importInputRef}
          loading={loading}
          mobileExplorerOpen={mobileExplorerOpen}
          mobileMetadataOpen={mobileMetadataOpen}
          onChangeDraft={setDraft}
          onCloseDataset={handleCloseDataset}
          onCreateDataset={() => void handleCreateDataset()}
          onImportDataset={handleImportDataset}
          onOpenDataset={openDataset}
          onOpenNextDataset={handleOpenNextDataset}
          onSaveDataset={() => void handleSaveDataset()}
          onSelectDataset={setActiveDatasetId}
          onSetMobileExplorerOpen={setMobileExplorerOpen}
          onSetMobileMetadataOpen={setMobileMetadataOpen}
          saving={saving}
        />
      ) : (
        <Box sx={{ display: "flex", height: "100%", minHeight: 0 }}>
          <ActivityRail />
          <ExplorerPane
            activeDatasetId={activeDatasetId}
            creating={creating}
            dataSummary={dataSummary}
            datasets={datasets}
            importInputRef={importInputRef}
            loading={loading}
            onCreateDataset={() => void handleCreateDataset()}
            onImportDataset={handleImportDataset}
            onOpenDataset={openDataset}
            onOpenNextDataset={handleOpenNextDataset}
          />
          <DesktopEditorArea
            activeDataset={activeDataset}
            datasetTabs={datasetTabs}
            draft={draft}
            error={error}
            fineTuneFiles={fineTuneFiles}
            onChangeDraft={setDraft}
            onCloseDataset={handleCloseDataset}
            onSaveDataset={() => void handleSaveDataset()}
            onSelectDataset={setActiveDatasetId}
            saving={saving}
          />
        </Box>
      )}
    </Paper>
  );
}

function ActivityRail() {
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
      <IconButton sx={{ color: "#64748b" }}>
        <DataObjectRoundedIcon />
      </IconButton>
      <IconButton sx={{ color: "#64748b" }}>
        <TuneRoundedIcon />
      </IconButton>
    </Box>
  );
}

interface DatasetHomeProps {
  creating: boolean;
  dataSummary: DataSummaryItem[];
  datasets: DatasetRecord[];
  importInputRef: RefObject<HTMLInputElement | null>;
  isMobile: boolean;
  loading: boolean;
  onCreateDataset: () => void;
  onImportDataset: (event: ChangeEvent<HTMLInputElement>) => void;
  onOpenDataset: (dataset: DatasetRecord) => void;
  recentDatasets: DatasetRecord[];
}

function DatasetHome({
  creating,
  dataSummary,
  datasets,
  importInputRef,
  isMobile,
  loading,
  onCreateDataset,
  onImportDataset,
  onOpenDataset,
  recentDatasets,
}: DatasetHomeProps) {
  return (
    <Box
      sx={{
        height: "100%",
        minHeight: 0,
        px: { xs: 2, md: 4 },
        py: { xs: 2, md: 3 },
        display: "flex",
        flexDirection: "column",
        gap: 2,
        color: "#e2e8f0",
        overflow: "hidden",
      }}
    >
      <Typography variant={isMobile ? "h5" : "h4"} fontWeight={700}>
        数据集
      </Typography>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ flexShrink: 0 }}>
        <Button
          variant="contained"
          size="large"
          startIcon={<AddRoundedIcon />}
          onClick={onCreateDataset}
          disabled={creating}
        >
          {creating ? "创建中..." : "新建数据集"}
        </Button>
        <Button
          variant="outlined"
          size="large"
          startIcon={<CloudUploadRoundedIcon />}
          onClick={() => importInputRef.current?.click()}
          sx={{ color: "#e2e8f0", borderColor: "rgba(148, 163, 184, 0.28)" }}
        >
          上传数据集
        </Button>
        <input
          ref={importInputRef}
          hidden
          type="file"
          accept=".yaml,.yml,.json,.jsonl"
          onChange={onImportDataset}
        />
      </Stack>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", lg: "minmax(0,1fr) 280px" },
          overflow: "hidden",
        }}
      >
        <Stack spacing={2} sx={{ minHeight: 0, overflow: "hidden" }}>
          {recentDatasets.length > 0 ? (
            <Box sx={{ flexShrink: 0 }}>
              <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.25 }}>
                最近打开
              </Typography>
              <Box sx={{ display: "flex", gap: 1.5, overflowX: "auto", pb: 0.5 }}>
                {recentDatasets.slice(0, 6).map((dataset) => (
                  <Card
                    key={dataset.id}
                    variant="outlined"
                    sx={{
                      minWidth: isMobile ? 220 : 260,
                      bgcolor: "#111827",
                      borderColor: "rgba(148, 163, 184, 0.12)",
                      flexShrink: 0,
                    }}
                  >
                    <CardActionArea onClick={() => onOpenDataset(dataset)}>
                      <CardContent>
                        <Stack spacing={1}>
                          <Typography variant="subtitle1" fontWeight={700} noWrap>
                            {dataset.name}
                          </Typography>
                          <Typography variant="body2" sx={{ color: "#94a3b8" }} noWrap>
                            {dataset.base_model ?? "未设置模型"}
                          </Typography>
                        </Stack>
                      </CardContent>
                    </CardActionArea>
                  </Card>
                ))}
              </Box>
            </Box>
          ) : null}

          <Paper
            variant="outlined"
            sx={{
              flex: 1,
              minHeight: 0,
              bgcolor: "#111827",
              borderColor: "rgba(148, 163, 184, 0.12)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <Box sx={{ px: 2, py: 1.5, borderBottom: "1px solid rgba(148, 163, 184, 0.12)" }}>
              <Typography variant="subtitle1" fontWeight={700}>
                所有数据集
              </Typography>
            </Box>

            <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", p: 1.5 }}>
              {loading ? (
                <Typography variant="body2" sx={{ color: "#94a3b8" }}>
                  加载中...
                </Typography>
              ) : datasets.length === 0 ? (
                <Typography variant="body2" sx={{ color: "#94a3b8" }}>
                  还没有数据集。
                </Typography>
              ) : isMobile ? (
                <List sx={{ p: 0 }}>
                  {datasets.map((dataset) => (
                    <ListItemButton
                      key={dataset.id}
                      onClick={() => onOpenDataset(dataset)}
                      sx={{
                        borderRadius: 2,
                        color: "#e2e8f0",
                        mb: 0.75,
                        bgcolor: "#0f172a",
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: 36, color: "#93c5fd" }}>
                        <StorageRoundedIcon fontSize="small" />
                      </ListItemIcon>
                      <ListItemText
                        primary={dataset.name}
                        secondary={dataset.base_model ?? dataset.training_filename ?? "未绑定模型"}
                        slotProps={{
                          primary: { fontSize: 14 },
                          secondary: { sx: { color: "#94a3b8" } },
                        }}
                      />
                    </ListItemButton>
                  ))}
                </List>
              ) : (
                <Box
                  sx={{
                    display: "grid",
                    gap: 2,
                    gridTemplateColumns: {
                      md: "repeat(2, minmax(0, 1fr))",
                      xl: "repeat(3, minmax(0, 1fr))",
                    },
                  }}
                >
                  {datasets.map((dataset) => (
                    <Card
                      key={dataset.id}
                      variant="outlined"
                      sx={{
                        bgcolor: "#0f172a",
                        borderColor: "rgba(148, 163, 184, 0.12)",
                      }}
                    >
                      <CardActionArea onClick={() => onOpenDataset(dataset)}>
                        <CardContent>
                          <Stack spacing={1.5}>
                            <Stack direction="row" justifyContent="space-between" spacing={1.5}>
                              <Typography variant="subtitle1" fontWeight={700} noWrap>
                                {dataset.name}
                              </Typography>
                              <StorageRoundedIcon sx={{ color: "#93c5fd" }} />
                            </Stack>
                            <Typography variant="body2" sx={{ color: "#94a3b8" }} noWrap>
                              {dataset.base_model ?? "未设置模型"}
                            </Typography>
                            <Typography variant="caption" sx={{ color: "#64748b" }} noWrap>
                              {dataset.training_filename ?? "未绑定训练文件"}
                            </Typography>
                          </Stack>
                        </CardContent>
                      </CardActionArea>
                    </Card>
                  ))}
                </Box>
              )}
            </Box>
          </Paper>
        </Stack>

        <SummaryPanel dataSummary={dataSummary} mobile={isMobile} />
      </Box>
    </Box>
  );
}

interface SummaryPanelProps {
  dataSummary: DataSummaryItem[];
  mobile: boolean;
}

function SummaryPanel({ dataSummary, mobile }: SummaryPanelProps) {
  if (mobile) {
    return (
      <Box sx={{ display: "flex", gap: 1.5, overflowX: "auto", pb: 0.5 }}>
        {dataSummary.map((item) => (
          <Paper
            key={item.title}
            variant="outlined"
            sx={{
              minWidth: 140,
              p: 1.5,
              bgcolor: "#111827",
              borderColor: "rgba(148, 163, 184, 0.12)",
              color: "#e2e8f0",
              flexShrink: 0,
            }}
          >
            <Stack spacing={1}>
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
    );
  }

  return (
    <Paper
      variant="outlined"
      sx={{
        bgcolor: "#111827",
        borderColor: "rgba(148, 163, 184, 0.12)",
        p: 2,
        overflow: "auto",
      }}
    >
      <Typography variant="subtitle1" fontWeight={700} sx={{ color: "#f8fafc", mb: 1.5 }}>
        状态
      </Typography>
      <Stack spacing={1.25}>
        {dataSummary.map((item) => (
          <Stack
            key={item.title}
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            spacing={1.5}
            sx={{ color: "#cbd5e1" }}
          >
            <Stack direction="row" spacing={1} alignItems="center">
              <Box sx={{ display: "flex", color: "#7dd3fc" }}>{renderSummaryIcon(item.icon)}</Box>
              <Typography variant="body2">{item.title}</Typography>
            </Stack>
            <Typography
              variant="caption"
              sx={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", color: "#94a3b8" }}
            >
              {item.value}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Paper>
  );
}

interface ExplorerPaneProps {
  activeDatasetId: string | null;
  creating: boolean;
  dataSummary: DataSummaryItem[];
  datasets: DatasetRecord[];
  importInputRef: RefObject<HTMLInputElement | null>;
  loading: boolean;
  onCreateDataset: () => void;
  onImportDataset: (event: ChangeEvent<HTMLInputElement>) => void;
  onOpenDataset: (dataset: DatasetRecord) => void;
  onOpenNextDataset: () => void;
}

function ExplorerPane({
  activeDatasetId,
  creating,
  dataSummary,
  datasets,
  importInputRef,
  loading,
  onCreateDataset,
  onImportDataset,
  onOpenDataset,
  onOpenNextDataset,
}: ExplorerPaneProps) {
  return (
    <Box
      sx={{
        width: 320,
        minHeight: 0,
        borderRight: "1px solid rgba(148, 163, 184, 0.12)",
        bgcolor: "#111827",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Box sx={{ px: 2, py: 1.5, borderBottom: "1px solid rgba(148, 163, 184, 0.12)" }}>
        <Typography variant="overline" sx={{ color: "#94a3b8" }}>
          Explorer
        </Typography>
        <Typography variant="subtitle1" sx={{ color: "#f8fafc", fontWeight: 700 }}>
          数据集工作区
        </Typography>
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
        <input
          ref={importInputRef}
          hidden
          type="file"
          accept=".yaml,.yml,.json,.jsonl"
          onChange={onImportDataset}
        />
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
              sx={{
                borderRadius: 2,
                color: "#e2e8f0",
                mb: 0.5,
                "&.Mui-selected": {
                  bgcolor: "rgba(59, 130, 246, 0.18)",
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 34, color: "#93c5fd" }}>
                <StorageRoundedIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary={dataset.name}
                secondary={dataset.base_model ?? dataset.training_filename ?? "未绑定模型"}
                slotProps={{
                  primary: { fontSize: 14 },
                  secondary: { sx: { color: "#94a3b8" } },
                }}
              />
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
            <Stack
              key={item.title}
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              sx={{ color: "#cbd5e1" }}
            >
              <Stack direction="row" spacing={1} alignItems="center">
                <Box sx={{ display: "flex", color: "#7dd3fc" }}>{renderSummaryIcon(item.icon)}</Box>
                <Typography variant="caption">{item.title}</Typography>
              </Stack>
              <Typography
                variant="caption"
                sx={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}
              >
                {item.value}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </Box>
    </Box>
  );
}

interface DesktopEditorAreaProps {
  activeDataset: DatasetRecord | null;
  datasetTabs: DatasetRecord[];
  draft: DatasetDraft | null;
  error: string;
  fineTuneFiles: UploadedFile[];
  onChangeDraft: (draft: DatasetDraft | null) => void;
  onCloseDataset: (datasetId: string) => void;
  onSaveDataset: () => void;
  onSelectDataset: (datasetId: string | null) => void;
  saving: boolean;
}

function DesktopEditorArea({
  activeDataset,
  datasetTabs,
  draft,
  error,
  fineTuneFiles,
  onChangeDraft,
  onCloseDataset,
  onSaveDataset,
  onSelectDataset,
  saving,
}: DesktopEditorAreaProps) {
  return (
    <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
      <EditorTabs
        activeDatasetId={activeDataset?.id ?? null}
        datasetTabs={datasetTabs}
        onCloseDataset={onCloseDataset}
        onSelectDataset={onSelectDataset}
      />

      {error ? (
        <Box sx={{ p: 2, borderBottom: "1px solid rgba(148, 163, 184, 0.12)", bgcolor: "#111827", flexShrink: 0 }}>
          <Alert severity="error">{error}</Alert>
        </Box>
      ) : null}

      <Box sx={{ flex: 1, minHeight: 0, bgcolor: "#0f172a", display: "flex" }}>
        {activeDataset && draft ? (
          <Box sx={{ flex: 1, display: "flex", minWidth: 0, minHeight: 0 }}>
            <EditorSurface dataset={activeDataset} draft={draft} />
            <Box
              sx={{
                width: 360,
                borderLeft: "1px solid rgba(148, 163, 184, 0.12)",
                bgcolor: "#111827",
                minHeight: 0,
              }}
            >
              <DatasetMetadataPanel
                dataset={activeDataset}
                draft={draft}
                fineTuneFiles={fineTuneFiles}
                onChangeDraft={(nextDraft) => onChangeDraft(nextDraft)}
                onSaveDataset={onSaveDataset}
                saving={saving}
              />
            </Box>
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}

interface MobileWorkspaceProps extends DesktopEditorAreaProps {
  creating: boolean;
  dataSummary: DataSummaryItem[];
  datasets: DatasetRecord[];
  importInputRef: RefObject<HTMLInputElement | null>;
  loading: boolean;
  mobileExplorerOpen: boolean;
  mobileMetadataOpen: boolean;
  onCreateDataset: () => void;
  onImportDataset: (event: ChangeEvent<HTMLInputElement>) => void;
  onOpenDataset: (dataset: DatasetRecord) => void;
  onOpenNextDataset: () => void;
  onSetMobileExplorerOpen: (open: boolean) => void;
  onSetMobileMetadataOpen: (open: boolean) => void;
}

function MobileWorkspace({
  activeDataset,
  creating,
  dataSummary,
  datasets,
  datasetTabs,
  draft,
  error,
  fineTuneFiles,
  importInputRef,
  loading,
  mobileExplorerOpen,
  mobileMetadataOpen,
  onChangeDraft,
  onCloseDataset,
  onCreateDataset,
  onImportDataset,
  onOpenDataset,
  onOpenNextDataset,
  onSaveDataset,
  onSelectDataset,
  onSetMobileExplorerOpen,
  onSetMobileMetadataOpen,
  saving,
}: MobileWorkspaceProps) {
  return (
    <Box sx={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
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
        <Button
          size="small"
          variant="outlined"
          startIcon={<StorageRoundedIcon />}
          onClick={() => onSetMobileExplorerOpen(true)}
          sx={{ flex: 1, color: "#e2e8f0", borderColor: "rgba(148, 163, 184, 0.24)" }}
        >
          数据集
        </Button>
        <Button
          size="small"
          variant="outlined"
          startIcon={<TuneRoundedIcon />}
          disabled={!draft}
          onClick={() => onSetMobileMetadataOpen(true)}
          sx={{ flex: 1, color: "#e2e8f0", borderColor: "rgba(148, 163, 184, 0.24)" }}
        >
          元数据
        </Button>
      </Box>

      <EditorTabs
        activeDatasetId={activeDataset?.id ?? null}
        datasetTabs={datasetTabs}
        onCloseDataset={onCloseDataset}
        onSelectDataset={onSelectDataset}
      />

      {error ? (
        <Box sx={{ p: 1.5, borderBottom: "1px solid rgba(148, 163, 184, 0.12)", bgcolor: "#111827", flexShrink: 0 }}>
          <Alert severity="error">{error}</Alert>
        </Box>
      ) : null}

      <Box sx={{ flex: 1, minHeight: 0, bgcolor: "#0f172a", display: "flex", overflow: "hidden" }}>
        {activeDataset && draft ? <EditorSurface dataset={activeDataset} draft={draft} mobile /> : null}
      </Box>

      <Drawer
        anchor="bottom"
        open={mobileExplorerOpen}
        onClose={() => onSetMobileExplorerOpen(false)}
        PaperProps={{
          sx: {
            height: "72dvh",
            borderTopLeftRadius: 18,
            borderTopRightRadius: 18,
            bgcolor: "#111827",
            color: "#e2e8f0",
            overflow: "hidden",
          },
        }}
      >
        <MobileDatasetSheet
          activeDatasetId={activeDataset?.id ?? null}
          creating={creating}
          dataSummary={dataSummary}
          datasets={datasets}
          importInputRef={importInputRef}
          loading={loading}
          onCreateDataset={onCreateDataset}
          onImportDataset={onImportDataset}
          onOpenDataset={onOpenDataset}
          onOpenNextDataset={onOpenNextDataset}
        />
      </Drawer>

      <Drawer
        anchor="bottom"
        open={mobileMetadataOpen}
        onClose={() => onSetMobileMetadataOpen(false)}
        PaperProps={{
          sx: {
            height: "72dvh",
            borderTopLeftRadius: 18,
            borderTopRightRadius: 18,
            bgcolor: "#111827",
            color: "#e2e8f0",
            overflow: "hidden",
          },
        }}
      >
        {activeDataset && draft ? (
          <DatasetMetadataPanel
            dataset={activeDataset}
            draft={draft}
            fineTuneFiles={fineTuneFiles}
            onChangeDraft={(nextDraft) => onChangeDraft(nextDraft)}
            onSaveDataset={onSaveDataset}
            saving={saving}
          />
        ) : null}
      </Drawer>
    </Box>
  );
}

interface MobileDatasetSheetProps {
  activeDatasetId: string | null;
  creating: boolean;
  dataSummary: DataSummaryItem[];
  datasets: DatasetRecord[];
  importInputRef: RefObject<HTMLInputElement | null>;
  loading: boolean;
  onCreateDataset: () => void;
  onImportDataset: (event: ChangeEvent<HTMLInputElement>) => void;
  onOpenDataset: (dataset: DatasetRecord) => void;
  onOpenNextDataset: () => void;
}

function MobileDatasetSheet({
  activeDatasetId,
  creating,
  dataSummary,
  datasets,
  importInputRef,
  loading,
  onCreateDataset,
  onImportDataset,
  onOpenDataset,
  onOpenNextDataset,
}: MobileDatasetSheetProps) {
  return (
    <Box sx={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}>
      <Box sx={{ px: 2, py: 1.5, borderBottom: "1px solid rgba(148, 163, 184, 0.12)", flexShrink: 0 }}>
        <Typography variant="subtitle1" fontWeight={700}>
          数据集
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
                color: "#e2e8f0",
                mb: 0.75,
                "&.Mui-selected": {
                  bgcolor: "rgba(59, 130, 246, 0.18)",
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 34, color: "#93c5fd" }}>
                <StorageRoundedIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary={dataset.name}
                secondary={dataset.base_model ?? dataset.training_filename ?? "未绑定模型"}
                slotProps={{
                  primary: { fontSize: 14 },
                  secondary: { sx: { color: "#94a3b8" } },
                }}
              />
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
              sx={{
                minWidth: 120,
                p: 1.25,
                bgcolor: "#0f172a",
                borderColor: "rgba(148, 163, 184, 0.12)",
                color: "#e2e8f0",
                flexShrink: 0,
              }}
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

interface EditorTabsProps {
  activeDatasetId: string | null;
  datasetTabs: DatasetRecord[];
  onCloseDataset: (datasetId: string) => void;
  onSelectDataset: (datasetId: string | null) => void;
}

function EditorTabs({ activeDatasetId, datasetTabs, onCloseDataset, onSelectDataset }: EditorTabsProps) {
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
        sx={{
          minHeight: 48,
          width: "100%",
          "& .MuiTabs-indicator": {
            backgroundColor: "#60a5fa",
          },
        }}
      >
        {datasetTabs.map((tab) => (
          <Tab
            key={tab.id}
            value={tab.id}
            disableRipple
            sx={{
              minHeight: 48,
              textTransform: "none",
              color: "#cbd5e1",
              alignItems: "stretch",
              px: 0,
            }}
            label={
              <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 1.5, minWidth: 0 }}>
                <Typography
                  variant="body2"
                  sx={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}
                >
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

function EditorSurface({
  dataset,
  draft,
  mobile = false,
}: {
  dataset: DatasetRecord;
  draft: DatasetDraft;
  mobile?: boolean;
}) {
  return (
    <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <Box
        sx={{
          px: 2,
          py: 1,
          borderBottom: "1px solid rgba(148, 163, 184, 0.12)",
          color: "#94a3b8",
          bgcolor: "#111827",
          flexShrink: 0,
        }}
      >
        <Typography variant="caption">datasets/{dataset.id}/dataset.yaml</Typography>
      </Box>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          p: mobile ? 2 : 4,
          overflow: "hidden",
        }}
      >
        <Stack spacing={1.5} sx={{ maxWidth: 540, textAlign: "center", color: "#e2e8f0" }}>
          <Typography variant={mobile ? "h6" : "h5"} fontWeight={700}>
            {draft.name}
          </Typography>
        </Stack>
      </Box>
    </Box>
  );
}

function DatasetMetadataPanel({
  dataset,
  draft,
  fineTuneFiles,
  onChangeDraft,
  onSaveDataset,
  saving,
}: DatasetEditorSharedProps) {
  return (
    <Box sx={{ height: "100%", minHeight: 0, overflow: "auto", p: 2 }}>
      <Stack spacing={2}>
        <Typography variant="subtitle1" sx={{ color: "#f8fafc", fontWeight: 700 }}>
          数据集元数据
        </Typography>
        <Typography variant="caption" sx={{ color: "#94a3b8" }}>
          datasets/{dataset.id}/dataset.yaml
        </Typography>
        <TextField
          label="数据集名称"
          value={draft.name}
          onChange={(event) => onChangeDraft({ ...draft, name: event.target.value })}
          fullWidth
          size="small"
          sx={darkFieldSx}
        />
        <TextField
          label="标注模型 / Base Model"
          value={draft.base_model}
          onChange={(event) => onChangeDraft({ ...draft, base_model: event.target.value })}
          helperText="支持 Hugging Face 模型 ID，也支持本地模型目录路径。"
          fullWidth
          size="small"
          sx={darkFieldSx}
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
        <Button
          variant="contained"
          startIcon={<SaveRoundedIcon />}
          onClick={onSaveDataset}
          disabled={saving}
        >
          {saving ? "保存中..." : "保存到 dataset.yaml"}
        </Button>
        <Paper
          variant="outlined"
          sx={{
            p: 2,
            bgcolor: "#0f172a",
            borderColor: "rgba(148, 163, 184, 0.12)",
          }}
        >
          <Typography variant="caption" sx={{ color: "#94a3b8" }}>
            预览
          </Typography>
          <Box
            component="pre"
            sx={{
              mt: 1,
              mb: 0,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              color: "#e2e8f0",
              fontFamily: '"IBM Plex Mono", "SFMono-Regular", monospace',
              fontSize: 12,
            }}
          >
{`name: ${draft.name}
base_model: ${draft.base_model || '""'}
training_file_id: ${draft.training_file_id || "null"}`}
          </Box>
        </Paper>
      </Stack>
    </Box>
  );
}

function renderSummaryIcon(icon: DataSummaryItem["icon"]) {
  switch (icon) {
    case "gateway":
      return <CloudDoneRoundedIcon fontSize="small" />;
    case "health":
      return <DnsRoundedIcon fontSize="small" />;
    case "upstream":
      return <TuneRoundedIcon fontSize="small" />;
    case "auth":
      return <KeyRoundedIcon fontSize="small" />;
    default:
      return null;
  }
}

const darkFieldSx = {
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

export default DataWorkspace;
