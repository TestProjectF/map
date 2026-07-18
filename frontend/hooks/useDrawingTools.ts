"use client";

import { type MutableRefObject, useEffect, useRef, useState } from "react";
import Map from "ol/Map";
import { Draw, Modify, Snap } from "ol/interaction";
import { createBox, createRegularPolygon } from "ol/interaction/Draw";
import type { GeometryFunction } from "ol/interaction/Draw";
import VectorSource from "ol/source/Vector";

import type { LayerBundle } from "@/lib/gis/types";
import type { MapLayerState, ToolMode } from "@/types/gis";

type UseDrawingToolsOptions = {
  mapRef: MutableRefObject<Map | null>;
  layerRefs: MutableRefObject<globalThis.Map<string, LayerBundle>>;
  activeLayer: MapLayerState | null;
  captureDrawHistory: () => void;
};

const DEFAULT_TOOL: ToolMode = "select";

export function useDrawingTools({ mapRef, layerRefs, activeLayer, captureDrawHistory }: UseDrawingToolsOptions) {
  const toolRef = useRef<ToolMode>(DEFAULT_TOOL);
  const activeInteractionRef = useRef<Draw | Modify | null>(null);
  const snapRef = useRef<Snap | null>(null);
  const [tool, setTool] = useState<ToolMode>(DEFAULT_TOOL);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [freehandClosed, setFreehandClosed] = useState(false);

  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (activeInteractionRef.current) {
      map.removeInteraction(activeInteractionRef.current);
      activeInteractionRef.current = null;
    }

    const activeSource = activeLayer?.editable ? layerRefs.current.get(activeLayer.id)?.source : null;
    const vectorSource = activeSource instanceof VectorSource ? activeSource : null;

    if (tool === "modify" && vectorSource) {
      const modify = new Modify({ source: vectorSource });
      modify.on("modifyend", () => captureDrawHistory());
      map.addInteraction(modify);
      activeInteractionRef.current = modify;
    }

    const drawingSource = activeLayer?.kind === "drawing" ? layerRefs.current.get(activeLayer.id)?.source : null;
    const drawingVectorSource = drawingSource instanceof VectorSource ? drawingSource : null;
    if (tool.startsWith("draw") && drawingVectorSource) {
      const draw = new Draw({
        source: drawingVectorSource,
        type: drawGeometryType(tool, freehandClosed),
        geometryFunction: drawGeometryFunction(tool),
        freehand: tool === "draw-freehand"
      });
      draw.on("drawend", () => window.setTimeout(captureDrawHistory, 0));
      map.addInteraction(draw);
      activeInteractionRef.current = draw;
    }
  }, [activeLayer, captureDrawHistory, freehandClosed, layerRefs, mapRef, tool]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (snapRef.current) {
      map.removeInteraction(snapRef.current);
      snapRef.current = null;
    }
    const activeSource = activeLayer?.kind === "drawing" ? layerRefs.current.get(activeLayer.id)?.source : null;
    const snapSource = activeSource instanceof VectorSource ? activeSource : null;
    if (snapEnabled && snapSource) {
      const snap = new Snap({ source: snapSource });
      map.addInteraction(snap);
      snapRef.current = snap;
    }
  }, [activeLayer, layerRefs, mapRef, snapEnabled]);

  return {
    tool,
    toolRef,
    setTool,
    snapEnabled,
    setSnapEnabled,
    freehandClosed,
    setFreehandClosed
  };
}

function drawGeometryType(tool: ToolMode, freehandClosed: boolean) {
  if (tool === "draw-point") return "Point";
  if (tool === "draw-line") return "LineString";
  if (tool === "draw-freehand") return freehandClosed ? "Polygon" : "LineString";
  if (tool === "draw-rectangle" || tool === "draw-circle") return "Circle";
  return "Polygon";
}

function drawGeometryFunction(tool: ToolMode): GeometryFunction | undefined {
  if (tool === "draw-rectangle") return createBox();
  if (tool === "draw-circle") return createRegularPolygon(96);
  return undefined;
}
