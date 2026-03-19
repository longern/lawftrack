export interface DatasetDraft {
  name: string;
  base_model: string;
  training_file_id: string;
}

export interface TokenSelection {
  messageIndex: number;
  tokenIndex: number;
  currentToken: string;
  originalToken: string;
}

export interface TokenCandidate {
  text: string;
  logprob: number | null;
}
