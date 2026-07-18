import { type Dispatch, type SetStateAction } from "react";
import { Check, FileUp, Move, Pencil, Ratio, X } from "lucide-react";

import type { PreviewMode } from "@/hooks/useDatasetUpload";
import type { NormalizedDataset } from "@/types/gis";
import { Info } from "../Info";
import { Panel } from "../panels/Panel";

export function UploadTab({
  dataset,
  previewMode,
  selectedSourceLayerId,
  sourceCrs,
  loading,
  error,
  setPreviewMode,
  setSelectedSourceLayerId,
  setSourceCrs,
  handleUpload,
  handleConvert,
  cadLocalDatasetIds,
  activeCadDatasetId,
  cadDatasetLabel,
  startCadGeoreference,
  restoreCadInitialAspectRatio,
  acceptCadGeoreference,
  cancelCadGeoreference,
  onClose
}: {
  dataset: NormalizedDataset | null;
  previewMode: PreviewMode;
  selectedSourceLayerId: string;
  sourceCrs: string;
  loading: string;
  error: string;
  setPreviewMode: Dispatch<SetStateAction<PreviewMode>>;
  setSelectedSourceLayerId: Dispatch<SetStateAction<string>>;
  setSourceCrs: Dispatch<SetStateAction<string>>;
  handleUpload: (file: File | null) => void;
  handleConvert: () => void;
  cadLocalDatasetIds: string[];
  activeCadDatasetId: string | null;
  cadDatasetLabel: (datasetId: string) => string;
  startCadGeoreference: (datasetId: string) => void;
  restoreCadInitialAspectRatio: () => void;
  acceptCadGeoreference: () => void;
  cancelCadGeoreference: () => void;
  onClose: () => void;
}) {
  const activeCadLocalId = activeCadDatasetId ?? cadLocalDatasetIds[0] ?? "";
  const hasLayerChoices = Boolean(dataset?.layers.length);
  return (
    <Panel title="Upload" onClose={onClose}>
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-[#95a39b] bg-white px-3 py-4 text-sm hover:bg-[#f3f6f4]">
        <FileUp className="shrink-0" size={18} />
        <span className="min-w-0 text-center leading-5">GeoJSON, KML, KMZ, ZIP Shapefile, GPKG, DXF, DWG, DGN</span>
        <input className="hidden" type="file" onChange={(event) => handleUpload(event.target.files?.[0] ?? null)} />
      </label>
      {loading && <div className="rounded-md bg-[#e7f1ee] px-3 py-2 text-sm text-[#0f5f58]">{loading}</div>}
      {error && <div className="rounded-md bg-[#fee7e2] px-3 py-2 text-sm text-[#8a2719]">{error}</div>}
      {dataset && (
        <div className="space-y-3 rounded-md border border-[#d9e0dc] bg-white p-3">
          <Info label="Tên file" value={dataset.originalFileName} />
          <Info label="Định dạng" value={dataset.detectedFormat} />
          <Info label="Loại dữ liệu" value={dataset.sourceCategory} />
          <Info label="CRS" value={dataset.crs ?? "Thiếu CRS"} />
          <Info label="BBox" value={dataset.bbox?.join(", ") ?? "Chưa có"} />
          {dataset.warnings.map((warning) => (
            <div key={`${warning.code}-${warning.message}`} className="rounded-md bg-[#fff5dc] px-3 py-2 text-sm text-[#73510b]">
              {warning.message}
            </div>
          ))}
          {hasLayerChoices && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 rounded-md border border-[#c4cec8] bg-[#eef3f0] p-1">
                <button
                  className={`min-h-9 rounded px-3 text-sm font-medium ${previewMode === "all" ? "bg-white text-[#0f5f58] shadow-sm" : "text-[#526159]"}`}
                  type="button"
                  onClick={() => setPreviewMode("all")}
                >
                  Cả file
                </button>
                <button
                  className={`min-h-9 rounded px-3 text-sm font-medium ${previewMode === "layer" ? "bg-white text-[#0f5f58] shadow-sm" : "text-[#526159]"}`}
                  type="button"
                  onClick={() => setPreviewMode("layer")}
                >
                  Một layer
                </button>
              </div>
              {previewMode === "layer" && (
                <select
                  className="w-full rounded-md border border-[#c4cec8] bg-white px-3 py-2 text-sm"
                  value={selectedSourceLayerId}
                  onChange={(event) => setSelectedSourceLayerId(event.target.value)}
                >
                  {dataset.layers.map((layer) => (
                    <option key={layer.id} value={layer.id}>
                      {layer.name} · {layer.geometryType ?? "Geometry"} · {layer.featureCount ?? 0}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
          <input
            className="w-full rounded-md border border-[#c4cec8] bg-white px-3 py-2 text-sm"
            placeholder="CRS nguồn, ví dụ EPSG:3405"
            value={sourceCrs}
            onChange={(event) => setSourceCrs(event.target.value)}
          />
          <button
            className="flex w-full items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-[#9aa8a2]"
            disabled={!dataset.readable || loading !== ""}
            onClick={handleConvert}
          >
            <Pencil size={16} />
            Preview trên bản đồ
          </button>
          {dataset.sourceCategory === "cad" && !sourceCrs && cadLocalDatasetIds.length > 0 && (
            <div className="space-y-2 rounded-md border border-[#cbd5cf] bg-[#f7faf8] p-3">
              <div className="text-sm font-medium">Căn chỉnh CAD local: {cadDatasetLabel(activeCadLocalId)}</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  className="flex min-h-10 items-center justify-center gap-2 rounded-md border border-[#cbd5cf] bg-white px-3 py-2 text-sm"
                  onClick={() => startCadGeoreference(activeCadLocalId)}
                >
                  <Move size={16} />
                  Kéo bbox
                </button>
                <button
                  className="flex min-h-10 items-center justify-center gap-2 rounded-md border border-[#cbd5cf] bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!activeCadDatasetId}
                  onClick={restoreCadInitialAspectRatio}
                >
                  <Ratio size={16} />
                  Tỉ lệ gốc
                </button>
                <button
                  className="flex min-h-10 items-center justify-center gap-2 rounded-md bg-[#0f766e] px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:bg-[#9aa8a2]"
                  disabled={!activeCadDatasetId}
                  onClick={acceptCadGeoreference}
                >
                  <Check size={16} />
                  Accept
                </button>
                <button
                  className="flex min-h-10 items-center justify-center gap-2 rounded-md border border-[#cbd5cf] bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!activeCadDatasetId}
                  onClick={cancelCadGeoreference}
                >
                  <X size={16} />
                  Hủy
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
