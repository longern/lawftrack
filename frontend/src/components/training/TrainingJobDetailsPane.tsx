import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import AutorenewRoundedIcon from "@mui/icons-material/AutorenewRounded";
import CancelRoundedIcon from "@mui/icons-material/CancelRounded";
import {
  Box,
  Button,
  Chip,
  Grid,
  IconButton,
  Link,
  Paper,
  Skeleton,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import { type ReactNode, useMemo } from "react";
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
import type {
  NameType,
  ValueType,
} from "recharts/types/component/DefaultTooltipContent";
import { useI18n } from "../../i18n";
import type {
  FineTuningJob,
  FineTuningJobCheckpoint,
  FineTuningJobEvent,
  FineTuningJobLogs,
} from "../../types/app";
import {
  buildLossChartPoints,
  formatDateTime,
  formatMetricValue,
} from "./trainingUtils";

interface TrainingJobDetailsPaneProps {
  selectedJob: FineTuningJob;
  jobCheckpoints: FineTuningJobCheckpoint[];
  jobEvents: FineTuningJobEvent[];
  jobLogs: FineTuningJobLogs | null;
  jobDetailTab: "events" | "logs";
  refreshing: boolean;
  loadingJobArtifacts: boolean;
  showBackButton: boolean;
  onBack: () => void;
  onCancelJob: (jobId: string) => void;
  onRefresh: () => void;
  onChangeJobDetailTab: (value: "events" | "logs") => void;
}

interface DetailCardProps {
  title: string;
  children: ReactNode;
}

interface DetailRowProps {
  label: string;
  value: string;
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

function LossChart({
  checkpoints,
  events,
}: {
  checkpoints: FineTuningJobCheckpoint[];
  events: FineTuningJobEvent[];
}) {
  const { t } = useI18n();
  const points = useMemo(
    () => buildLossChartPoints(checkpoints, events),
    [checkpoints, events],
  );
  const trainPoints = points.filter(
    (point): point is (typeof points)[number] & { trainLoss: number } =>
      typeof point.trainLoss === "number",
  );
  const validPoints = points.filter(
    (point): point is (typeof points)[number] & { validLoss: number } =>
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
  const latestValidLoss =
    validPoints[validPoints.length - 1]?.validLoss ?? null;

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
              formatter={(
                value: ValueType | undefined,
                name: NameType | undefined,
              ) => {
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

export function TrainingJobEmptyPane() {
  const { t } = useI18n();

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
        bgcolor: "background.paper",
      }}
    >
      <Paper
        variant="outlined"
        sx={{
          m: 3,
          p: { xs: 3, md: 4 },
          minHeight: { xs: 240, md: 520 },
          height: "calc(100% - 48px)",
          borderRadius: 3,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          color: "text.secondary",
        }}
      >
        <Stack spacing={1}>
          <Typography variant="h6" color="text.primary">
            {t("Training job details")}
          </Typography>
          <Typography variant="body2">
            {t("Select a training job to view details.")}
          </Typography>
        </Stack>
      </Paper>
    </Box>
  );
}

export function TrainingJobDetailsPane({
  selectedJob,
  jobCheckpoints,
  jobEvents,
  jobLogs,
  jobDetailTab,
  refreshing,
  loadingJobArtifacts,
  showBackButton,
  onBack,
  onCancelJob,
  onRefresh,
  onChangeJobDetailTab,
}: TrainingJobDetailsPaneProps) {
  const { t } = useI18n();

  return (
    <Box
      sx={{
        width: "100%",
        height: "100%",
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        bgcolor: "background.paper",
      }}
    >
      <Stack sx={{ minHeight: 0, height: "100%" }}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          alignItems={{ xs: "flex-start", md: "center" }}
          justifyContent="space-between"
          sx={{ p: 3, pb: 2 }}
        >
          <Typography variant="h6">{t("Training job details")}</Typography>
          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            flexWrap="wrap"
            alignItems="center"
          >
            {showBackButton ? (
              <Button
                size="small"
                startIcon={<ArrowBackRoundedIcon />}
                onClick={onBack}
              >
                {t("Back to training queue")}
              </Button>
            ) : null}
            <IconButton
              size="small"
              onClick={onRefresh}
              disabled={refreshing}
              aria-label={t("Refresh")}
              sx={{ color: "text.secondary" }}
            >
              <AutorenewRoundedIcon fontSize="small" />
            </IconButton>
            {selectedJob.status === "running" ? (
              <Button
                size="small"
                color="error"
                variant="outlined"
                startIcon={<CancelRoundedIcon />}
                onClick={() => onCancelJob(selectedJob.id)}
              >
                {t("Cancel job")}
              </Button>
            ) : null}
          </Stack>
        </Stack>

        <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          <Box sx={{ px: 3, pb: 3 }}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6, xl: 3 }}>
                <DetailCard title={t("Basic info")}>
                  <DetailRow label="Job ID" value={selectedJob.id} />
                  <DetailRow label={t("Status")} value={selectedJob.status} />
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
                    onChange={(_, value) => onChangeJobDetailTab(value)}
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
          </Box>
        </Box>
      </Stack>
    </Box>
  );
}
