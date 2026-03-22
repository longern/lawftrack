import { useMemo } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import LaunchRoundedIcon from "@mui/icons-material/LaunchRounded";
import { useI18n } from "../i18n";
import type {
  DatasetRecord,
  DeviceInfoItem,
  FineTuningJob,
  GatewayConfig,
  GatewayHealth,
  GatewayStatus,
  NavView,
} from "../types/app";

interface OverviewSectionProps {
  loading: boolean;
  recentDataset: DatasetRecord | null;
  recentJob: FineTuningJob | null;
  status: GatewayStatus | null;
  health: GatewayHealth | null;
  config: GatewayConfig | null;
  onNavigate: (view: NavView) => void;
}

function MetaList({
  items,
}: {
  items: Array<{ label: string; value: string }>;
}) {
  return (
    <Stack spacing={1.25}>
      {items.map((item) => (
        <Stack
          key={item.label}
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          spacing={2}
        >
          <Typography variant="body2" color="text.secondary">
            {item.label}
          </Typography>
          <Typography
            variant="body2"
            fontWeight={600}
            textAlign="right"
            sx={{ wordBreak: "break-word" }}
          >
            {item.value}
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}

function OverviewSection({
  loading,
  recentDataset,
  recentJob,
  status,
  health,
  config,
  onNavigate,
}: OverviewSectionProps) {
  const { t, formatDateTime, formatRelativeTime, formatDatasetCount } =
    useI18n();

  const formatMemory = (value?: number | null) =>
    value != null ? `${(value / 1024).toFixed(1)} GB` : t("Unknown");
  const formatPercent = (value?: number | null) =>
    value != null ? `${value}%` : t("Unknown");
  const formatTemperature = (value?: number | null) =>
    value != null ? `${value}℃` : t("Unknown");
  const sumMetric = (values: Array<number | null | undefined>) => {
    const knownValues = values.filter(
      (value): value is number => value != null,
    );
    if (!knownValues.length) {
      return null;
    }
    return knownValues.reduce((sum, value) => sum + value, 0);
  };
  const averageMetric = (values: Array<number | null | undefined>) => {
    const knownValues = values.filter(
      (value): value is number => value != null,
    );
    if (!knownValues.length) {
      return null;
    }
    return Math.round(
      knownValues.reduce((sum, value) => sum + value, 0) / knownValues.length,
    );
  };

  const deviceInfo = useMemo<DeviceInfoItem[]>(
    () => [
      { label: t("Hostname"), value: status?.hostname || t("Unknown") },
      {
        label: t("Operating system"),
        value: status?.operating_system || t("Unknown"),
      },
      {
        label: t("Architecture"),
        value: status?.architecture || t("Unknown"),
      },
      {
        label: t("CPU threads"),
        value:
          status?.cpu_threads != null
            ? String(status.cpu_threads)
            : t("Unknown"),
      },
      {
        label: t("Python version"),
        value: status?.python_version || t("Unknown"),
      },
    ],
    [status, t],
  );

  const recentDatasetMeta = [
    {
      label: t("Base model"),
      value: recentDataset?.base_model?.trim() || t("Not set"),
    },
    {
      label: t("Samples"),
      value: formatDatasetCount(recentDataset?.sample_count),
    },
    {
      label: t("Updated at"),
      value: formatDateTime(recentDataset?.updated_at),
    },
  ];

  const jobDatasetId =
    typeof recentJob?.metadata?.dataset_id === "string"
      ? recentJob.metadata.dataset_id
      : null;
  const recentJobMeta = [
    { label: t("Status"), value: recentJob?.status || t("No job yet") },
    { label: t("Model"), value: recentJob?.model || t("No job yet") },
    {
      label: t("Dataset ID"),
      value: jobDatasetId || t("Not linked"),
    },
    {
      label: t("Created at"),
      value: formatDateTime(recentJob?.created_at),
    },
  ];

  const serviceMeta = [
    { label: t("Gateway status"), value: status?.status || "unknown" },
    { label: t("Health check"), value: health?.status || "unknown" },
    {
      label: t("Upstream endpoint"),
      value: config?.vllm_endpoint || t("Not configured"),
    },
    {
      label: "API Key",
      value: config?.has_api_key ? t("Configured") : t("Not set"),
    },
  ];

  const gpus = status?.gpus ?? [];
  const gpuMeta = useMemo(() => {
    if (!gpus.length) {
      return [];
    }

    const uniqueNames = Array.from(
      new Set(gpus.map((gpu) => gpu.name).filter(Boolean)),
    );
    const deviceLabel =
      uniqueNames.length === 1
        ? `${gpus.length} x ${uniqueNames[0]}`
        : gpus
            .map((gpu) => `GPU ${gpu.index}: ${gpu.name || t("Unknown")}`)
            .join(", ");

    const totalMemory = sumMetric(gpus.map((gpu) => gpu.memory_total_mb));
    const usedMemory = sumMetric(gpus.map((gpu) => gpu.memory_used_mb));
    const freeMemory = sumMetric(gpus.map((gpu) => gpu.memory_free_mb));
    const averageUtilization = averageMetric(
      gpus.map((gpu) => gpu.utilization_gpu_percent),
    );
    const temperatureValues = gpus
      .map((gpu) => gpu.temperature_celsius)
      .filter((value): value is number => value != null);

    return [
      { label: t("Device"), value: deviceLabel },
      { label: t("VRAM free"), value: formatMemory(freeMemory) },
      { label: t("VRAM used"), value: formatMemory(usedMemory) },
      { label: t("VRAM total"), value: formatMemory(totalMemory) },
      {
        label: t("GPU utilization"),
        value: formatPercent(averageUtilization),
      },
      {
        label: t("Temperature"),
        value: temperatureValues.length
          ? formatTemperature(Math.max(...temperatureValues))
          : t("Unknown"),
      },
    ];
  }, [gpus, t]);

  return (
    <Grid container spacing={3}>
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
                <Box>
                  <Typography variant="h5" fontWeight={700}>
                    {t("lawftune Workspace")}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t(
                      "See datasets, training jobs, and gateway health in one place, then jump straight into the next task.",
                    )}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1.5}>
                  <Button
                    variant="outlined"
                    endIcon={<LaunchRoundedIcon />}
                    onClick={() => onNavigate("data")}
                  >
                    {t("Open data workspace")}
                  </Button>
                  <Button
                    variant="contained"
                    endIcon={<LaunchRoundedIcon />}
                    onClick={() => onNavigate("training")}
                  >
                    {t("Open training queue")}
                  </Button>
                </Stack>
              </Stack>
              {loading ? <LinearProgress /> : null}
            </Stack>
          </CardContent>
        </Card>
      </Grid>

      <Grid size={{ xs: 12, lg: 6 }}>
        <Card sx={{ height: "100%" }}>
          <CardContent>
            <Stack spacing={2}>
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
              >
                <Typography variant="h6">{t("Recent dataset")}</Typography>
                <Chip
                  size="small"
                  color={recentDataset ? "primary" : "default"}
                  label={
                    recentDataset
                      ? formatRelativeTime(recentDataset.updated_at)
                      : t("No activity yet")
                  }
                />
              </Stack>
              <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
                <Typography variant="subtitle1" fontWeight={700}>
                  {recentDataset?.name || t("No recently opened dataset")}
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 0.75 }}
                >
                  {recentDataset
                    ? `${t("Dataset ID")}: ${recentDataset.id}`
                    : t(
                        "Create or open a dataset to see its latest configuration and timestamp here.",
                      )}
                </Typography>
                <Box sx={{ mt: 2 }}>
                  <MetaList items={recentDatasetMeta} />
                </Box>
              </Paper>
            </Stack>
          </CardContent>
        </Card>
      </Grid>

      <Grid size={{ xs: 12, lg: 6 }}>
        <Card sx={{ height: "100%" }}>
          <CardContent>
            <Stack spacing={2}>
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
              >
                <Typography variant="h6">{t("Recent training job")}</Typography>
                <Chip
                  size="small"
                  color={
                    recentJob?.status === "succeeded" ? "success" : "default"
                  }
                  label={recentJob?.status || t("No job yet")}
                />
              </Stack>
              <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
                <Typography variant="subtitle1" fontWeight={700}>
                  {recentJob?.id || t("No training jobs yet")}
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 0.75 }}
                >
                  {recentJob
                    ? `${t("Created")} ${formatRelativeTime(recentJob.created_at)}`
                    : t(
                        "Submit a training job to see its status, model, and linked dataset here.",
                      )}
                </Typography>
                <Box sx={{ mt: 2 }}>
                  <MetaList items={recentJobMeta} />
                </Box>
              </Paper>
            </Stack>
          </CardContent>
        </Card>
      </Grid>

      <Grid size={{ xs: 12, lg: 6 }}>
        <Card sx={{ height: "100%" }}>
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="h6">{t("GPU snapshot")}</Typography>
              <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
                {gpuMeta.length ? (
                  <MetaList items={gpuMeta} />
                ) : (
                  <Stack spacing={0.75}>
                    <Typography variant="subtitle1" fontWeight={700}>
                      {t("No GPU detected")}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {t("No NVIDIA GPU metrics available on the server yet.")}
                    </Typography>
                  </Stack>
                )}
              </Paper>
            </Stack>
          </CardContent>
        </Card>
      </Grid>

      <Grid size={{ xs: 12, lg: 3 }}>
        <Card sx={{ height: "100%" }}>
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="h6">{t("Server device")}</Typography>
              <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
                <MetaList items={deviceInfo} />
              </Paper>
            </Stack>
          </CardContent>
        </Card>
      </Grid>

      <Grid size={{ xs: 12, lg: 3 }}>
        <Card sx={{ height: "100%" }}>
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="h6">{t("Service snapshot")}</Typography>
              <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
                <MetaList items={serviceMeta} />
              </Paper>
            </Stack>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
}

export default OverviewSection;
