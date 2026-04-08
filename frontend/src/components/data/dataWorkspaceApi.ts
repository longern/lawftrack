import type { DatasetRecord } from "../../types/app";

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const payload = (await response.json()) as { detail?: string };
      if (payload.detail) {
        message = payload.detail;
      }
    } catch {
      message = response.statusText || message;
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

export function buildNextDatasetName(datasets: DatasetRecord[]): string {
  const existingNames = new Set(
    datasets.map((dataset) => dataset.name.trim().toLowerCase()),
  );
  let nextIndex = 1;
  while (existingNames.has(`dataset-${nextIndex}`)) {
    nextIndex += 1;
  }
  return `dataset-${nextIndex}`;
}

export function decodeCandidateToken(token?: string, bytes?: number[]): string {
  if (Array.isArray(bytes) && bytes.length > 0) {
    try {
      return new TextDecoder().decode(new Uint8Array(bytes));
    } catch {
      return token ?? "";
    }
  }
  return token ?? "";
}
