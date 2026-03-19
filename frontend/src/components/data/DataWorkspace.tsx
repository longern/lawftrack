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
  const [draft, setDraft] = useState<DatasetDraft | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const untitledCountRef = useRef(1);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const fineTuneFiles = useMemo(
    () => files.filter((file) => file.purpose === "fine-tune"),
    [files],
  );
  const activeDataset = datasetTabs.find((tab) => tab.id === activeDatasetId) ?? null;

  useEffect(() => {
    void refreshWorkspace();
  }, []);

  useEffect(() => {
    if (!activeDataset) {
      setDraft(null);
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
    setDatasetTabs((currentTabs) => {
      if (currentTabs.some((tab) => tab.id === dataset.id)) {
        setActiveDatasetId(dataset.id);
        return currentTabs;
      }
      const nextTabs = [...currentTabs, dataset];
      setActiveDatasetId(dataset.id);
      return nextTabs;
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
        minHeight: "calc(100vh - 72px)",
        borderRadius: 0,
        overflow: "hidden",
        border: 0,
        bgcolor: "#0f172a",
      }}
    >
      <Box sx={{ display: "flex", minHeight: "calc(100vh - 72px)", flexDirection: { xs: "column", md: "row" } }}>
        {!isMobile ? <ActivityRail /> : null}
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
        <EditorArea
          activeDataset={activeDataset}
          datasetTabs={datasetTabs}
          draft={draft}
          error={error}
          fineTuneFiles={fineTuneFiles}
          onChangeDraft={setDraft}
          onCloseDataset={handleCloseDataset}
          onCreateDataset={() => void handleCreateDataset()}
          onOpenNextDataset={handleOpenNextDataset}
          onSaveDataset={() => void handleSaveDataset()}
          onSelectDataset={setActiveDatasetId}
          saving={saving}
        />
      </Box>
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
        width: { xs: "100%", md: 320 },
        borderRight: { md: "1px solid rgba(148, 163, 184, 0.12)" },
        borderBottom: { xs: "1px solid rgba(148, 163, 184, 0.12)", md: 0 },
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
          sx={{
            color: "#e2e8f0",
            borderColor: "rgba(148, 163, 184, 0.28)",
          }}
        >
          上传
        </Button>
        <Button
          variant="outlined"
          size="small"
          startIcon={<FolderOpenRoundedIcon />}
          onClick={onOpenNextDataset}
          sx={{
            flex: 1,
            color: "#e2e8f0",
            borderColor: "rgba(148, 163, 184, 0.28)",
          }}
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

      <Box sx={{ px: 1.5, pb: 1.5, flex: 1, overflow: "auto" }}>
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

      <Box sx={{ p: 1.5, borderTop: "1px solid rgba(148, 163, 184, 0.12)" }}>
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

interface EditorAreaProps {
  activeDataset: DatasetRecord | null;
  datasetTabs: DatasetRecord[];
  draft: DatasetDraft | null;
  error: string;
  fineTuneFiles: UploadedFile[];
  onChangeDraft: (draft: DatasetDraft | null) => void;
  onCloseDataset: (datasetId: string) => void;
  onCreateDataset: () => void;
  onOpenNextDataset: () => void;
  onSaveDataset: () => void;
  onSelectDataset: (datasetId: string | null) => void;
  saving: boolean;
}

function EditorArea({
  activeDataset,
  datasetTabs,
  draft,
  error,
  fineTuneFiles,
  onChangeDraft,
  onCloseDataset,
  onCreateDataset,
  onOpenNextDataset,
  onSaveDataset,
  onSelectDataset,
  saving,
}: EditorAreaProps) {
  return (
    <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
      <Box
        sx={{
          minHeight: 48,
          bgcolor: "#0b1220",
          borderBottom: "1px solid rgba(148, 163, 184, 0.12)",
          display: "flex",
          alignItems: "center",
        }}
      >
        {datasetTabs.length > 0 ? (
          <Tabs
            value={activeDataset?.id ?? false}
            onChange={(_: SyntheticEvent, value: string) => onSelectDataset(value)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              minHeight: 48,
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
        ) : (
          <Typography variant="body2" sx={{ px: 2, color: "#94a3b8" }}>
            Welcome
          </Typography>
        )}
      </Box>

      {error ? (
        <Box sx={{ p: 2, borderBottom: "1px solid rgba(148, 163, 184, 0.12)", bgcolor: "#111827" }}>
          <Alert severity="error">{error}</Alert>
        </Box>
      ) : null}

      <Box sx={{ flex: 1, bgcolor: "#0f172a", display: "flex" }}>
        {activeDataset && draft ? (
          <EditorPane
            dataset={activeDataset}
            draft={draft}
            fineTuneFiles={fineTuneFiles}
            onChangeDraft={onChangeDraft}
            onSaveDataset={onSaveDataset}
            saving={saving}
          />
        ) : (
          <WelcomeEditor onCreateDataset={onCreateDataset} onOpenNextDataset={onOpenNextDataset} />
        )}
      </Box>
    </Box>
  );
}

interface EditorPaneProps {
  dataset: DatasetRecord;
  draft: DatasetDraft;
  fineTuneFiles: UploadedFile[];
  onChangeDraft: (draft: DatasetDraft) => void;
  onSaveDataset: () => void;
  saving: boolean;
}

function EditorPane({
  dataset,
  draft,
  fineTuneFiles,
  onChangeDraft,
  onSaveDataset,
  saving,
}: EditorPaneProps) {
  return (
    <Box sx={{ flex: 1, display: "flex", flexDirection: { xs: "column", xl: "row" }, minWidth: 0 }}>
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <Box
          sx={{
            px: 2,
            py: 1,
            borderBottom: "1px solid rgba(148, 163, 184, 0.12)",
            color: "#94a3b8",
            bgcolor: "#111827",
          }}
        >
          <Typography variant="caption">
            datasets/{dataset.id}/dataset.yaml
          </Typography>
        </Box>
        <Box
          sx={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            p: 4,
          }}
        >
          <Stack spacing={2} sx={{ maxWidth: 540, textAlign: "center", color: "#e2e8f0" }}>
            <Typography variant="h5" fontWeight={700}>
              {draft.name}
            </Typography>
            <Typography variant="body1" sx={{ color: "#94a3b8", lineHeight: 1.8 }}>
              编辑器主体暂时留空。当前这一屏主要负责维护数据集 YAML 元数据，其中最关键的是
              `base_model`，供 LAwF 训练页自动识别并回填。
            </Typography>
          </Stack>
        </Box>
      </Box>

      <Box
        sx={{
          width: { xs: "100%", xl: 360 },
          borderLeft: { xl: "1px solid rgba(148, 163, 184, 0.12)" },
          borderTop: { xs: "1px solid rgba(148, 163, 184, 0.12)", xl: 0 },
          bgcolor: "#111827",
          p: 2,
        }}
      >
        <Stack spacing={2}>
          <Typography variant="subtitle1" sx={{ color: "#f8fafc", fontWeight: 700 }}>
            数据集元数据
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
            helperText="支持 Hugging Face 模型 ID，例如 Qwen/Qwen2.5-7B-Instruct，也支持本地模型目录路径。"
            fullWidth
            size="small"
            sx={darkFieldSx}
          />
          <FormControl fullWidth size="small" sx={darkFieldSx}>
            <InputLabel id="dataset-training-file-label">训练文件</InputLabel>
            <Select
              labelId="dataset-training-file-label"
              label="训练文件"
              value={draft.training_file_id}
              onChange={(event) =>
                onChangeDraft({ ...draft, training_file_id: event.target.value })
              }
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
          <Paper variant="outlined" sx={{ p: 2, bgcolor: "#0f172a", borderColor: "rgba(148, 163, 184, 0.12)" }}>
            <Typography variant="caption" sx={{ color: "#94a3b8" }}>
              当前 YAML 关键字段
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
training_file_id: ${draft.training_file_id || 'null'}`}
            </Box>
          </Paper>
        </Stack>
      </Box>
    </Box>
  );
}

interface WelcomeEditorProps {
  onCreateDataset: () => void;
  onOpenNextDataset: () => void;
}

function WelcomeEditor({ onCreateDataset, onOpenNextDataset }: WelcomeEditorProps) {
  return (
    <Box
      sx={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 4,
      }}
    >
      <Stack spacing={3} sx={{ maxWidth: 520, textAlign: "center", color: "#e2e8f0" }}>
        <Typography variant="h4" fontWeight={700}>
          Welcome to Data Workspace
        </Typography>
        <Typography variant="body1" sx={{ color: "#94a3b8", lineHeight: 1.8 }}>
          先新建一个数据集，或者打开已有数据集。每个数据集都会在后端生成一个
          `dataset.yaml`，用于保存强绑定的 `base_model` 和训练文件信息。
        </Typography>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} justifyContent="center">
          <Button variant="contained" size="large" startIcon={<AddRoundedIcon />} onClick={onCreateDataset}>
            新建数据集
          </Button>
          <Button
            variant="outlined"
            size="large"
            startIcon={<FolderOpenRoundedIcon />}
            onClick={onOpenNextDataset}
            sx={{
              color: "#e2e8f0",
              borderColor: "rgba(148, 163, 184, 0.28)",
            }}
          >
            打开数据集
          </Button>
        </Stack>
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
  "& .MuiInputLabel-root": { color: "#94a3b8" },
  "& .MuiOutlinedInput-root": {
    color: "#e2e8f0",
    "& fieldset": { borderColor: "rgba(148, 163, 184, 0.28)" },
    "&:hover fieldset": { borderColor: "rgba(148, 163, 184, 0.5)" },
    "&.Mui-focused fieldset": { borderColor: "#60a5fa" },
  },
  "& .MuiFormHelperText-root": { color: "#94a3b8" },
};

export default DataWorkspace;
