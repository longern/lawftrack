import type {
  FineTuningJobCheckpoint,
  FineTuningJobEvent,
  FineTuningMethodConfig,
} from "../../types/app";
import type { TrainingFormState } from "./trainingTypes";
import type { ChipProps } from "@mui/material";

export type LossChartPoint = {
  step: number;
  trainLoss: number | null;
  validLoss: number | null;
};

export const DEFAULT_SFT_N_EPOCHS = "3";
export const DEFAULT_LAWF_N_EPOCHS = "32";

export function buildDefaultForm(model: string): TrainingFormState {
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

export function buildMethodConfig(
  form: TrainingFormState,
): FineTuningMethodConfig {
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

export function formatDateTime(timestamp?: number | null): string {
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

export function formatMetricValue(value: number) {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(4);
}

export function formatTrainingJobStatus(
  status: string | null | undefined,
  t: (key: string) => string,
): string {
  switch (status) {
    case "validating_files":
      return t("Validating files");
    case "queued":
      return t("Queued");
    case "running":
      return t("Running");
    case "succeeded":
      return t("Succeeded");
    case "failed":
      return t("Failed");
    case "cancelled":
      return t("Cancelled");
    case "paused":
      return t("Paused");
    default:
      return status ? status.replace(/_/g, " ") : "-";
  }
}

export function formatAdapterStatus(
  status: string | null | undefined,
  t: (key: string) => string,
): string {
  switch (status) {
    case "pending_load":
      return t("Pending load");
    case "loaded":
      return t("Loaded");
    case "load_failed":
      return t("Load failed");
    default:
      return status ? status.replace(/_/g, " ") : "-";
  }
}

export function resolveTrainingJobStatusColor(
  status: string | null | undefined,
): ChipProps["color"] {
  switch (status) {
    case "running":
      return "info";
    case "succeeded":
      return "success";
    case "failed":
      return "error";
    case "queued":
    case "validating_files":
    case "paused":
      return "warning";
    default:
      return "default";
  }
}

export function buildLossChartPoints(
  checkpoints: FineTuningJobCheckpoint[],
  events: FineTuningJobEvent[],
): LossChartPoint[] {
  const checkpointPoints = checkpoints
    .map((checkpoint) => {
      const trainLoss =
        checkpoint.metrics.train_loss ?? checkpoint.metrics.loss;
      const validLoss = checkpoint.metrics.valid_loss;
      if (typeof trainLoss !== "number" && typeof validLoss !== "number") {
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
      if (typeof trainLoss !== "number" && typeof validLoss !== "number") {
        return null;
      }
      return {
        step: Number(event.data?.step ?? index + 1),
        trainLoss: typeof trainLoss === "number" ? trainLoss : null,
        validLoss: typeof validLoss === "number" ? validLoss : null,
      };
    })
    .filter((point): point is LossChartPoint => point !== null);
}
