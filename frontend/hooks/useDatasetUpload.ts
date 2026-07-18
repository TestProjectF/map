"use client";

import { useState } from "react";

import { createLayerPreviews, createPreview, fetchPreview, uploadDataset } from "@/lib/api";
import type { NormalizedDataset } from "@/types/gis";

export type PreviewMode = "all" | "layer";

type UseDatasetUploadOptions = {
  addUploadLayer: (dataset: NormalizedDataset, sourceLayerId: string | null, name: string, geojson: GeoJSON.FeatureCollection | null, featureCount: number) => void;
  onCadLocalDatasetReady?: (datasetId: string, expectedLayerCount: number) => void;
  onCadRasterReady?: (datasetId: string, url: string, overviewUrl: string | undefined, bbox: [number, number, number, number]) => void;
};

export function useDatasetUpload({ addUploadLayer, onCadLocalDatasetReady, onCadRasterReady }: UseDatasetUploadOptions) {
  const [dataset, setDataset] = useState<NormalizedDataset | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("all");
  const [selectedSourceLayerId, setSelectedSourceLayerId] = useState("");
  const [sourceCrs, setSourceCrs] = useState("");
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");

  async function handleUpload(file: File | null) {
    if (!file) return;
    setError("");
    setLoading("Đang đọc metadata...");
    try {
      const uploaded = await uploadDataset(file);
      setDataset(uploaded.dataset);
      setPreviewMode("all");
      setSelectedSourceLayerId(uploaded.dataset.layers[0]?.id ?? "");
      setSourceCrs(uploaded.dataset.crs ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload thất bại.");
    } finally {
      setLoading("");
    }
  }

  async function handleConvert() {
    if (!dataset) return;
    setError("");
    if (dataset.extra?.hasRaster) {
      setLoading("Đang hiển thị raster...");
      try {
        const sourceLayer = dataset.layers.find((layer) => layer.id === selectedSourceLayerId);
        const layerName = `${dataset.originalFileName}${sourceLayer ? `/${sourceLayer.name}` : ""}`;
        const overlays = dataset.extra.rasterOverlays as Array<{ href: string; extent: number[] }> | undefined;
        if (!overlays?.length) throw new Error("KMZ có raster nhưng không có GroundOverlay hợp lệ để đặt ảnh lên bản đồ.");
        addUploadLayer(dataset, sourceLayer?.id ?? null, layerName, null, 0);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Convert thất bại.");
      } finally {
        setLoading("");
      }
      return;
    }

    setLoading("Đang chuyển sang GeoJSON EPSG:4326...");
    try {
      const shouldPreviewAllLayers = previewMode === "all" && dataset.layers.length > 1;
      if (shouldPreviewAllLayers) {
        setLoading("Backend đang tạo preview cho tất cả layer...");
        const batch = await createLayerPreviews({
          fileId: dataset.id,
          sourceCrs: sourceCrs || undefined
        });
        setLoading("Đang tải preview layer lên bản đồ...");
        const previews = await Promise.all(
          batch.layers.map(async (layer) => ({
            layer,
            geojson: await fetchPreview(layer.previewUrl),
          }))
        );
        for (const { layer, geojson } of previews) {
          addUploadLayer(dataset, layer.layerId, `${dataset.originalFileName}/${layer.layerName}`, geojson, layer.featureCount);
        }
        if (dataset.sourceCategory === "cad" && !sourceCrs) {
          if (batch.rasterPreviewUrl && batch.rasterBbox) {
            onCadRasterReady?.(dataset.id, batch.rasterPreviewUrl, batch.rasterOverviewUrl, batch.rasterBbox);
          }
          onCadLocalDatasetReady?.(dataset.id, dataset.layers.length);
        }
      } else {
        const sourceLayer = previewMode === "layer" ? dataset.layers.find((layer) => layer.id === selectedSourceLayerId) : null;
        const converted = await createPreview({
          fileId: dataset.id,
          layerId: previewMode === "layer" ? selectedSourceLayerId || undefined : undefined,
          sourceCrs: sourceCrs || undefined
        });
        const geojson = await fetchPreview(converted.previewUrl);
        addUploadLayer(dataset, sourceLayer?.id ?? null, `${dataset.originalFileName}${sourceLayer ? `/${sourceLayer.name}` : ""}`, geojson, converted.featureCount);
        if (dataset.sourceCategory === "cad" && !sourceCrs) {
          if (converted.rasterPreviewUrl && converted.rasterBbox) {
            onCadRasterReady?.(dataset.id, converted.rasterPreviewUrl, converted.rasterOverviewUrl, converted.rasterBbox);
          }
          onCadLocalDatasetReady?.(dataset.id, 1);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Convert thất bại.");
    } finally {
      setLoading("");
    }
  }

  return {
    dataset,
    previewMode,
    selectedSourceLayerId,
    sourceCrs,
    loading,
    error,
    setError,
    setLoading,
    setPreviewMode,
    setSelectedSourceLayerId,
    setSourceCrs,
    handleUpload,
    handleConvert
  };
}
