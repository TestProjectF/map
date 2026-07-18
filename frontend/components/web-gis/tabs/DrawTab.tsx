import { type Dispatch, type SetStateAction } from "react";
import { Circle, Dot, Edit3, Hexagon, Minus, MousePointer2, PenLine, Redo2, Square, Trash2, Undo2, type LucideIcon } from "lucide-react";

import type { MapLayerState, ToolMode } from "@/types/gis";
import { Panel } from "../panels/Panel";

export function DrawTab({
  drawingTargetId,
  drawingLayers,
  activeLayer,
  tool,
  toolButtons,
  snapEnabled,
  freehandClosed,
  selectMapLayer,
  addDrawingLayer,
  clearSelectedFeature,
  setTool,
  deleteSelectedFeature,
  setSnapEnabled,
  setFreehandClosed,
  undo,
  redo,
  onClose
}: {
  drawingTargetId: string;
  drawingLayers: MapLayerState[];
  activeLayer: MapLayerState | null;
  tool: ToolMode;
  toolButtons: Array<{ id: ToolMode; label: string }>;
  snapEnabled: boolean;
  freehandClosed: boolean;
  selectMapLayer: (id: string) => void;
  addDrawingLayer: () => void;
  clearSelectedFeature: () => void;
  setTool: Dispatch<SetStateAction<ToolMode>>;
  deleteSelectedFeature: () => void;
  setSnapEnabled: Dispatch<SetStateAction<boolean>>;
  setFreehandClosed: Dispatch<SetStateAction<boolean>>;
  undo: () => void;
  redo: () => void;
  onClose: () => void;
}) {
  return (
    <Panel title="Công cụ vẽ" onClose={onClose}>
      <label className="space-y-1 text-sm">
        <span className="block font-medium text-[#44544c]">Vẽ vào layer</span>
        <select
          className="w-full rounded-md border border-[#c4cec8] bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-[#eef2ef] disabled:text-[#7b8a83]"
          value={drawingTargetId}
          disabled={drawingLayers.length === 0}
          onChange={(event) => selectMapLayer(event.target.value)}
        >
          {drawingLayers.length === 0 && <option value="">Chưa có lớp vẽ</option>}
          {drawingLayers.length > 0 && <option value="">Chọn lớp vẽ</option>}
          {drawingLayers.map((layer) => (
            <option key={layer.id} value={layer.id}>
              {layer.name} · {layer.featureCount} feature
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center justify-between gap-2">
      <ToolButtonRow
        buttons={toolButtons.filter((button) => button.id === "select" || button.id === "delete")}
        tool={tool}
        activeLayer={activeLayer}
        addDrawingLayer={addDrawingLayer}
          clearSelectedFeature={clearSelectedFeature}
          setTool={setTool}
          deleteSelectedFeature={deleteSelectedFeature}
        />
        <div className="flex gap-2">
          <button className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-[#cbd5cf] bg-white hover:bg-[#edf2ef]" title="Undo" aria-label="Undo" onClick={undo}><Undo2 size={17} /></button>
          <button className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-[#cbd5cf] bg-white hover:bg-[#edf2ef]" title="Redo" aria-label="Redo" onClick={redo}><Redo2 size={17} /></button>
        </div>
      </div>
      <div className="text-xs font-semibold uppercase tracking-wide text-[#65756d]">Công cụ vẽ</div>
      <ToolButtonRow
        buttons={toolButtons.filter((button) => button.id !== "select" && button.id !== "delete")}
        tool={tool}
        activeLayer={activeLayer}
        addDrawingLayer={addDrawingLayer}
        clearSelectedFeature={clearSelectedFeature}
        setTool={setTool}
        deleteSelectedFeature={deleteSelectedFeature}
      />
      {tool === "draw-polygon" && (
        <button className={`flex min-h-10 items-center justify-center gap-2 rounded-md border px-2 py-2 text-sm ${snapEnabled ? "border-accent bg-[#dff1ed] text-[#0f5f58]" : "border-[#cbd5cf] bg-white text-[#44544c] hover:bg-[#edf2ef]"}`} onClick={() => setSnapEnabled((value) => !value)}>
          <MousePointer2 className="shrink-0" size={16} />
          Snap {snapEnabled ? "On" : "Off"}
        </button>
      )}
      {tool === "draw-freehand" && (
        <div className="flex gap-2">
          <label className="flex min-h-10 flex-1 items-center justify-between gap-3 rounded-md border border-[#cbd5cf] bg-white px-3 py-2 text-sm">
            <span className="font-medium text-[#44544c]">Khép kín</span>
            <input
              type="checkbox"
              className="h-4 w-4 accent-[#0f766e]"
              checked={freehandClosed}
              onChange={(event) => setFreehandClosed(event.target.checked)}
            />
          </label>
        </div>
      )}
    </Panel>
  );
}

function ToolButtonRow({
  buttons,
  tool,
  activeLayer,
  addDrawingLayer,
  clearSelectedFeature,
  setTool,
  deleteSelectedFeature
}: {
  buttons: Array<{ id: ToolMode; label: string }>;
  tool: ToolMode;
  activeLayer: MapLayerState | null;
  addDrawingLayer: () => void;
  clearSelectedFeature: () => void;
  setTool: Dispatch<SetStateAction<ToolMode>>;
  deleteSelectedFeature: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 pb-1">
      {buttons.map((button) => {
        const Icon = toolIcon(button.id);
        return (
          <button
            key={button.id}
            className={`flex h-12 w-[58px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border px-1 ${tool === button.id ? "border-accent bg-[#dff1ed] text-[#0f5f58]" : "border-[#cbd5cf] bg-white text-[#44544c] hover:bg-[#edf2ef]"}`}
            title={button.label}
            aria-label={button.label}
            onClick={() => {
              if (button.id === "delete") {
                deleteSelectedFeature();
                return;
              }
              if (button.id.startsWith("draw") && activeLayer?.kind !== "drawing") {
                addDrawingLayer();
              }
              if (button.id !== "select") clearSelectedFeature();
              setTool(button.id);
            }}
          >
            <Icon size={18} strokeWidth={2.1} />
            <span className="max-w-full truncate text-[10px] leading-3">{button.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function toolIcon(tool: ToolMode): LucideIcon {
  switch (tool) {
    case "select":
      return MousePointer2;
    case "draw-point":
      return Dot;
    case "draw-line":
      return Minus;
    case "draw-polygon":
      return Hexagon;
    case "draw-rectangle":
      return Square;
    case "draw-circle":
      return Circle;
    case "draw-freehand":
      return PenLine;
    case "modify":
      return Edit3;
    case "delete":
      return Trash2;
  }
}
