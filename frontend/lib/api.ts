import type { BatchPreviewResponse, ConvertResponse, UploadDatasetResponse } from "@/types/gis";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";
export const DEFAULT_FEATURE_LIMIT = 1000000;

export async function uploadDataset(file: File): Promise<UploadDatasetResponse> {
  const data = new FormData();
  data.append("file", file);
  const response = await fetch(`${API_BASE}/api/files/upload`, {
    method: "POST",
    body: data
  });
  return readJson(response);
}

export async function createPreview(input: {
  fileId: string;
  layerId?: string;
  sourceCrs?: string;
  targetCrs?: string;
  featureLimit?: number;
}): Promise<ConvertResponse> {
  const response = await fetch(`${API_BASE}/api/files/${input.fileId}/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      targetCrs: "EPSG:4326",
      featureLimit: DEFAULT_FEATURE_LIMIT,
      ...input
    })
  });
  return readJson(response);
}

export async function createLayerPreviews(input: {
  fileId: string;
  sourceCrs?: string;
  targetCrs?: string;
  featureLimit?: number;
}): Promise<BatchPreviewResponse> {
  const response = await fetch(`${API_BASE}/api/files/${input.fileId}/previews`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      targetCrs: "EPSG:4326",
      featureLimit: DEFAULT_FEATURE_LIMIT,
      ...input
    })
  });
  return readJson(response);
}

export async function fetchPreview(url: string): Promise<GeoJSON.FeatureCollection> {
  const response = await fetch(`${API_BASE}${url}`);
  return readJson(response);
}

export async function saveExport(name: string, geojson: GeoJSON.FeatureCollection) {
  const response = await fetch(`${API_BASE}/api/layers/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, geojson })
  });
  return readJson(response);
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.detail ?? "Request failed");
  }
  return payload as T;
}
