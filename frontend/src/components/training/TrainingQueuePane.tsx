import AddRoundedIcon from "@mui/icons-material/AddRounded";
import AutorenewRoundedIcon from "@mui/icons-material/AutorenewRounded";
import {
  Box,
  Button,
  Chip,
  IconButton,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import type { FineTuningJob } from "../../types/app";
import { useI18n } from "../../i18n";
import {
  formatDateTime,
  formatTrainingJobStatus,
  resolveTrainingJobStatusColor,
} from "./trainingUtils";

interface TrainingQueuePaneProps {
  jobs: FineTuningJob[];
  selectedJobId: string | null;
  refreshing: boolean;
  formatTaskCount: (count: number) => string;
  onCreateJob: () => void;
  onOpenJob: (job: FineTuningJob) => void;
  onRefresh: () => void;
}

export function TrainingQueuePane({
  jobs,
  selectedJobId,
  refreshing,
  formatTaskCount,
  onCreateJob,
  onOpenJob,
  onRefresh,
}: TrainingQueuePaneProps) {
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
      <Stack sx={{ height: "100%", minHeight: 0, flex: 1 }}>
        <Stack spacing={1.5} sx={{ p: 3, pb: 2 }}>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
          >
            <Typography variant="h6">{t("Training queue")}</Typography>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Chip
                size="small"
                label={formatTaskCount(jobs.length)}
                color="primary"
                variant="outlined"
              />
              <IconButton
                size="small"
                onClick={onRefresh}
                disabled={refreshing}
                aria-label={t("Refresh")}
                sx={{ color: "text.secondary" }}
              >
                <AutorenewRoundedIcon fontSize="small" />
              </IconButton>
            </Stack>
          </Stack>
          <Stack direction="row" spacing={1.25} alignItems="center">
            <Button
              size="small"
              variant="contained"
              startIcon={<AddRoundedIcon />}
              onClick={onCreateJob}
              sx={{ flex: { xs: 1, sm: "initial" } }}
            >
              {t("Create training job")}
            </Button>
          </Stack>
        </Stack>

        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            overflow: "auto",
            borderTop: (theme) => `1px solid ${theme.palette.divider}`,
          }}
        >
          {jobs.length === 0 ? (
            <Box sx={{ px: 3, pt: 2, pb: 3 }}>
              <Paper
                variant="outlined"
                sx={{ p: 3, textAlign: "center", color: "text.secondary" }}
              >
                {t(
                  'No training jobs yet. Click "Create training job" to get started.',
                )}
              </Paper>
            </Box>
          ) : (
            <Box sx={{ px: 3, pt: 2, pb: 3 }}>
              <Stack spacing={1.5}>
                {jobs.map((job) => (
                  <Paper
                    key={job.id}
                    variant="outlined"
                    onClick={() => onOpenJob(job)}
                    sx={{
                      p: 2,
                      borderRadius: 3,
                      cursor: "pointer",
                      borderColor:
                        selectedJobId === job.id ? "primary.main" : "divider",
                      boxShadow:
                        selectedJobId === job.id
                          ? "0 12px 28px rgba(37, 99, 235, 0.12)"
                          : undefined,
                      transition:
                        "border-color 120ms ease, box-shadow 120ms ease",
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
                          <Typography variant="caption" color="text.secondary">
                            {job.id}
                          </Typography>
                        </Box>
                        <Chip
                          size="small"
                          color={resolveTrainingJobStatusColor(job.status)}
                          label={formatTrainingJobStatus(job.status, t)}
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
            </Box>
          )}
        </Box>
      </Stack>
    </Box>
  );
}
