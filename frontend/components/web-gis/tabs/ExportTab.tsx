import { type Dispatch, type SetStateAction } from "react";
import { Download, Save } from "lucide-react";

import type { MapLayerState } from "@/types/gis";
import { Panel } from "../panels/Panel";

export function ExportTab({
  layers,
  selectedExportLayerId,
  setExportLayerId,
  exportLayer,
  exportMergedLayers,
  exportMergedToBackend,
  exportDrawnToBackend,
  onClose
}: {
  layers: MapLayerState[];
  selectedExportLayerId: string;
  setExportLayerId: Dispatch<SetStateAction<string>>;
  exportLayer: (id: string) => void;
  exportMergedLayers: () => void;
  exportMergedToBackend: () => void;
  exportDrawnToBackend: () => void;
  onClose: () => void;
}) {
  return (
    <Panel title="Export" onClose={onClose}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <select
          className="min-h-10 min-w-0 rounded-md border border-[#c4cec8] bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-[#eef2ef] disabled:text-[#7b8a83]"
          disabled={layers.length === 0}
          value={selectedExportLayerId}
          onChange={(event) => setExportLayerId(event.target.value)}
        >
          {layers.length === 0 && <option value="">Chưa có layer</option>}
          {layers.map((layer) => (
            <option key={layer.id} value={layer.id}>
              {layer.name}
            </option>
          ))}
        </select>
        <button className="flex min-h-10 items-center justify-center gap-2 rounded-md border border-[#cbd5cf] bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50" disabled={!selectedExportLayerId} onClick={() => selectedExportLayerId && exportLayer(selectedExportLayerId)}>
          <Download size={16} />
          Xuất
        </button>
      </div>
      <button className="flex w-full items-center justify-center gap-2 rounded-md border border-[#cbd5cf] bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50" disabled={layers.length === 0} onClick={exportMergedLayers}>
        <Download size={16} />
        Xuất gộp tất cả layer
      </button>
      <button className="flex w-full items-center justify-center gap-2 rounded-md bg-[#0f766e] px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:bg-[#9aa8a2]" disabled={layers.length === 0} onClick={exportMergedToBackend}>
        <Save size={16} />
        Lưu gộp tất cả lên backend
      </button>
      <button className="flex w-full items-center justify-center gap-2 rounded-md bg-[#24342c] px-3 py-2 text-sm text-white" onClick={exportDrawnToBackend}>
        <Save size={16} />
        Lưu toàn bộ lớp vẽ lên backend
      </button>
    </Panel>
  );
}
