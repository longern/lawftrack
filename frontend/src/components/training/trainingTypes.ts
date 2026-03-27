export type TrainingMethodType = "sft" | "lawf";

export interface TrainingFormState {
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
