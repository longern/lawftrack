import { Alert, Box, Stack, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import {
  type MouseEvent as ReactMouseEvent,
  type SubmitEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CreateTrainingJobDialog } from "../components/training/CreateTrainingJobDialog";
import {
  TrainingJobDetailsPane,
  TrainingJobEmptyPane,
} from "../components/training/TrainingJobDetailsPane";
import { TrainingQueuePane } from "../components/training/TrainingQueuePane";
import type { TrainingFormState } from "../components/training/trainingTypes";
import {
  DEFAULT_LAWF_N_EPOCHS,
  DEFAULT_SFT_N_EPOCHS,
  buildDefaultForm,
  buildMethodConfig,
} from "../components/training/trainingUtils";
import { useI18n } from "../i18n";
import type {
  ApiListResponse,
  DatasetRecord,
  DatasetTrainingFileExport,
  FineTuningJob,
  FineTuningJobCheckpoint,
  FineTuningJobEvent,
  FineTuningJobLogs,
} from "../types/app";
import {
  FALLBACK_BASE_MODEL,
  type RemoteModelRecord,
  resolvePreferredBaseModel,
} from "../utils/modelSelection";

interface TrainingSectionProps {
  initialJobId?: string | null;
  onInitialJobHandled?: () => void;
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

function TrainingSection({
  initialJobId,
  onInitialJobHandled,
}: TrainingSectionProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
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
  const [selectedJob, setSelectedJob] = useState<FineTuningJob | null>(null);
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
  const [desktopQueueWidth, setDesktopQueueWidth] = useState(360);
  const preferredBaseModelRef = useRef(FALLBACK_BASE_MODEL);
  const desktopPaneRef = useRef<HTMLDivElement | null>(null);
  const resizingDesktopPaneRef = useRef(false);
  const selectedDataset = useMemo(
    () => datasets.find((dataset) => dataset.id === selectedDatasetId) ?? null,
    [datasets, selectedDatasetId],
  );

  useEffect(() => {
    void loadPreferredBaseModel();
  }, []);

  useEffect(() => {
    if (selectedJobId) {
      void loadJob(selectedJobId);
      void loadJobArtifacts(selectedJobId);
      const timer = window.setInterval(() => {
        void loadJob(selectedJobId, false);
        void loadJobArtifacts(selectedJobId, false);
      }, 5000);
      return () => {
        window.clearInterval(timer);
      };
    }

    setSelectedJob(null);
    void refreshAll();
    const timer = window.setInterval(() => {
      void loadJobs(false);
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
    if (!selectedJobId) {
      setJobEvents([]);
      setJobCheckpoints([]);
      setJobLogs(null);
    }
  }, [selectedJobId]);

  useEffect(() => {
    if (!initialJobId) {
      return;
    }
    if (selectedJobId !== initialJobId) {
      setSelectedJobId(initialJobId);
    }
    onInitialJobHandled?.();
  }, [initialJobId, onInitialJobHandled, selectedJobId]);

  useEffect(() => {
    if (createDialogOpen && !selectedDatasetId && datasets.length > 0) {
      handleSelectDataset(datasets[0].id);
    }
  }, [createDialogOpen, datasets, selectedDatasetId]);

  useEffect(() => {
    function handlePointerMove(event: MouseEvent) {
      if (!resizingDesktopPaneRef.current || !desktopPaneRef.current) {
        return;
      }

      const rect = desktopPaneRef.current.getBoundingClientRect();
      const minLeftWidth = 280;
      const minRightWidth = 420;
      const maxLeftWidth = Math.max(minLeftWidth, rect.width - minRightWidth);
      const nextWidth = Math.min(
        Math.max(event.clientX - rect.left, minLeftWidth),
        maxLeftWidth,
      );
      setDesktopQueueWidth(nextWidth);
    }

    function handlePointerUp() {
      if (!resizingDesktopPaneRef.current) {
        return;
      }
      resizingDesktopPaneRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("mouseup", handlePointerUp);

    return () => {
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("mouseup", handlePointerUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, []);

  useEffect(() => {
    if (
      !selectedDatasetId ||
      datasets.some((dataset) => dataset.id === selectedDatasetId)
    ) {
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

  async function loadJob(jobId: string, showSpinner = true) {
    if (showSpinner) {
      setRefreshing(true);
    }
    try {
      const job = await fetchJson<FineTuningJob>(
        `/api/fine_tuning/jobs/${jobId}`,
      );
      setSelectedJob(job);
      setJobs((current) => {
        const hasMatch = current.some((item) => item.id === job.id);
        if (!hasMatch) {
          return current;
        }
        return current.map((item) => (item.id === job.id ? job : item));
      });
      setPageError("");
      return job;
    } catch (error) {
      setSelectedJob((current) => (current?.id === jobId ? null : current));
      setPageError(
        error instanceof Error
          ? error.message
          : t("Failed to load training jobs"),
      );
      return null;
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

  function updateMethodType(nextMethodType: TrainingFormState["methodType"]) {
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

  async function handleSubmitJob(event: SubmitEvent<HTMLFormElement>) {
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
      setJobs((current) => [createdJob, ...current]);
      setSelectedJob(createdJob);
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
      const cancelledJob = await fetchJson<FineTuningJob>(
        `/api/fine_tuning/jobs/${jobId}/cancel`,
        { method: "POST" },
      );
      setSelectedJob(cancelledJob);
      setJobs((current) =>
        current.map((job) => (job.id === cancelledJob.id ? cancelledJob : job)),
      );
    } catch (error) {
      setPageError(
        error instanceof Error ? error.message : t("Failed to cancel job"),
      );
    }
  }

  function handleOpenJob(job: FineTuningJob) {
    setSelectedJob(job);
    setSelectedJobId(job.id);
  }

  function handleRefreshSelectedJob() {
    if (!selectedJobId) {
      return;
    }
    void loadJob(selectedJobId);
    void loadJobArtifacts(selectedJobId);
  }

  function handleStartDesktopResize(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    resizingDesktopPaneRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  return (
    <Stack
      sx={{
        height: "100%",
        minHeight: 0,
        overflow: "hidden",
        bgcolor: "background.paper",
      }}
      spacing={3}
    >
      {pageError ? (
        <Alert severity="error" onClose={() => setPageError("")}>
          {pageError}
        </Alert>
      ) : null}

      <Box sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        {isMobile ? (
          <Box sx={{ height: "100%", minHeight: 0, display: "flex" }}>
            {selectedJob ? (
              <TrainingJobDetailsPane
                selectedJob={selectedJob}
                jobCheckpoints={jobCheckpoints}
                jobEvents={jobEvents}
                jobLogs={jobLogs}
                jobDetailTab={jobDetailTab}
                refreshing={refreshing}
                loadingJobArtifacts={loadingJobArtifacts}
                showBackButton
                onBack={() => setSelectedJobId(null)}
                onCancelJob={(jobId) => void handleCancelJob(jobId)}
                onRefresh={handleRefreshSelectedJob}
                onChangeJobDetailTab={setJobDetailTab}
              />
            ) : (
              <TrainingQueuePane
                jobs={jobs}
                selectedJobId={selectedJobId}
                refreshing={refreshing}
                formatTaskCount={formatTaskCount}
                onCreateJob={() => setCreateDialogOpen(true)}
                onOpenJob={handleOpenJob}
                onRefresh={() => void refreshAll()}
              />
            )}
          </Box>
        ) : (
          <Box
            ref={desktopPaneRef}
            sx={{
              height: "100%",
              minHeight: 0,
              display: "grid",
              gridTemplateColumns: `${desktopQueueWidth}px 1px minmax(0, 1fr)`,
            }}
          >
            <Box
              sx={{
                minHeight: 0,
                display: "flex",
                overflow: "hidden",
              }}
            >
              <TrainingQueuePane
                jobs={jobs}
                selectedJobId={selectedJobId}
                refreshing={refreshing}
                formatTaskCount={formatTaskCount}
                onCreateJob={() => setCreateDialogOpen(true)}
                onOpenJob={handleOpenJob}
                onRefresh={() => void refreshAll()}
              />
            </Box>
            <Box
              role="separator"
              aria-orientation="vertical"
              onMouseDown={handleStartDesktopResize}
              sx={{
                position: "relative",
                minHeight: 0,
                cursor: "col-resize",
                overflow: "visible",
                zIndex: 2,
                "&::before": {
                  content: '""',
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: "12px",
                  backgroundColor: "transparent",
                },
                "&::after": {
                  content: '""',
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: "1px",
                  bgcolor: "divider",
                  transition: "background-color 120ms ease, width 120ms ease",
                },
                "&:hover::after": {
                  width: 3,
                  bgcolor: "primary.main",
                },
              }}
            />
            <Box
              sx={{
                minHeight: 0,
                display: "flex",
                overflow: "hidden",
              }}
            >
              {selectedJob ? (
                <TrainingJobDetailsPane
                  selectedJob={selectedJob}
                  jobCheckpoints={jobCheckpoints}
                  jobEvents={jobEvents}
                  jobLogs={jobLogs}
                  jobDetailTab={jobDetailTab}
                  refreshing={refreshing}
                  loadingJobArtifacts={loadingJobArtifacts}
                  showBackButton={false}
                  onBack={() => setSelectedJobId(null)}
                  onCancelJob={(jobId) => void handleCancelJob(jobId)}
                  onRefresh={handleRefreshSelectedJob}
                  onChangeJobDetailTab={setJobDetailTab}
                />
              ) : (
                <TrainingJobEmptyPane />
              )}
            </Box>
          </Box>
        )}
      </Box>

      <CreateTrainingJobDialog
        datasets={datasets}
        form={form}
        preferredBaseModel={preferredBaseModel}
        open={createDialogOpen}
        pageError={pageError}
        selectedDatasetId={selectedDatasetId}
        submitting={submitting}
        onChangeMethodType={updateMethodType}
        onChangeForm={updateForm}
        onSelectDataset={handleSelectDataset}
        onSubmit={handleSubmitJob}
        onClearError={() => setPageError("")}
        onClose={() => setCreateDialogOpen(false)}
      />
    </Stack>
  );
}

export default TrainingSection;
