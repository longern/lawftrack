import type { ReactNode } from "react";

export type NavView = "data" | "training" | "service";

export interface GatewayStatus {
  name: string;
  status: string;
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
  training_file_id: string | null;
  training_filename: string | null;
  sample_count?: number;
}

export interface DatasetMessage {
  role: string;
  content: string;
}

export interface DatasetTokenEdit {
  message_index: number;
  token_index: number;
  original_token: string;
  replacement_token: string;
  regenerated_from_token_index: number;
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
  source_messages: DatasetMessage[];
  edits: DatasetTokenEdit[];
}

export interface NavItem {
  id: NavView;
  label: string;
  icon: ReactNode;
}

export type SummaryIcon = "gateway" | "health" | "upstream" | "auth";

export interface DataSummaryItem {
  title: string;
  value: string;
  icon: SummaryIcon;
}

export interface ServiceRecord {
  label: string;
  value: string;
}

export interface CommandItem {
  label: string;
  value: string;
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
