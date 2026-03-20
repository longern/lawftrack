export interface RemoteModelRecord {
  id?: string | null;
  parent?: string | null;
  root?: string | null;
}

export const FALLBACK_BASE_MODEL = "openai/gpt-oss-120b";

function normalizeModelId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}

function looksLikeAdapterId(modelId: string): boolean {
  return /(?:^|[-_/])(?:lora|adapter)(?:$|[-_/])/i.test(modelId);
}

export function listModelOptionIds(models: RemoteModelRecord[]): string[] {
  return dedupe(
    models
      .map((model) => normalizeModelId(model.id))
      .filter((modelId): modelId is string => Boolean(modelId)),
  );
}

export function resolvePreferredBaseModel(models: RemoteModelRecord[]): string | null {
  const normalizedModels = models
    .map((model) => ({
      id: normalizeModelId(model.id),
      parent: normalizeModelId(model.parent),
    }))
    .filter((model): model is { id: string; parent: string | null } => Boolean(model.id));

  if (normalizedModels.length === 0) {
    return null;
  }

  const modelIds = dedupe(normalizedModels.map((model) => model.id));
  const parentlessIds = dedupe(
    normalizedModels.filter((model) => !model.parent).map((model) => model.id),
  );
  if (parentlessIds.length === 1) {
    return parentlessIds[0];
  }

  if (modelIds.length === 1) {
    return modelIds[0];
  }

  const referencedParentIds = modelIds.filter((modelId) =>
    normalizedModels.some((model) => model.parent === modelId),
  );
  if (referencedParentIds.length === 1) {
    return referencedParentIds[0];
  }

  const nonAdapterIds = modelIds.filter((modelId) => !looksLikeAdapterId(modelId));
  if (nonAdapterIds.length === 1) {
    return nonAdapterIds[0];
  }

  return null;
}
