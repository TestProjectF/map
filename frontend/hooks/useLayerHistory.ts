"use client";

import { type Dispatch, type MutableRefObject, type SetStateAction, useCallback, useState } from "react";
import Feature from "ol/Feature";
import { Geometry } from "ol/geom";
import VectorSource from "ol/source/Vector";

import { geojsonFormat, writeSource } from "@/lib/gis/geojson";
import { updateBoundingBoxForFeatures } from "@/lib/gis/transform";
import type { LayerBundle } from "@/lib/gis/types";
import type { MapLayerState } from "@/types/gis";

type UseLayerHistoryOptions = {
  layerRefs: MutableRefObject<globalThis.Map<string, LayerBundle>>;
  bboxSourceRef: MutableRefObject<VectorSource<Feature<Geometry>> | null>;
  activeLayerId: string;
  selectedFeatures: Feature<Geometry>[];
  replaceSelectedFeatures: (features: Feature<Geometry>[]) => void;
  setActiveLayerFeatures: Dispatch<SetStateAction<Feature<Geometry>[]>>;
  setLayers: Dispatch<SetStateAction<MapLayerState[]>>;
  clearSelectedFeature: () => void;
};

export function useLayerHistory({
  layerRefs,
  bboxSourceRef,
  activeLayerId,
  selectedFeatures,
  replaceSelectedFeatures,
  setActiveLayerFeatures,
  setLayers,
  clearSelectedFeature
}: UseLayerHistoryOptions) {
  const [history, setHistory] = useState<GeoJSON.FeatureCollection[]>([]);
  const [redoStack, setRedoStack] = useState<GeoJSON.FeatureCollection[]>([]);

  const captureDrawHistory = useCallback(() => {
    const activeBundle = layerRefs.current.get(activeLayerId);
    if (!activeBundle || !(activeBundle.source instanceof VectorSource)) return;
    const snapshot = writeSource(activeBundle.source);
    const featureCount = activeBundle.source.getFeatures().length;
    setHistory((items) => [...items, snapshot]);
    setRedoStack([]);
    setActiveLayerFeatures(activeBundle.source.getFeatures());
    setLayers((current) => current.map((layer) => (layer.id === activeLayerId ? { ...layer, featureCount } : layer)));
  }, [activeLayerId, layerRefs, setActiveLayerFeatures, setLayers]);

  function resetHistory(snapshot: GeoJSON.FeatureCollection | null) {
    setHistory(snapshot ? [snapshot] : []);
    setRedoStack([]);
  }

  function undo() {
    if (history.length < 2) return;
    const previous = history[history.length - 2];
    const current = history[history.length - 1];
    restoreActiveDrawingLayer(previous);
    setHistory((items) => items.slice(0, -1));
    setRedoStack((items) => [current, ...items]);
  }

  function redo() {
    const [next, ...rest] = redoStack;
    if (!next) return;
    restoreActiveDrawingLayer(next);
    setHistory((items) => [...items, next]);
    setRedoStack(rest);
  }

  function restoreActiveDrawingLayer(collection: GeoJSON.FeatureCollection) {
    const bundle = layerRefs.current.get(activeLayerId);
    if (!bundle || !(bundle.source instanceof VectorSource)) return;
    const currentFeatures = bundle.source.getFeatures();
    const selectedIndices = selectedFeatures.map((feature) => currentFeatures.indexOf(feature)).filter((index) => index >= 0);
    bundle.source.clear();
    bundle.source.addFeatures(geojsonFormat.readFeatures(collection, {
      dataProjection: "EPSG:4326",
      featureProjection: "EPSG:3857"
    }) as Feature<Geometry>[]);
    const nextFeatures = bundle.source.getFeatures();
    const featureCount = bundle.source.getFeatures().length;
    setActiveLayerFeatures(nextFeatures);
    setLayers((current) => current.map((layer) => (layer.id === activeLayerId ? { ...layer, featureCount } : layer)));
    const nextSelectedFeatures = selectedIndices.map((index) => nextFeatures[index]).filter((feature): feature is Feature<Geometry> => Boolean(feature));
    if (nextSelectedFeatures.length > 0) {
      replaceSelectedFeatures(nextSelectedFeatures);
      if (bboxSourceRef.current) updateBoundingBoxForFeatures(bboxSourceRef.current, nextSelectedFeatures);
    } else if (selectedIndices.length > 0) {
      clearSelectedFeature();
    }
  }

  return {
    history,
    setHistory,
    redoStack,
    setRedoStack,
    captureDrawHistory,
    resetHistory,
    undo,
    redo
  };
}
