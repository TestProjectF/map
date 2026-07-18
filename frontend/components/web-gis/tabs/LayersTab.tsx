import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Download, Eye, EyeOff, FileText, Plus, Trash2, ZoomIn } from "lucide-react";

import type { MapLayerState } from "@/types/gis";
import { Panel } from "../panels/Panel";

export function LayersTab({
  layers,
  activeLayerId,
  addDrawingLayer,
  updateLayer,
  updateLayers,
  openLayerFeatures,
  zoomLayer,
  zoomLayers,
  exportLayer,
  exportLayers,
  removeLayer,
  removeLayers,
  onClose
}: {
  layers: MapLayerState[];
  activeLayerId: string;
  addDrawingLayer: () => void;
  updateLayer: (id: string, patch: Partial<MapLayerState>) => void;
  updateLayers: (ids: string[], patch: Partial<MapLayerState>) => void;
  openLayerFeatures: (id: string) => void;
  zoomLayer: (id: string) => void;
  zoomLayers: (ids: string[]) => void;
  exportLayer: (id: string) => void;
  exportLayers: (ids: string[], name: string) => void;
  removeLayer: (id: string) => void;
  removeLayers: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(new Set());
  const knownGroupIdsRef = useRef<Set<string>>(new Set());
  const layerGroups = useMemo(() => groupLayersByFile(layers), [layers]);

  useEffect(() => {
    setExpandedGroupIds((current) => {
      const next = new Set(current);
      for (const group of layerGroups) {
        if (!knownGroupIdsRef.current.has(group.id)) next.add(group.id);
      }
      knownGroupIdsRef.current = new Set(layerGroups.map((group) => group.id));
      return next;
    });
  }, [layerGroups]);

  function toggleGroup(groupId: string) {
    setExpandedGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }

  return (
    <Panel
      title="Quản lý layer"
      onClose={onClose}
      action={
        <button className="flex items-center gap-1 rounded-md border border-[#cbd5cf] bg-white px-2 py-1 text-xs" onClick={addDrawingLayer}>
          <Plus size={14} />
          Thêm layer
        </button>
      }
    >
      {layers.length === 0 && <div className="rounded-md bg-white px-3 py-4 text-sm text-[#5c6b63]">Chưa có layer nào trên bản đồ.</div>}
      <div className="space-y-2">
        {layerGroups.map((group) => {
          const isActiveGroup = group.layers.some((layer) => layer.id === activeLayerId);
          const isExpanded = expandedGroupIds.has(group.id);
          const groupLayerIds = group.layers.map((layer) => layer.id);
          const hasVisibleLayer = group.layers.some((layer) => layer.visible);
          return (
            <div key={group.id} className={`overflow-hidden rounded-md border bg-white ${isActiveGroup ? "border-accent" : "border-[#d9e0dc]"}`}>
              <div className="grid min-h-11 grid-cols-[minmax(0,1fr)_128px] items-center gap-2 px-2 py-2 hover:bg-[#f3f6f4]">
                <button
                  className="grid min-w-0 grid-cols-[24px_24px_minmax(0,1fr)_auto] items-center gap-2 px-1 text-left"
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                >
                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <FileText size={16} className={group.kind === "drawing" ? "text-[#d97706]" : "text-[#0f766e]"} />
                  <span className="min-w-0 truncate text-sm font-semibold" title={group.name}>
                    {group.name}
                  </span>
                  <span className="rounded bg-[#edf2ef] px-1.5 py-0.5 text-xs tabular-nums text-[#526158]">
                    {group.layers.length} · {group.featureCount}
                  </span>
                </button>
                <div className="grid grid-cols-4 gap-1 justify-self-end">
                  <button className="grid h-8 w-8 place-items-center rounded-md hover:bg-[#e7eee9]" title={hasVisibleLayer ? "Ẩn toàn bộ file" : "Hiện toàn bộ file"} onClick={() => updateLayers(groupLayerIds, { visible: !hasVisibleLayer })}>
                    {hasVisibleLayer ? <Eye size={16} /> : <EyeOff size={16} />}
                  </button>
                  <button className="grid h-8 w-8 place-items-center rounded-md hover:bg-[#e7eee9]" title="Zoom tới toàn bộ file" onClick={() => zoomLayers(groupLayerIds)}>
                    <ZoomIn size={16} />
                  </button>
                  <button className="grid h-8 w-8 place-items-center rounded-md hover:bg-[#e7eee9]" title="Export toàn bộ file" onClick={() => exportLayers(groupLayerIds, group.name)}>
                    <Download size={16} />
                  </button>
                  <button className="grid h-8 w-8 place-items-center rounded-md hover:bg-[#e7eee9]" title="Xóa toàn bộ file" onClick={() => removeLayers(groupLayerIds)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              {isExpanded && (
                <div className="space-y-1 border-t border-[#edf1ee] p-2">
                  {group.layers.map((layer) => (
                    <div key={layer.id} className={`grid grid-cols-[32px_minmax(0,1fr)_48px_32px_32px_32px] items-center gap-1 rounded-md border px-2 py-1.5 ${activeLayerId === layer.id ? "border-accent bg-[#f4fbf9]" : "border-[#d9e0dc] bg-white"}`}>
                      <button className="grid h-8 w-8 shrink-0 place-items-center rounded-md hover:bg-[#edf2ef]" title="Bật/tắt layer" onClick={() => updateLayer(layer.id, { visible: !layer.visible })}>
                        {layer.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                      </button>
                      <button className="min-w-0 truncate px-1 text-left text-sm font-medium" title={layerDisplayName(layer)} onClick={() => layer.kind !== "uploaded-raster" && openLayerFeatures(layer.id)}>
                        {layerDisplayName(layer)}
                      </button>
                      <span className="justify-self-end rounded bg-[#edf2ef] px-1.5 py-0.5 text-xs tabular-nums text-[#526158]" title="Số lượng feature">
                        {layer.featureCount}
                      </span>
                      <button className="grid h-8 w-8 shrink-0 place-items-center rounded-md hover:bg-[#edf2ef]" title="Zoom vào layer" onClick={() => zoomLayer(layer.id)}>
                        <ZoomIn size={16} />
                      </button>
                      <button className="grid h-8 w-8 shrink-0 place-items-center rounded-md hover:bg-[#edf2ef] disabled:cursor-not-allowed disabled:opacity-30" title={layer.kind === "uploaded-raster" ? "Raster không được export" : "Tải layer"} disabled={layer.kind === "uploaded-raster"} onClick={() => exportLayer(layer.id)}>
                        <Download size={16} />
                      </button>
                      <button className="grid h-8 w-8 shrink-0 place-items-center rounded-md hover:bg-[#edf2ef]" title="Xóa layer" onClick={() => removeLayer(layer.id)}>
                        <Trash2 size={16} />
                      </button>
                      {layer.kind === "uploaded-raster" && (
                        <label className="col-span-6 grid grid-cols-[64px_minmax(0,1fr)_40px] items-center gap-2 px-1 pt-1 text-xs text-[#526158]">
                          <span>Độ mờ</span>
                          <input type="range" min={0} max={1} step={0.05} value={layer.opacity} onChange={(event) => updateLayer(layer.id, { opacity: Number(event.target.value) })} />
                          <span className="text-right tabular-nums">{Math.round(layer.opacity * 100)}%</span>
                        </label>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

type LayerGroup = {
  id: string;
  name: string;
  kind: "uploaded" | "drawing";
  featureCount: number;
  layers: MapLayerState[];
};

function groupLayersByFile(layers: MapLayerState[]): LayerGroup[] {
  const groups = new Map<string, LayerGroup>();
  for (const layer of layers) {
    const isDrawing = layer.kind === "drawing";
    const id = isDrawing ? "drawing-layers" : `dataset-${layer.datasetId ?? layer.id}`;
    const name = isDrawing ? "Layer vẽ" : layer.datasetName ?? layer.name.split("/")[0] ?? "File đã upload";
    const group = groups.get(id) ?? {
      id,
      name,
      kind: isDrawing ? "drawing" : "uploaded",
      featureCount: 0,
      layers: []
    };
    group.featureCount += layer.featureCount;
    group.layers.push(layer);
    groups.set(id, group);
  }
  return [...groups.values()];
}

function layerDisplayName(layer: MapLayerState) {
  if (!layer.datasetName) return layer.name;
  const prefix = `${layer.datasetName}/`;
  return layer.name.startsWith(prefix) ? layer.name.slice(prefix.length) || layer.name : layer.name;
}
