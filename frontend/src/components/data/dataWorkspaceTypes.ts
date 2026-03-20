import type { DatasetSample, DatasetSampleTokenization } from "../../types/app";

export interface DatasetDraft {
  name: string;
  base_model: string;
}

export interface TokenSelection {
  messageIndex: number;
  tokenIndex: number;
  target: "content" | "reasoning";
  currentToken: string;
  originalToken: string;
}

export interface TokenCandidate {
  text: string;
  logprob: number | null;
}

export interface ContinuationDraft {
  sample: DatasetSample;
  tokenization: DatasetSampleTokenization;
  baseTokenization: DatasetSampleTokenization;
}
