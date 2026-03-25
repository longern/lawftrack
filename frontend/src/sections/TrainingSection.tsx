import {
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
  Link,
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
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import AutorenewRoundedIcon from "@mui/icons-material/AutorenewRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import CancelRoundedIcon from "@mui/icons-material/CancelRounded";
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
} from "../types/app";
import {
  FALLBACK_BASE_MODEL,
  type RemoteModelRecord,
  resolvePreferredBaseModel,
} from "../utils/modelSelection";
import { useI18n } from "../i18n";

type TrainingMethodType = "sft" | "lawf";
type LossChartPoint = {
  step: number;
  trainLoss: number | null;
  validLoss: number | null;
};

const DEFAULT_SFT_N_EPOCHS = "3";
const DEFAULT_LAWF_N_EPOCHS = "32";

interface TrainingFormState {
  model: string;
  methodType: TrainingMethodType;
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
    methodType: "lawf",
    suffix: "",
    seed: "",
    nEpochs: DEFAULT_LAWF_N_EPOCHS,
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
          n_epochs: Number(form.nEpochs || DEFAULT_SFT_N_EPOCHS),
        },
      },
    };
  }

  return {
    type: "lawf",
    lawf: {
      hyperparameters: {
        n_epochs: Number(form.nEpochs || DEFAULT_LAWF_N_EPOCHS),
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
  return new Intl.DateTimeFormat(document.documentElement.lang || undefined, {
    hour12: false,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp * 1000));
}

function TrainingSection() {
  const { t, formatTaskCount } = useI18n();
  const [preferredBaseModel, setPreferredBaseModel] =
    useState(FALLBACK_BASE_MODEL);
  const [form, setForm] = useState<TrainingFormState>(() =>
    buildDefaultForm(FALLBACK_BASE_MODEL),
  );
  const [datasets, setDatasets] = useState<DatasetRecord[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState("");
  const [jobs, setJobs] = useState<FineTuningJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [jobEvents, setJobEvents] = useState<FineTuningJobEvent[]>([]);
  const [jobCheckpoints, setJobCheckpoints] = useState<
    FineTuningJobCheckpoint[]
  >([]);
  const [jobLogs, setJobLogs] = useState<FineTuningJobLogs | null>(null);
  const [jobDetailTab, setJobDetailTab] = useState<"events" | "logs">("events");
  const [pageError, setPageError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingJobArtifacts, setLoadingJobArtifacts] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const preferredBaseModelRef = useRef(FALLBACK_BASE_MODEL);
  const selectedDataset = useMemo(
    () => datasets.find((dataset) => dataset.id === selectedDatasetId) ?? null,
    [datasets, selectedDatasetId],
  );
  const selectedJob =
    jobs.find((job) => job.id === selectedJobId) ?? null;

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
      if (currentModel !== "" && currentModel !== previousPreferredBaseModel) {
        return current;
      }
      return {
        ...current,
        model: preferredBaseModel,
      };
    });
  }, [preferredBaseModel, selectedDataset]);

  useEffect(() => {
    if (selectedJobId && !jobs.some((job) => job.id === selectedJobId)) {
      setSelectedJobId(null);
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

  useEffect(() => {
    if (createDialogOpen && !selectedDatasetId && datasets.length > 0) {
      handleSelectDataset(datasets[0].id);
    }
  }, [createDialogOpen, datasets, selectedDatasetId]);

  useEffect(() => {
    if (!selectedDatasetId || datasets.some((dataset) => dataset.id === selectedDatasetId)) {
      return;
    }
    setSelectedDatasetId("");
    setForm((current) => ({
      ...current,
      model: preferredBaseModel,
    }));
  }, [datasets, preferredBaseModel, selectedDatasetId]);

  async function loadJobs(showSpinner = true) {
    if (showSpinner) {
      setRefreshing(true);
    }
    try {
      const payload = await fetchJson<ApiListResponse<FineTuningJob>>(
        "/api/fine_tuning/jobs",
      );
      setJobs(payload.data);
      setPageError("");
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : t("Failed to load training jobs"),
      );
    } finally {
      if (showSpinner) {
        setRefreshing(false);
      }
    }
  }

  async function loadPreferredBaseModel() {
    try {
      const payload =
        await fetchJson<ApiListResponse<RemoteModelRecord>>("/v1/models");
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
      const [eventsPayload, checkpointsPayload, logsPayload] =
        await Promise.all([
          fetchJson<ApiListResponse<FineTuningJobEvent>>(
            `/api/fine_tuning/jobs/${jobId}/events`,
          ),
          fetchJson<ApiListResponse<FineTuningJobCheckpoint>>(
            `/api/fine_tuning/jobs/${jobId}/checkpoints`,
          ),
          fetchJson<FineTuningJobLogs>(`/api/fine_tuning/jobs/${jobId}/logs`),
        ]);
      setJobEvents(eventsPayload.data);
      setJobCheckpoints(checkpointsPayload.data);
      setJobLogs(logsPayload);
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : t("Failed to load training logs"),
      );
    } finally {
      if (showSpinner) {
        setLoadingJobArtifacts(false);
      }
    }
  }

  async function refreshAll() {
    setRefreshing(true);
    try {
      const [datasetsPayload, jobsPayload] = await Promise.all([
        fetchJson<ApiListResponse<DatasetRecord>>("/api/datasets"),
        fetchJson<ApiListResponse<FineTuningJob>>("/api/fine_tuning/jobs"),
      ]);
      setDatasets(datasetsPayload.data);
      setJobs(jobsPayload.data);
      setPageError("");
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : t("Failed to refresh training page"),
      );
    } finally {
      setRefreshing(false);
    }
  }

  function updateForm<K extends keyof TrainingFormState>(
    key: K,
    value: TrainingFormState[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateMethodType(nextMethodType: TrainingMethodType) {
    setForm((current) => {
      if (current.methodType === nextMethodType) {
        return current;
      }
      const previousDefaultEpochs =
        current.methodType === "lawf"
          ? DEFAULT_LAWF_N_EPOCHS
          : DEFAULT_SFT_N_EPOCHS;
      const nextDefaultEpochs =
        nextMethodType === "lawf"
          ? DEFAULT_LAWF_N_EPOCHS
          : DEFAULT_SFT_N_EPOCHS;
      const shouldResetEpochs =
        !current.nEpochs.trim() || current.nEpochs === previousDefaultEpochs;
      return {
        ...current,
        methodType: nextMethodType,
        nEpochs: shouldResetEpochs ? nextDefaultEpochs : current.nEpochs,
      };
    });
  }

  function handleSelectDataset(datasetId: string) {
    setSelectedDatasetId(datasetId);
    const dataset = datasets.find((item) => item.id === datasetId);
    setForm((current) => ({
      ...current,
      model: dataset?.base_model?.trim() || preferredBaseModel,
    }));
  }

  async function handleSubmitJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const method = buildMethodConfig(form);
    if (!selectedDatasetId) {
      setPageError(t("Select a dataset first."));
      return;
    }

    setSubmitting(true);
    try {
      const exported = await fetchJson<DatasetTrainingFileExport>(
        `/api/datasets/${selectedDatasetId}/training_file`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ method }),
        },
      );

      const payload = {
        model: form.model,
        training_file: exported.file.id,
        suffix: form.suffix || undefined,
        seed: form.seed ? Number(form.seed) : undefined,
        metadata: { dataset_id: selectedDatasetId },
        integrations: form.tensorboard ? [{ type: "tensorboard" }] : [],
        method,
      };
      const createdJob = await fetchJson<FineTuningJob>(
        "/api/fine_tuning/jobs",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      await loadJobs(false);
      setSelectedJobId(createdJob.id);
      setCreateDialogOpen(false);
      setPageError("");
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : t("Failed to create training job"),
      );
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
      setPageError(
        error instanceof Error ? error.message : t("Failed to cancel job"),
      );
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

      {selectedJob ? (
        <Grid size={{ xs: 12 }}>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Stack
                  direction={{ xs: "column", md: "row" }}
                  spacing={2}
                  alignItems={{ xs: "flex-start", md: "center" }}
                  justifyContent="space-between"
                >
                  <Typography variant="h6">
                    {t("Training job details")}
                  </Typography>
                  <Stack direction="row" spacing={1.5}>
                    <Button
                      size="small"
                      startIcon={<ArrowBackRoundedIcon />}
                      onClick={() => setSelectedJobId(null)}
                    >
                      {t("Back to training queue")}
                    </Button>
                    <Button
                      size="small"
                      startIcon={<AutorenewRoundedIcon />}
                      onClick={() => void refreshAll()}
                      disabled={refreshing}
                    >
                      {t("Refresh")}
                    </Button>
                    {selectedJob.status === "running" ? (
                      <Button
                        size="small"
                        color="error"
                        variant="outlined"
                        startIcon={<CancelRoundedIcon />}
                        onClick={() => void handleCancelJob(selectedJob.id)}
                      >
                        {t("Cancel job")}
                      </Button>
                    ) : null}
                  </Stack>
                </Stack>

                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 6, xl: 3 }}>
                    <DetailCard title={t("Basic info")}>
                      <DetailRow label="Job ID" value={selectedJob.id} />
                      <DetailRow
                        label={t("Status")}
                        value={selectedJob.status}
                      />
                      <DetailRow
                        label={t("Method")}
                        value={selectedJob.method?.type ?? "-"}
                      />
                      <DetailRow label={t("Model")} value={selectedJob.model} />
                    </DetailCard>
                  </Grid>
                  <Grid size={{ xs: 12, md: 6, xl: 3 }}>
                    <DetailCard title={t("File references")}>
                      <DetailRow
                        label={t("Training file")}
                        value={selectedJob.training_file}
                      />
                      <DetailRow
                        label={t("Validation file")}
                        value={selectedJob.validation_file ?? "-"}
                      />
                      <DetailRow label="Suffix" value={selectedJob.suffix ?? "-"} />
                      <DetailRow
                        label="Seed"
                        value={selectedJob.seed?.toString() ?? "-"}
                      />
                    </DetailCard>
                  </Grid>
                  <Grid size={{ xs: 12, md: 6, xl: 3 }}>
                    <DetailCard title={t("Runtime status")}>
                      <DetailRow
                        label={t("Created at")}
                        value={formatDateTime(selectedJob.created_at)}
                      />
                      <DetailRow
                        label={t("End time")}
                        value={formatDateTime(selectedJob.finished_at)}
                      />
                      <DetailRow
                        label="PID"
                        value={
                          selectedJob.process?.pid
                            ? String(selectedJob.process.pid)
                            : "-"
                        }
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
                    <DetailCard title={t("Outputs and errors")}>
                      <DetailRow
                        label={t("Fine-tuned model")}
                        value={selectedJob.fine_tuned_model ?? "-"}
                      />
                      <DetailRow
                        label="Adapter"
                        value={selectedJob.lora_adapter?.status ?? "-"}
                      />
                      <DetailRow
                        label="Adapter Path"
                        value={selectedJob.lora_adapter?.path ?? "-"}
                      />
                      <DetailRow
                        label={t("Error")}
                        value={
                          selectedJob.error?.message ??
                          selectedJob.lora_adapter?.error?.message ??
                          "-"
                        }
                      />
                    </DetailCard>
                  </Grid>
                  <Grid size={{ xs: 12, xl: 12 }}>
                    <DetailCard title={t("Training curve")}>
                      {loadingJobArtifacts ? (
                        <Skeleton variant="rounded" height={220} />
                      ) : (
                        <LossChart
                          checkpoints={jobCheckpoints}
                          events={jobEvents}
                        />
                      )}
                    </DetailCard>
                  </Grid>
                  <Grid size={{ xs: 12, xl: 12 }}>
                    <DetailCard title={t("Logs and events")}>
                      <Tabs
                        value={jobDetailTab}
                        onChange={(_, value) => setJobDetailTab(value)}
                        sx={{ minHeight: 36 }}
                      >
                        <Tab
                          value="events"
                          label={t("Events")}
                          sx={{ minHeight: 36 }}
                        />
                        <Tab
                          value="logs"
                          label={t("Raw logs")}
                          sx={{ minHeight: 36 }}
                        />
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
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      ) : (
        <>
          <Grid size={{ xs: 12 }}>
            <Card>
              <CardContent>
                <Stack
                  direction={{ xs: "column", md: "row" }}
                  spacing={2}
                  alignItems={{ xs: "flex-start", md: "center" }}
                  justifyContent="space-between"
                >
                  <Typography variant="h6">{t("Training console")}</Typography>
                  <Stack direction="row" spacing={1.5}>
                    <Button
                      size="small"
                      startIcon={<AutorenewRoundedIcon />}
                      onClick={() => void refreshAll()}
                      disabled={refreshing}
                    >
                      {t("Refresh")}
                    </Button>
                    <Button
                      variant="contained"
                      startIcon={<AddRoundedIcon />}
                      onClick={() => setCreateDialogOpen(true)}
                    >
                      {t("Create training job")}
                    </Button>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12 }}>
            <Card>
              <CardContent>
                <Stack spacing={2.5}>
                  <Stack
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                  >
                    <Box>
                      <Typography variant="h6">{t("Training queue")}</Typography>
                    </Box>
                    <Chip
                      size="small"
                      label={formatTaskCount(jobs.length)}
                      color="primary"
                      variant="outlined"
                    />
                  </Stack>

                  {jobs.length === 0 ? (
                    <Paper
                      variant="outlined"
                      sx={{ p: 3, textAlign: "center", color: "text.secondary" }}
                    >
                      {t(
                        'No training jobs yet. Click "Create training job" to get started.',
                      )}
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
                            transition: "border-color 120ms ease, box-shadow 120ms ease",
                            "&:hover": {
                              borderColor: "primary.main",
                              boxShadow: "0 12px 28px rgba(15, 23, 42, 0.08)",
                            },
                          }}
                        >
                          <Stack spacing={1.25}>
                            <Stack
                              direction="row"
                              justifyContent="space-between"
                              spacing={2}
                            >
                              <Box sx={{ minWidth: 0 }}>
                                <Typography
                                  variant="subtitle2"
                                  fontWeight={700}
                                  noWrap
                                >
                                  {job.model}
                                </Typography>
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                >
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
        </>
      )}

      <CreateTrainingJobDialog
        datasets={datasets}
        form={form}
        preferredBaseModel={preferredBaseModel}
        onChangeMethodType={updateMethodType}
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
  const { t } = useI18n();
  if (events.length === 0) {
    return (
      <Paper
        variant="outlined"
        sx={{ mt: 2, p: 3, textAlign: "center", color: "text.secondary" }}
      >
        {t("No events.")}
      </Paper>
    );
  }

  return (
    <Stack spacing={1.25} sx={{ mt: 2, maxHeight: 360, overflowY: "auto" }}>
      {events.map((event) => {
        const metrics =
          event.data?.type === "metrics" ? event.data.metrics : null;
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
              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                justifyContent="space-between"
              >
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip
                    size="small"
                    label={event.level}
                    color={
                      event.level === "error"
                        ? "error"
                        : event.data?.type === "metrics"
                          ? "primary"
                          : "default"
                    }
                  />
                  {event.data?.stream ? (
                    <Chip
                      size="small"
                      label={event.data.stream}
                      variant="outlined"
                    />
                  ) : null}
                  {event.data?.step ? (
                    <Chip
                      size="small"
                      label={`step ${event.data.step}`}
                      variant="outlined"
                    />
                  ) : null}
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  {formatDateTime(event.created_at)}
                </Typography>
              </Stack>
              <Typography
                variant="body2"
                sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
              >
                {event.message}
              </Typography>
              {metrics ? (
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {Object.entries(metrics).map(([key, value]) => (
                    <Chip
                      key={key}
                      size="small"
                      label={`${key}: ${formatMetricValue(value)}`}
                      variant="outlined"
                    />
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
  const { t } = useI18n();
  const stdout = logs?.stdout.trim() || "";
  const stderr = logs?.stderr.trim() || "";
  const isTruncated = Boolean(
    logs && (logs.stdout_truncated || logs.stderr_truncated),
  );
  const downloadHref = logs
    ? `/api/fine_tuning/jobs/${encodeURIComponent(logs.id)}/logs/download`
    : "";
  if (!stdout && !stderr) {
    return (
      <Paper
        variant="outlined"
        sx={{ mt: 2, p: 3, textAlign: "center", color: "text.secondary" }}
      >
        {t("No raw logs.")}
      </Paper>
    );
  }

  return (
    <Stack spacing={2} sx={{ mt: 2 }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        alignItems={{ xs: "flex-start", sm: "center" }}
        justifyContent="space-between"
      >
        <Typography variant="caption" color="text.secondary">
          {isTruncated
            ? t("Showing the last {count} lines from each log stream.", {
                count: String(logs?.displayed_line_limit ?? 0),
              })
            : " "}
        </Typography>
        <Link href={downloadHref} underline="hover">
          {t("Download full logs")}
        </Link>
      </Stack>
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
  const { t } = useI18n();
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
        {content || t("No content")}
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
  const { t } = useI18n();
  const points = useMemo(() => {
    const checkpointPoints = checkpoints
      .map((checkpoint) => {
        const trainLoss =
          checkpoint.metrics.train_loss ?? checkpoint.metrics.loss;
        const validLoss = checkpoint.metrics.valid_loss;
        if (
          typeof trainLoss !== "number" &&
          typeof validLoss !== "number"
        ) {
          return null;
        }
        return {
          step: checkpoint.step_number,
          trainLoss: typeof trainLoss === "number" ? trainLoss : null,
          validLoss: typeof validLoss === "number" ? validLoss : null,
        };
      })
      .filter((point): point is LossChartPoint => point !== null);
    if (checkpointPoints.length > 0) {
      return checkpointPoints;
    }
    return events
      .map((event, index) => {
        const metrics = event.data?.metrics;
        const trainLoss = metrics?.train_loss ?? metrics?.loss;
        const validLoss = metrics?.valid_loss;
        if (
          typeof trainLoss !== "number" &&
          typeof validLoss !== "number"
        ) {
          return null;
        }
        return {
          step: Number(event.data?.step ?? index + 1),
          trainLoss: typeof trainLoss === "number" ? trainLoss : null,
          validLoss: typeof validLoss === "number" ? validLoss : null,
        };
      })
      .filter((point): point is LossChartPoint => point !== null);
  }, [checkpoints, events]);

  const trainPoints = points.filter(
    (point): point is LossChartPoint & { trainLoss: number } =>
      typeof point.trainLoss === "number",
  );
  const validPoints = points.filter(
    (point): point is LossChartPoint & { validLoss: number } =>
      typeof point.validLoss === "number",
  );

  if (trainPoints.length === 0 && validPoints.length === 0) {
    return (
      <Paper
        variant="outlined"
        sx={{ p: 3, textAlign: "center", color: "text.secondary" }}
      >
        {t("No loss data available to plot.")}
      </Paper>
    );
  }

  const initialTrainLoss = trainPoints[0]?.trainLoss;
  const latestTrainLoss = trainPoints[trainPoints.length - 1]?.trainLoss;
  const lowestTrainLoss =
    trainPoints.length > 0
      ? Math.min(...trainPoints.map((point) => point.trainLoss))
      : null;
  const latestValidLoss = validPoints[validPoints.length - 1]?.validLoss ?? null;

  return (
    <Stack spacing={1.5}>
      <Box sx={{ width: "100%", height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={points}
            margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.24} />
            <XAxis
              dataKey="step"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickLine={false}
              axisLine={false}
              label={{
                value: t("Step"),
                position: "insideBottom",
                offset: -4,
              }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={64}
              tickFormatter={(value: number) => formatMetricValue(value)}
            />
            <Tooltip
              formatter={(value: ValueType | undefined, name: NameType | undefined) => {
                if (typeof value !== "number") {
                  return [value ?? "-", name];
                }
                return [
                  formatMetricValue(value),
                  name === "trainLoss" ? t("Train loss") : t("Validation loss"),
                ];
              }}
              labelFormatter={(label) => `${t("Step")} ${label}`}
            />
            <Legend
              formatter={(value) =>
                value === "trainLoss" ? t("Train loss") : t("Validation loss")
              }
            />
            <Line
              type="monotone"
              dataKey="trainLoss"
              name="trainLoss"
              connectNulls
              stroke="#2563EB"
              strokeWidth={2.5}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="validLoss"
              name="validLoss"
              connectNulls
              stroke="#0F766E"
              strokeWidth={2.5}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </Box>
      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
        {typeof initialTrainLoss === "number" ? (
          <Chip
            size="small"
            label={`${t("Initial loss")} ${formatMetricValue(initialTrainLoss)}`}
            variant="outlined"
          />
        ) : null}
        {typeof latestTrainLoss === "number" ? (
          <Chip
            size="small"
            label={`${t("Latest loss")} ${formatMetricValue(latestTrainLoss)}`}
            color="primary"
            variant="outlined"
          />
        ) : null}
        {typeof lowestTrainLoss === "number" ? (
          <Chip
            size="small"
            label={`${t("Lowest loss")} ${formatMetricValue(lowestTrainLoss)}`}
            color="success"
            variant="outlined"
          />
        ) : null}
        {typeof latestValidLoss === "number" ? (
          <Chip
            size="small"
            label={`${t("Latest valid loss")} ${formatMetricValue(latestValidLoss)}`}
            color="secondary"
            variant="outlined"
          />
        ) : null}
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
  form: TrainingFormState;
  preferredBaseModel: string;
  onChangeMethodType: (methodType: TrainingMethodType) => void;
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
  form,
  preferredBaseModel,
  onChangeMethodType,
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
  const { t } = useI18n();
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{t("Create training job")}</DialogTitle>
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
              placeholder={`${preferredBaseModel} ${t("or /path/to/model")}`}
              required
              fullWidth
            />

            <FormControl fullWidth>
              <InputLabel id="dialog-dataset-select-label">
                {t("Dataset")}
              </InputLabel>
              <Select
                labelId="dialog-dataset-select-label"
                label={t("Dataset")}
                value={selectedDatasetId}
                onChange={(event) => onSelectDataset(event.target.value)}
                required
              >
                <MenuItem value="" disabled>
                  {t("Select a dataset")}
                </MenuItem>
                {datasets.map((dataset) => (
                  <MenuItem key={dataset.id} value={dataset.id}>
                    {dataset.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {datasets.length === 0 ? (
              <Alert severity="warning">
                {t("Create a dataset first to start a training job.")}
              </Alert>
            ) : null}

            <FormControl fullWidth>
              <InputLabel id="training-method-label">
                {t("Training method")}
              </InputLabel>
              <Select
                labelId="training-method-label"
                label={t("Training method")}
                value={form.methodType}
                onChange={(event) =>
                  onChangeMethodType(
                    event.target.value as TrainingMethodType,
                  )
                }
              >
                <MenuItem value="sft">SFT</MenuItem>
                <MenuItem value="lawf">LAwF</MenuItem>
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
                  {t("Advanced settings")}
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
                        onChange={(event) =>
                          onChangeForm("nEpochs", event.target.value)
                        }
                        inputProps={{ min: 1, step: 1 }}
                        fullWidth
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        label="Seed"
                        type="number"
                        value={form.seed}
                        onChange={(event) =>
                          onChangeForm("seed", event.target.value)
                        }
                        fullWidth
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        label="Suffix"
                        value={form.suffix}
                        onChange={(event) =>
                          onChangeForm("suffix", event.target.value)
                        }
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
                          onChange={(event) =>
                            onChangeForm("batchSize", event.target.value)
                          }
                          fullWidth
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="Learning Rate"
                          type="number"
                          value={form.learningRate}
                          onChange={(event) =>
                            onChangeForm("learningRate", event.target.value)
                          }
                          inputProps={{ step: "0.00001" }}
                          fullWidth
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="Logging Steps"
                          type="number"
                          value={form.loggingSteps}
                          onChange={(event) =>
                            onChangeForm("loggingSteps", event.target.value)
                          }
                          fullWidth
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="LoRA Rank"
                          type="number"
                          value={form.loraRank}
                          onChange={(event) =>
                            onChangeForm("loraRank", event.target.value)
                          }
                          fullWidth
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="LoRA Alpha"
                          type="number"
                          value={form.loraAlpha}
                          onChange={(event) =>
                            onChangeForm("loraAlpha", event.target.value)
                          }
                          fullWidth
                        />
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <TextField
                          label="LoRA Dropout"
                          type="number"
                          value={form.loraDropout}
                          onChange={(event) =>
                            onChangeForm("loraDropout", event.target.value)
                          }
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
                        onChange={(event) =>
                          onChangeForm("tensorboard", event.target.checked)
                        }
                      />
                    }
                    label={t("Enable TensorBoard integration")}
                  />
                </Stack>
              </AccordionDetails>
            </Accordion>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t("Cancel")}</Button>
          <Button
            type="submit"
            variant="contained"
            startIcon={<AddRoundedIcon />}
            disabled={submitting || datasets.length === 0 || !selectedDatasetId}
          >
            {submitting ? t("Submitting...") : t("Create training job")}
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
