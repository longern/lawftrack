import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Skeleton,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import AutorenewRoundedIcon from "@mui/icons-material/AutorenewRounded";
import CancelRoundedIcon from "@mui/icons-material/CancelRounded";
import CloudUploadRoundedIcon from "@mui/icons-material/CloudUploadRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import type {
  ApiListResponse,
  DatasetRecord,
  DatasetTrainingFileExport,
  FineTuningJobCheckpoint,
  FineTuningJobEvent,
  FineTuningJob,
  FineTuningJobLogs,
  FineTuningMethodConfig,
  UploadedFile,
} from "../types/app";
import {
  FALLBACK_BASE_MODEL,
  type RemoteModelRecord,
  resolvePreferredBaseModel,
} from "../utils/modelSelection";

type TrainingMethodType = "sft" | "lawf";

interface TrainingFormState {
  model: string;
  methodType: TrainingMethodType;
  trainingFileId: string;
  validationFileId: string;
  suffix: string;
  seed: string;
  nEpochs: string;
  batchSize: string;
  learningRate: string;
  loggingSteps: string;
  loraRank: string;
  loraAlpha: string;
  loraDropout: string;
  tensorboard: boolean;
}

function buildDefaultForm(model: string): TrainingFormState {
  return {
    model,
    methodType: "sft",
    trainingFileId: "",
    validationFileId: "",
    suffix: "",
    seed: "",
    nEpochs: "3",
    batchSize: "1",
    learningRate: "0.00005",
    loggingSteps: "1",
    loraRank: "16",
    loraAlpha: "32",
    loraDropout: "0.05",
    tensorboard: false,
  };
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

function buildMethodConfig(form: TrainingFormState): FineTuningMethodConfig {
  if (form.methodType === "sft") {
    return {
      type: "sft",
      sft: {
        hyperparameters: {
          n_epochs: Number(form.nEpochs || 1),
        },
      },
    };
  }

  return {
    type: "lawf",
    lawf: {
      hyperparameters: {
        n_epochs: Number(form.nEpochs || 1),
        batch_size: Number(form.batchSize || 1),
        learning_rate: Number(form.learningRate || 5e-5),
        logging_steps: Number(form.loggingSteps || 1),
        lora_rank: Number(form.loraRank || 16),
        lora_alpha: Number(form.loraAlpha || 32),
        lora_dropout: Number(form.loraDropout || 0.05),
      },
    },
  };
}

function formatDateTime(timestamp?: number | null): string {
  if (!timestamp) {
    return "-";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp * 1000));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function TrainingSection() {
  const [preferredBaseModel, setPreferredBaseModel] = useState(FALLBACK_BASE_MODEL);
  const [form, setForm] = useState<TrainingFormState>(() => buildDefaultForm(FALLBACK_BASE_MODEL));
  const [datasets, setDatasets] = useState<DatasetRecord[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [jobs, setJobs] = useState<FineTuningJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [jobEvents, setJobEvents] = useState<FineTuningJobEvent[]>([]);
  const [jobCheckpoints, setJobCheckpoints] = useState<FineTuningJobCheckpoint[]>([]);
  const [jobLogs, setJobLogs] = useState<FineTuningJobLogs | null>(null);
  const [jobDetailTab, setJobDetailTab] = useState<"events" | "logs">("events");
  const [pageError, setPageError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingJobArtifacts, setLoadingJobArtifacts] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const preferredBaseModelRef = useRef(FALLBACK_BASE_MODEL);

  const fineTuneFiles = useMemo(
    () => files.filter((file) => file.purpose === "fine-tune"),
    [files],
  );
  const selectedDataset = useMemo(
    () => datasets.find((dataset) => dataset.id === selectedDatasetId) ?? null,
    [datasets, selectedDatasetId],
  );
  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? jobs[0] ?? null;

  useEffect(() => {
    void refreshAll();
    void loadPreferredBaseModel();
    const timer = window.setInterval(() => {
      void loadJobs(false);
      if (selectedJobId) {
        void loadJobArtifacts(selectedJobId, false);
      }
    }, 5000);
    return () => {
      window.clearInterval(timer);
    };
  }, [selectedJobId]);

  useEffect(() => {
    const previousPreferredBaseModel = preferredBaseModelRef.current;
    preferredBaseModelRef.current = preferredBaseModel;
    if (selectedDataset?.base_model?.trim()) {
      return;
    }
    setForm((current) => {
      const currentModel = current.model.trim();
      if (
        currentModel !== "" &&
        currentModel !== previousPreferredBaseModel
      ) {
        return current;
      }
      return {
        ...current,
        model: preferredBaseModel,
      };
    });
  }, [preferredBaseModel, selectedDataset]);

  useEffect(() => {
    if (!selectedJobId && jobs.length > 0) {
      setSelectedJobId(jobs[0].id);
      return;
    }
    if (selectedJobId && !jobs.some((job) => job.id === selectedJobId)) {
      setSelectedJobId(jobs[0]?.id ?? null);
    }
  }, [jobs, selectedJobId]);

  useEffect(() => {
    if (!selectedJobId) {
      setJobEvents([]);
      setJobCheckpoints([]);
      setJobLogs(null);
      return;
    }
    void loadJobArtifacts(selectedJobId);
  }, [selectedJobId]);

  async function loadFiles(showSpinner = true) {
    if (showSpinner) {
      setRefreshing(true);
    }
    try {
      const payload = await fetchJson<ApiListResponse<UploadedFile>>("/api/files");
      setFiles(payload.data);
      setPageError("");
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "加载文件失败");
    } finally {
      if (showSpinner) {
        setRefreshing(false);
      }
    }
  }

  async function loadDatasets(showSpinner = true) {
    if (showSpinner) {
      setRefreshing(true);
    }
    try {
      const payload = await fetchJson<ApiListResponse<DatasetRecord>>("/api/datasets");
      setDatasets(payload.data);
      setPageError("");
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "加载数据集失败");
    } finally {
      if (showSpinner) {
        setRefreshing(false);
      }
    }
  }

  async function loadJobs(showSpinner = true) {
    if (showSpinner) {
      setRefreshing(true);
    }
    try {
      const payload = await fetchJson<ApiListResponse<FineTuningJob>>("/api/fine_tuning/jobs");
      setJobs(payload.data);
      setPageError("");
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "加载训练任务失败");
    } finally {
      if (showSpinner) {
        setRefreshing(false);
      }
    }
  }

  async function loadPreferredBaseModel() {
    try {
      const payload = await fetchJson<ApiListResponse<RemoteModelRecord>>("/v1/models");
      const resolvedBaseModel = resolvePreferredBaseModel(payload.data);
      if (resolvedBaseModel) {
        setPreferredBaseModel(resolvedBaseModel);
      }
    } catch {
      // Keep the configured fallback when model discovery is unavailable.
    }
  }

  async function loadJobArtifacts(jobId: string, showSpinner = true) {
    if (showSpinner) {
      setLoadingJobArtifacts(true);
    }
    try {
      const [eventsPayload, checkpointsPayload, logsPayload] = await Promise.all([
        fetchJson<ApiListResponse<FineTuningJobEvent>>(`/api/fine_tuning/jobs/${jobId}/events`),
        fetchJson<ApiListResponse<FineTuningJobCheckpoint>>(`/api/fine_tuning/jobs/${jobId}/checkpoints`),
        fetchJson<FineTuningJobLogs>(`/api/fine_tuning/jobs/${jobId}/logs`),
      ]);
      setJobEvents(eventsPayload.data);
      setJobCheckpoints(checkpointsPayload.data);
      setJobLogs(logsPayload);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "加载训练日志失败");
    } finally {
      if (showSpinner) {
        setLoadingJobArtifacts(false);
      }
    }
  }

  async function refreshAll() {
    setRefreshing(true);
    try {
      const [datasetsPayload, filesPayload, jobsPayload] = await Promise.all([
        fetchJson<ApiListResponse<DatasetRecord>>("/api/datasets"),
        fetchJson<ApiListResponse<UploadedFile>>("/api/files"),
        fetchJson<ApiListResponse<FineTuningJob>>("/api/fine_tuning/jobs"),
      ]);
      setDatasets(datasetsPayload.data);
      setFiles(filesPayload.data);
      setJobs(jobsPayload.data);
      setPageError("");
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "刷新训练页面失败");
    } finally {
      setRefreshing(false);
    }
  }

  function updateForm<K extends keyof TrainingFormState>(key: K, value: TrainingFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleSelectDataset(datasetId: string) {
    setSelectedDatasetId(datasetId);
    const dataset = datasets.find((item) => item.id === datasetId);
    setForm((current) => ({
      ...current,
      model: dataset?.base_model?.trim() || preferredBaseModel,
    }));
  }

  async function handleUploadFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("purpose", "fine-tune");
      formData.append("file", file);
      const createdFile = await fetchJson<UploadedFile>("/api/files", {
        method: "POST",
        body: formData,
      });
      await Promise.all([loadFiles(false), loadDatasets(false)]);
      setForm((current) => ({
        ...current,
        trainingFileId: current.trainingFileId || createdFile.id,
      }));
      setPageError("");
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "上传文件失败");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  async function handleSubmitJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const method = buildMethodConfig(form);
    if (!selectedDatasetId && !form.trainingFileId) {
      setPageError("必须先选择训练集文件。");
      return;
    }

    setSubmitting(true);
    try {
      let trainingFileId = form.trainingFileId;
      if (selectedDatasetId) {
        const exported = await fetchJson<DatasetTrainingFileExport>(
          `/api/datasets/${selectedDatasetId}/training_file`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ method }),
          },
        );
        trainingFileId = exported.file.id;
        setForm((current) => ({ ...current, trainingFileId }));
        await loadFiles(false);
      }

      const payload = {
        model: form.model,
        training_file: trainingFileId,
        validation_file: form.validationFileId || undefined,
        suffix: form.suffix || undefined,
        seed: form.seed ? Number(form.seed) : undefined,
        metadata: selectedDatasetId ? { dataset_id: selectedDatasetId } : undefined,
        integrations: form.tensorboard ? [{ type: "tensorboard" }] : [],
        method,
      };
      const createdJob = await fetchJson<FineTuningJob>("/api/fine_tuning/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await loadJobs(false);
      setSelectedJobId(createdJob.id);
      setCreateDialogOpen(false);
      setPageError("");
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "创建训练任务失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancelJob(jobId: string) {
    try {
      await fetchJson<FineTuningJob>(`/api/fine_tuning/jobs/${jobId}/cancel`, {
        method: "POST",
      });
      await loadJobs(false);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "取消任务失败");
    }
  }

  return (
    <Grid container spacing={3}>
      {pageError ? (
        <Grid size={{ xs: 12 }}>
          <Alert severity="error" onClose={() => setPageError("")}>
            {pageError}
          </Alert>
        </Grid>
      ) : null}

      <Grid size={{ xs: 12 }}>
        <Card>
          <CardContent>
            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={2}
              alignItems={{ xs: "flex-start", md: "center" }}
              justifyContent="space-between"
            >
              <Box>
                <Typography variant="h6">训练控制台</Typography>
              </Box>
              <Stack direction="row" spacing={1.5}>
                <Button
                  size="small"
                  startIcon={<AutorenewRoundedIcon />}
                  onClick={() => void refreshAll()}
                  disabled={refreshing}
                >
                  刷新
                </Button>
                <Button
                  variant="contained"
                  startIcon={<AddRoundedIcon />}
                  onClick={() => setCreateDialogOpen(true)}
                >
                  创建训练任务
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      </Grid>

      <Grid size={{ xs: 12, xl: 5 }}>
        <Card sx={{ height: "100%" }}>
          <CardContent>
            <Stack spacing={2.5}>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="h6">训练文件库</Typography>
                </Box>
                <Button
                  size="small"
                  startIcon={<CloudUploadRoundedIcon />}
                  onClick={() => uploadInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? "上传中..." : "上传"}
                </Button>
                <input
                  ref={uploadInputRef}
                  hidden
                  type="file"
                  onChange={handleUploadFile}
                />
              </Stack>

              {fineTuneFiles.length === 0 ? (
                <Paper
                  variant="outlined"
                  sx={{ p: 3, textAlign: "center", color: "text.secondary" }}
                >
                  还没有训练文件。先上传一个 JSON/JSONL/CSV/Parquet 文件。
                </Paper>
              ) : (
                <Stack spacing={1.5}>
                  {fineTuneFiles.map((file) => (
                    <Paper
                      key={file.id}
                      variant="outlined"
                      sx={{ p: 2, borderRadius: 3 }}
                    >
                      <Stack spacing={1.5}>
                        <Stack direction="row" justifyContent="space-between" spacing={2}>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="subtitle2" fontWeight={700} noWrap>
                              {file.filename}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {file.id}
                            </Typography>
                          </Box>
                          <Chip size="small" label={file.status} />
                        </Stack>
                        <Stack direction="row" spacing={1.5} flexWrap="wrap">
                          <Typography variant="caption" color="text.secondary">
                            {formatBytes(file.bytes)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {formatDateTime(file.created_at)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {file.purpose}
                          </Typography>
                        </Stack>
                        <Stack direction="row" spacing={1}>
                          <Button
                            size="small"
                            variant={form.trainingFileId === file.id ? "contained" : "outlined"}
                            onClick={() => updateForm("trainingFileId", file.id)}
                          >
                            作为训练集
                          </Button>
                          <Button
                            size="small"
                            variant={form.validationFileId === file.id ? "contained" : "outlined"}
                            onClick={() => updateForm("validationFileId", file.id)}
                          >
                            作为验证集
                          </Button>
                        </Stack>
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              )}
            </Stack>
          </CardContent>
        </Card>
      </Grid>

      <Grid size={{ xs: 12, xl: 7 }}>
        <Card sx={{ height: "100%" }}>
          <CardContent>
            <Stack spacing={2.5}>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="h6">训练任务队列</Typography>
                </Box>
                <Chip
                  size="small"
                  label={`${jobs.length} 个任务`}
                  color="primary"
                  variant="outlined"
                />
              </Stack>

              {jobs.length === 0 ? (
                <Paper
                  variant="outlined"
                  sx={{ p: 3, textAlign: "center", color: "text.secondary" }}
                >
                  还没有训练任务。点击右上角“创建训练任务”开始。
                </Paper>
              ) : (
                <Stack spacing={1.5}>
                  {jobs.map((job) => (
                    <Paper
                      key={job.id}
                      variant="outlined"
                      onClick={() => setSelectedJobId(job.id)}
                      sx={{
                        p: 2,
                        borderRadius: 3,
                        cursor: "pointer",
                        borderColor:
                          selectedJob?.id === job.id
                            ? "primary.main"
                            : "rgba(15, 23, 42, 0.12)",
                      }}
                    >
                      <Stack spacing={1.25}>
                        <Stack direction="row" justifyContent="space-between" spacing={2}>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="subtitle2" fontWeight={700} noWrap>
                              {job.model}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {job.id}
                            </Typography>
                          </Box>
                          <Chip
                            size="small"
                            color={
                              job.status === "running"
                                ? "info"
                                : job.status === "succeeded"
                                  ? "success"
                                  : job.status === "failed"
                                    ? "error"
                                    : "default"
                            }
                            label={job.status}
                          />
                        </Stack>
                        <Stack direction="row" spacing={1.5} flexWrap="wrap">
                          <Typography variant="caption" color="text.secondary">
                            {job.method?.type ?? "sft"}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {formatDateTime(job.created_at)}
                          </Typography>
                          {job.fine_tuned_model ? (
                            <Typography variant="caption" color="success.main">
                              {job.fine_tuned_model}
                            </Typography>
                          ) : null}
                        </Stack>
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              )}
            </Stack>
          </CardContent>
        </Card>
      </Grid>

      <Grid size={{ xs: 12 }}>
        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography variant="h6">任务详情</Typography>
                {selectedJob?.status === "running" ? (
                  <Button
                    color="error"
                    variant="outlined"
                    startIcon={<CancelRoundedIcon />}
                    onClick={() => void handleCancelJob(selectedJob.id)}
                  >
                    取消任务
                  </Button>
                ) : null}
              </Stack>

              {!selectedJob ? (
                <Paper variant="outlined" sx={{ p: 3, textAlign: "center", color: "text.secondary" }}>
                  选择一个训练任务查看详情。
                </Paper>
              ) : (
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 6, xl: 3 }}>
                    <DetailCard title="基础信息">
                      <DetailRow label="Job ID" value={selectedJob.id} />
                      <DetailRow label="状态" value={selectedJob.status} />
                      <DetailRow label="方法" value={selectedJob.method?.type ?? "-"} />
                      <DetailRow label="模型" value={selectedJob.model} />
                    </DetailCard>
                  </Grid>
                  <Grid size={{ xs: 12, md: 6, xl: 3 }}>
                    <DetailCard title="文件引用">
                      <DetailRow label="训练集" value={selectedJob.training_file} />
                      <DetailRow label="验证集" value={selectedJob.validation_file ?? "-"} />
                      <DetailRow label="Suffix" value={selectedJob.suffix ?? "-"} />
                      <DetailRow label="Seed" value={selectedJob.seed?.toString() ?? "-"} />
                    </DetailCard>
                  </Grid>
                  <Grid size={{ xs: 12, md: 6, xl: 3 }}>
                    <DetailCard title="运行状态">
                      <DetailRow label="创建时间" value={formatDateTime(selectedJob.created_at)} />
                      <DetailRow label="结束时间" value={formatDateTime(selectedJob.finished_at)} />
                      <DetailRow
                        label="PID"
                        value={selectedJob.process?.pid ? String(selectedJob.process.pid) : "-"}
                      />
                      <DetailRow
                        label="Exit Code"
                        value={
                          selectedJob.process?.exit_code !== undefined &&
                          selectedJob.process?.exit_code !== null
                            ? String(selectedJob.process.exit_code)
                            : "-"
                        }
                      />
                    </DetailCard>
                  </Grid>
                  <Grid size={{ xs: 12, md: 6, xl: 3 }}>
                    <DetailCard title="产物与错误">
                      <DetailRow label="微调模型" value={selectedJob.fine_tuned_model ?? "-"} />
                      <DetailRow
                        label="Adapter"
                        value={selectedJob.lora_adapter?.status ?? "-"}
                      />
                      <DetailRow
                        label="Adapter Path"
                        value={selectedJob.lora_adapter?.path ?? "-"}
                      />
                      <DetailRow
                        label="错误"
                        value={selectedJob.error?.message ?? selectedJob.lora_adapter?.error?.message ?? "-"}
                      />
                    </DetailCard>
                  </Grid>
                  <Grid size={{ xs: 12, xl: 12 }}>
                    <DetailCard title="训练曲线">
                      {loadingJobArtifacts ? (
                        <Skeleton variant="rounded" height={220} />
                      ) : (
                        <LossChart checkpoints={jobCheckpoints} events={jobEvents} />
                      )}
                    </DetailCard>
                  </Grid>
                  <Grid size={{ xs: 12, xl: 12 }}>
                    <DetailCard title="日志与事件">
                      <Tabs
                        value={jobDetailTab}
                        onChange={(_, value) => setJobDetailTab(value)}
                        sx={{ minHeight: 36 }}
                      >
                        <Tab value="events" label="事件" sx={{ minHeight: 36 }} />
                        <Tab value="logs" label="原始日志" sx={{ minHeight: 36 }} />
                      </Tabs>
                      {loadingJobArtifacts ? (
                        <Stack spacing={1.5} sx={{ mt: 2 }}>
                          <Skeleton variant="rounded" height={44} />
                          <Skeleton variant="rounded" height={44} />
                          <Skeleton variant="rounded" height={44} />
                        </Stack>
                      ) : jobDetailTab === "events" ? (
                        <EventStream events={jobEvents} />
                      ) : (
                        <RawLogsPanel logs={jobLogs} />
                      )}
                    </DetailCard>
                  </Grid>
                </Grid>
              )}
            </Stack>
          </CardContent>
        </Card>
      </Grid>

      <CreateTrainingJobDialog
        datasets={datasets}
        fineTuneFiles={fineTuneFiles}
        form={form}
        preferredBaseModel={preferredBaseModel}
        onChangeForm={updateForm}
        onSelectDataset={handleSelectDataset}
        onSubmit={handleSubmitJob}
        open={createDialogOpen}
        pageError={pageError}
        selectedDataset={selectedDataset}
        selectedDatasetId={selectedDatasetId}
        submitting={submitting}
        onClearError={() => setPageError("")}
        onClose={() => setCreateDialogOpen(false)}
      />
    </Grid>
  );
}

function EventStream({ events }: { events: FineTuningJobEvent[] }) {
  if (events.length === 0) {
    return (
      <Paper variant="outlined" sx={{ mt: 2, p: 3, textAlign: "center", color: "text.secondary" }}>
        暂无事件。
      </Paper>
    );
  }

  return (
    <Stack spacing={1.25} sx={{ mt: 2, maxHeight: 360, overflowY: "auto" }}>
      {events.map((event) => {
        const metrics = event.data?.type === "metrics" ? event.data.metrics : null;
        return (
          <Paper
            key={event.id}
            variant="outlined"
            sx={{
              p: 1.5,
              borderColor:
                event.level === "error"
                  ? "error.light"
                  : event.data?.type === "metrics"
                    ? "primary.light"
                    : "divider",
            }}
          >
            <Stack spacing={0.75}>
              <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip size="small" label={event.level} color={event.level === "error" ? "error" : event.data?.type === "metrics" ? "primary" : "default"} />
                  {event.data?.stream ? (
                    <Chip size="small" label={event.data.stream} variant="outlined" />
                  ) : null}
                  {event.data?.step ? (
                    <Chip size="small" label={`step ${event.data.step}`} variant="outlined" />
                  ) : null}
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  {formatDateTime(event.created_at)}
                </Typography>
              </Stack>
              <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {event.message}
              </Typography>
              {metrics ? (
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {Object.entries(metrics).map(([key, value]) => (
                    <Chip key={key} size="small" label={`${key}: ${formatMetricValue(value)}`} variant="outlined" />
                  ))}
                </Stack>
              ) : null}
            </Stack>
          </Paper>
        );
      })}
    </Stack>
  );
}

function RawLogsPanel({ logs }: { logs: FineTuningJobLogs | null }) {
  const stdout = logs?.stdout.trim() || "";
  const stderr = logs?.stderr.trim() || "";
  if (!stdout && !stderr) {
    return (
      <Paper variant="outlined" sx={{ mt: 2, p: 3, textAlign: "center", color: "text.secondary" }}>
        暂无原始日志。
      </Paper>
    );
  }

  return (
    <Stack spacing={2} sx={{ mt: 2 }}>
      <LogBlock title="stdout" content={stdout} />
      <LogBlock title="stderr" content={stderr} tone="error" />
    </Stack>
  );
}

function LogBlock({
  title,
  content,
  tone = "default",
}: {
  title: string;
  content: string;
  tone?: "default" | "error";
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        overflow: "hidden",
        borderColor: tone === "error" ? "error.light" : "divider",
      }}
    >
      <Box
        sx={{
          px: 1.5,
          py: 1,
          borderBottom: "1px solid",
          borderColor: "divider",
          bgcolor: tone === "error" ? "error.50" : "action.hover",
        }}
      >
        <Typography variant="subtitle2">{title}</Typography>
      </Box>
      <Box
        component="pre"
        sx={{
          m: 0,
          p: 1.5,
          maxHeight: 240,
          overflow: "auto",
          fontSize: 12,
          lineHeight: 1.6,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          bgcolor: "background.paper",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {content || "暂无内容"}
      </Box>
    </Paper>
  );
}

function LossChart({
  checkpoints,
  events,
}: {
  checkpoints: FineTuningJobCheckpoint[];
  events: FineTuningJobEvent[];
}) {
  const points = useMemo(() => {
    const checkpointPoints = checkpoints
      .map((checkpoint) => {
        const loss = checkpoint.metrics.train_loss ?? checkpoint.metrics.loss;
        if (typeof loss !== "number") {
          return null;
        }
        return { step: checkpoint.step_number, loss };
      })
      .filter((point): point is { step: number; loss: number } => Boolean(point));
    if (checkpointPoints.length > 0) {
      return checkpointPoints;
    }
    return events
      .map((event, index) => {
        const metrics = event.data?.metrics;
        const loss = metrics?.train_loss ?? metrics?.loss;
        if (typeof loss !== "number") {
          return null;
        }
        return {
          step: Number(event.data?.step ?? index + 1),
          loss,
        };
      })
      .filter((point): point is { step: number; loss: number } => Boolean(point));
  }, [checkpoints, events]);

  if (points.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 3, textAlign: "center", color: "text.secondary" }}>
        暂无可绘制的损失数据。
      </Paper>
    );
  }

  const width = 720;
  const height = 220;
  const padding = 24;
  const minLoss = Math.min(...points.map((point) => point.loss));
  const maxLoss = Math.max(...points.map((point) => point.loss));
  const lossSpan = maxLoss - minLoss || 1;
  const stepSpan = Math.max(points.length - 1, 1);
  const polyline = points
    .map((point, index) => {
      const x = padding + ((width - padding * 2) * index) / stepSpan;
      const y =
        height - padding - ((point.loss - minLoss) / lossSpan) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <Stack spacing={1.5}>
      <Box sx={{ width: "100%", overflowX: "auto" }}>
        <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="训练损失曲线">
          <rect x="0" y="0" width={width} height={height} fill="transparent" />
          <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="currentColor" opacity="0.18" />
          <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="currentColor" opacity="0.18" />
          <polyline fill="none" stroke="currentColor" strokeWidth="3" points={polyline} />
          {points.map((point, index) => {
            const x = padding + ((width - padding * 2) * index) / stepSpan;
            const y =
              height - padding - ((point.loss - minLoss) / lossSpan) * (height - padding * 2);
            return <circle key={`${point.step}-${point.loss}`} cx={x} cy={y} r="3.5" fill="currentColor" />;
          })}
        </svg>
      </Box>
      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
        <Chip size="small" label={`起始 loss ${formatMetricValue(points[0].loss)}`} variant="outlined" />
        <Chip size="small" label={`最新 loss ${formatMetricValue(points[points.length - 1].loss)}`} color="primary" variant="outlined" />
        <Chip size="small" label={`最低 loss ${formatMetricValue(minLoss)}`} color="success" variant="outlined" />
      </Stack>
    </Stack>
  );
}

function formatMetricValue(value: number) {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(4);
}

interface CreateTrainingJobDialogProps {
  datasets: DatasetRecord[];
  fineTuneFiles: UploadedFile[];
  form: TrainingFormState;
  preferredBaseModel: string;
  onChangeForm: <K extends keyof TrainingFormState>(
    key: K,
    value: TrainingFormState[K],
  ) => void;
  onSelectDataset: (datasetId: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  open: boolean;
  pageError: string;
  selectedDataset: DatasetRecord | null;
  selectedDatasetId: string;
  submitting: boolean;
  onClearError: () => void;
  onClose: () => void;
}

function CreateTrainingJobDialog({
  datasets,
  fineTuneFiles,
  form,
  preferredBaseModel,
  onChangeForm,
  onSelectDataset,
  onSubmit,
  open,
  pageError,
  selectedDataset,
  selectedDatasetId,
  submitting,
  onClearError,
  onClose,
}: CreateTrainingJobDialogProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>创建训练任务</DialogTitle>
      <Box component="form" onSubmit={onSubmit}>
        <DialogContent dividers>
          <Stack spacing={2.5}>
            {pageError ? (
              <Alert severity="error" onClose={onClearError}>
                {pageError}
              </Alert>
            ) : null}

            <TextField
              label="Base Model"
              value={form.model}
              onChange={(event) => onChangeForm("model", event.target.value)}
              placeholder={`${preferredBaseModel} 或 /path/to/model`}
              required
              fullWidth
            />

            <FormControl fullWidth>
              <InputLabel id="dialog-dataset-select-label">数据集</InputLabel>
              <Select
                labelId="dialog-dataset-select-label"
                label="数据集"
                value={selectedDatasetId}
                onChange={(event) => onSelectDataset(event.target.value)}
              >
                <MenuItem value="">不绑定数据集元数据</MenuItem>
                {datasets.map((dataset) => (
                  <MenuItem key={dataset.id} value={dataset.id}>
                    {dataset.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <FormControl fullWidth>
                  <InputLabel id="training-method-label">训练方法</InputLabel>
                  <Select
                    labelId="training-method-label"
                    label="训练方法"
                    value={form.methodType}
                    onChange={(event) =>
                      onChangeForm("methodType", event.target.value as TrainingMethodType)
                    }
                  >
                    <MenuItem value="sft">SFT</MenuItem>
                    <MenuItem value="lawf">LAwF</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                {selectedDataset ? (
                  <TextField
                    label="训练集文件"
                    value={`${selectedDataset.name} · 创建时生成`}
                    fullWidth
                    disabled
                  />
                ) : (
                  <FormControl fullWidth required>
                    <InputLabel id="training-file-label">训练集文件</InputLabel>
                    <Select
                      labelId="training-file-label"
                      label="训练集文件"
                      value={form.trainingFileId}
                      onChange={(event) => onChangeForm("trainingFileId", event.target.value)}
                    >
                      {fineTuneFiles.map((file) => (
                        <MenuItem key={file.id} value={file.id}>
                          {file.filename}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
              </Grid>
            </Grid>

            <FormControl fullWidth>
              <InputLabel id="validation-file-label">验证集文件</InputLabel>
              <Select
                labelId="validation-file-label"
                label="验证集文件"
                value={form.validationFileId}
                onChange={(event) => onChangeForm("validationFileId", event.target.value)}
              >
                <MenuItem value="">不使用</MenuItem>
                {fineTuneFiles.map((file) => (
                  <MenuItem key={file.id} value={file.id}>
                    {file.filename}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Accordion
              disableGutters
              elevation={0}
              expanded={advancedOpen}
              onChange={(_, expanded) => setAdvancedOpen(expanded)}
              sx={{
                border: "1px solid rgba(15, 23, 42, 0.12)",
                borderRadius: 2,
                "&:before": { display: "none" },
              }}
            >
              <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
                <Typography variant="subtitle2" fontWeight={700}>
                  高级设置
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={2.5}>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        label="Epochs"
                        type="number"
                        value={form.nEpochs}
                        onChange={(event) => onChangeForm("nEpochs", event.target.value)}
                        inputProps={{ min: 1, step: 1 }}
                        fullWidth
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        label="Seed"
                        type="number"
                        value={form.seed}
                        onChange={(event) => onChangeForm("seed", event.target.value)}
                        fullWidth
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        label="Suffix"
                        value={form.suffix}
                        onChange={(event) => onChangeForm("suffix", event.target.value)}
                        fullWidth
                      />
                    </Grid>
                  </Grid>

                  {form.methodType === "lawf" ? (
                    <Grid container spacing={2}>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="Batch Size"
                          type="number"
                          value={form.batchSize}
                          onChange={(event) => onChangeForm("batchSize", event.target.value)}
                          fullWidth
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="Learning Rate"
                          type="number"
                          value={form.learningRate}
                          onChange={(event) => onChangeForm("learningRate", event.target.value)}
                          inputProps={{ step: "0.00001" }}
                          fullWidth
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="Logging Steps"
                          type="number"
                          value={form.loggingSteps}
                          onChange={(event) => onChangeForm("loggingSteps", event.target.value)}
                          fullWidth
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="LoRA Rank"
                          type="number"
                          value={form.loraRank}
                          onChange={(event) => onChangeForm("loraRank", event.target.value)}
                          fullWidth
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="LoRA Alpha"
                          type="number"
                          value={form.loraAlpha}
                          onChange={(event) => onChangeForm("loraAlpha", event.target.value)}
                          fullWidth
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="LoRA Dropout"
                          type="number"
                          value={form.loraDropout}
                          onChange={(event) => onChangeForm("loraDropout", event.target.value)}
                          inputProps={{ step: "0.01" }}
                          fullWidth
                        />
                      </Grid>
                    </Grid>
                  ) : null}

                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={form.tensorboard}
                        onChange={(event) => onChangeForm("tensorboard", event.target.checked)}
                      />
                    }
                    label="启用 TensorBoard 集成"
                  />
                </Stack>
              </AccordionDetails>
            </Accordion>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>取消</Button>
          <Button
            type="submit"
            variant="contained"
            startIcon={<AddRoundedIcon />}
            disabled={submitting}
          >
            {submitting ? "提交中..." : "创建训练任务"}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

interface DetailCardProps {
  title: string;
  children: ReactNode;
}

function DetailCard({ title, children }: DetailCardProps) {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, height: "100%" }}>
      <Typography variant="subtitle2" fontWeight={700}>
        {title}
      </Typography>
      <Stack spacing={1.5} sx={{ mt: 2 }}>
        {children}
      </Stack>
    </Paper>
  );
}

interface DetailRowProps {
  label: string;
  value: string;
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ mt: 0.5, wordBreak: "break-word" }}>
        {value}
      </Typography>
    </Box>
  );
}

export default TrainingSection;
