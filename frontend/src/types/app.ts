import type { ReactNode } from "react";

export type NavView = "overview" | "data" | "training" | "chat";

export interface GpuStatus {
  index: number;
  name: string;
  memory_total_mb?: number | null;
  memory_used_mb?: number | null;
  memory_free_mb?: number | null;
  utilization_gpu_percent?: number | null;
  temperature_celsius?: number | null;
}

export interface GatewayStatus {
  name: string;
  status: string;
  hostname?: string;
  operating_system?: string;
  architecture?: string;
  cpu_threads?: number | null;
  python_version?: string;
  gpus?: GpuStatus[];
}

export interface GatewayHealth {
  status: string;
}

export interface GatewayConfig {
  vllm_endpoint: string;
  has_api_key: boolean;
}

export interface AppSnapshot {
  status: GatewayStatus | null;
  health: GatewayHealth | null;
  config: GatewayConfig | null;
}

export interface DatasetTab {
  id: string;
  name: string;
  location: string;
  isDraft?: boolean;
}

export interface DatasetRecord {
  id: string;
  object: "dataset";
  name: string;
  created_at: number;
  updated_at: number;
  base_model: string | null;
  sample_count?: number;
}

export interface DatasetMessage {
  role: string;
  content: string;
  reasoning?: string | null;
}

export interface DatasetTokenEdit {
  message_index: number;
  token_index: number;
  target?: "content" | "reasoning";
  original_token?: string | null;
  replacement_token: string;
  regenerated_from_token_index: number | null;
  created_at: number;
}

export interface DatasetMessageToken {
  token_index: number;
  token_id: number;
  token: string;
  text: string;
  start: number;
  end: number;
}

export interface DatasetMessageTokenization {
  message_index: number;
  role: string;
  reasoning?: string | null;
  reasoning_tokens: DatasetMessageToken[];
  content: string;
  tokens: DatasetMessageToken[];
}

export interface DatasetSampleTokenization {
  object: "dataset.sample.tokenization";
  sample_id: string;
  messages: DatasetMessageTokenization[];
}

export interface DatasetSample {
  id: string;
  object: "dataset.sample";
  dataset_id: string;
  title: string;
  created_at: number;
  updated_at: number;
  messages: DatasetMessage[];
  edits: DatasetTokenEdit[];
  anchors?: DatasetTokenEdit[];
}

export interface NavItem {
  id: NavView;
  label: string;
  icon: ReactNode;
}

export interface ApiListResponse<T> {
  object: "list";
  data: T[];
  has_more: boolean;
}

export interface UploadedFile {
  id: string;
  object: "file";
  bytes: number;
  created_at: number;
  filename: string;
  purpose: string;
  status: string;
  status_details: string | null;
  content_type: string;
}

export interface DatasetTrainingFileExport {
  object: "dataset.training_file";
  dataset_id: string;
  method: string;
  record_count: number;
  file: UploadedFile;
}

export interface FineTuningMethodConfig {
  type: string;
  hyperparameters?: Record<string, unknown>;
  sft?: {
    hyperparameters?: Record<string, unknown>;
  };
  lawf?: {
    hyperparameters?: Record<string, unknown>;
  };
}

export interface FineTuningJobError {
  code?: string;
  message?: string;
}

export interface FineTuningJobProcess {
  pid?: number | null;
  started_at?: number | null;
  exit_code?: number | null;
  cancelled_at?: number | null;
}

export interface FineTuningJob {
  id: string;
  object: "fine_tuning.job";
  created_at: number;
  error: FineTuningJobError | null;
  estimated_finish: number | null;
  fine_tuned_model: string | null;
  finished_at: number | null;
  hyperparameters: Record<string, unknown>;
  integrations: Array<{ type?: string }>;
  metadata: Record<string, unknown>;
  method: FineTuningMethodConfig;
  model: string;
  organization_id: string;
  result_files: string[];
  seed: number | null;
  status: string;
  trained_tokens: number | null;
  training_file: string;
  validation_file: string | null;
  suffix: string | null;
  lora_adapter: {
    name?: string;
    path?: string;
    status?: string;
    updated_at?: number;
    message?: string;
    error?: {
      message?: string;
      status_code?: number;
    };
  } | null;
  process?: FineTuningJobProcess;
}

export interface FineTuningJobEvent {
  id: string;
  object: "fine_tuning.job.event";
  created_at: number;
  level: string;
  message: string;
  data?: {
    type?: string;
    stream?: string;
    step?: number | null;
    metrics?: Record<string, number>;
  };
}

export interface FineTuningJobCheckpoint {
  id: string;
  object: "fine_tuning.job.checkpoint";
  created_at: number;
  fine_tuning_job_id: string;
  fine_tuned_model_checkpoint?: string | null;
  step_number: number;
  metrics: Record<string, number>;
}

export interface FineTuningJobLogs {
  object: "fine_tuning.job.logs";
  id: string;
  stdout: string;
  stderr: string;
  stdout_total_lines: number;
  stderr_total_lines: number;
  stdout_truncated: boolean;
  stderr_truncated: boolean;
  displayed_line_limit: number;
  status: string;
}

export interface DeviceInfoItem {
  label: string;
  value: string;
}
