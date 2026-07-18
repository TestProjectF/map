"use client";

import { type Dispatch, type MutableRefObject, type SetStateAction, useEffect, useMemo, useRef, useState } from "react";
import Feature from "ol/Feature";
import Map from "ol/Map";
import { Geometry } from "ol/geom";
import VectorSource from "ol/source/Vector";
import ImageLayer from "ol/layer/Image";
import LayerGroup from "ol/layer/Group";
import VectorLayer from "ol/layer/Vector";
import Static from "ol/source/ImageStatic";
import GeoTIFF from "ol/source/GeoTIFF";
import { transformExtent } from "ol/proj";

import { downloadGeojson } from "@/lib/gis/download";
import { geojsonFormat, mergeMapLayers, writeSource } from "@/lib/gis/geojson";
import { createVectorLayer, makeStyle } from "@/lib/gis/styles";
import { API_BASE } from "@/lib/api";
import type { LayerBundle } from "@/lib/gis/types";
import type { MapLayerState, NormalizedDataset } from "@/types/gis";

type UseMapLayersOptions = {
  mapRef: MutableRefObject<Map | null>;
  layerRefs: MutableRefObject<globalThis.Map<string, LayerBundle>>;
  setActiveLayerFeatures: Dispatch<SetStateAction<Feature<Geometry>[]>>;
  clearSelectedFeature: () => void;
};

export function useMapLayers({ mapRef, layerRefs, setActiveLayerFeatures, clearSelectedFeature }: UseMapLayersOptions) {
  const layersRef = useRef<MapLayerState[]>([]);
  const activeLayerIdRef = useRef("");
  const [layers, setLayers] = useState<MapLayerState[]>([]);
  const [activeLayerId, setActiveLayerId] = useState("");
  const [exportLayerId, setExportLayerId] = useState("");

  const activeLayer = useMemo(() => layers.find((layer) => layer.id === activeLayerId) ?? null, [activeLayerId, layers]);
  const selectedExportLayerId = useMemo(
    () => {
      const vectorLayers = layers.filter((layer) => layer.kind !== "uploaded-raster");
      return vectorLayers.some((layer) => layer.id === exportLayerId) ? exportLayerId : vectorLayers[0]?.id ?? "";
    },
    [exportLayerId, layers]
  );
  const drawingLayers = useMemo(() => layers.filter((layer) => layer.kind === "drawing"), [layers]);
  const drawingTargetId = activeLayer?.kind === "drawing" ? activeLayerId : "";

  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);

  useEffect(() => {
    activeLayerIdRef.current = activeLayerId;
  }, [activeLayerId]);

  useEffect(() => {
    for (const state of layers) {
      const bundle = layerRefs.current.get(state.id);
      if (!bundle) continue;
      const usesCadRasterPreview = state.sourceCategory === "cad" && (state.georeferenceStatus === "local" || state.georeferenceStatus === "fitting");
      bundle.layer.setVisible(state.visible && !usesCadRasterPreview);
      bundle.layer.setOpacity(state.opacity);
      if (bundle.layer instanceof VectorLayer) {
        bundle.layer.setStyle(makeStyle(state));
      }
    }
  }, [layerRefs, layers]);

  function addUploadLayer(sourceDataset: NormalizedDataset, sourceLayerId: string | null, name: string, geojson: GeoJSON.FeatureCollection | null, featureCount: number) {
    const map = mapRef.current;
    if (!map) return;
    const id = crypto.randomUUID();
    const isCadLocal = sourceDataset.sourceCategory === "cad" && !sourceDataset.crs;
    const layerStyle = {
      stroke: "#0f766e",
      fill: "#14b8a6"
    };
    function activateLayer(layerId: string, features: Feature<Geometry>[] | null = null) {
      setActiveLayerId(layerId);
      setExportLayerId(layerId);
      setActiveLayerFeatures(features ?? []);
    }

    const rasterOverlays = sourceDataset.extra?.rasterOverlays as Array<{ href: string; extent: number[] }> | undefined;
    if (rasterOverlays && rasterOverlays.length > 0) {
      const imageLayers: ImageLayer<Static>[] = [];
      let firstImageSource: Static | null = null;
      let cropExtent = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];

      for (const overlay of rasterOverlays) {
        const encodedHref = overlay.href.split("/").map(encodeURIComponent).join("/");
        const rasterUrl = `${API_BASE}/api/files/${sourceDataset.id}/kmz/${encodedHref}`;
        const imageExtent = transformExtent(overlay.extent, "EPSG:4326", map.getView().getProjection());
        const imageSource = new Static({ url: rasterUrl, imageExtent });
        firstImageSource ??= imageSource;
        imageLayers.push(new ImageLayer({ source: imageSource }));

        const [west, south, east, north] = overlay.extent;
        cropExtent = [
          Math.min(cropExtent[0], west),
          Math.min(cropExtent[1], south),
          Math.max(cropExtent[2], east),
          Math.max(cropExtent[3], north)
        ];
      }

      if (!firstImageSource) return;
      const projectedExtent = transformExtent(cropExtent, "EPSG:4326", map.getView().getProjection());
      const rasterGroup = new LayerGroup({ layers: imageLayers, opacity: 0.86 });
      rasterGroup.setExtent(projectedExtent);
      rasterGroup.setZIndex(1);
      const rasterState: MapLayerState = {
        id,
        datasetId: sourceDataset.id,
        datasetName: sourceDataset.originalFileName,
        sourceLayerId,
        sourceCategory: sourceDataset.sourceCategory,
        name,
        kind: "uploaded-raster",
        visible: true,
        opacity: 0.86,
        editable: false,
        style: layerStyle,
        featureCount: 0
      };
      layerRefs.current.set(id, { layer: rasterGroup, source: firstImageSource });
      map.addLayer(rasterGroup);
      layersRef.current = [...layersRef.current, rasterState];
      setLayers((current) => [...current, rasterState]);

      if (cropExtent.every(Number.isFinite)) {
        map.getView().fit(projectedExtent, { padding: [32, 32, 32, 32], maxZoom: 18, duration: 250 });
      }
      return;
    }
    if (!geojson) return;
    const state: MapLayerState = {
      id,
      datasetId: sourceDataset.id,
      datasetName: sourceDataset.originalFileName,
      sourceLayerId,
      sourceCategory: sourceDataset.sourceCategory,
      name,
      kind: "uploaded",
      visible: true,
      opacity: 0.86,
      editable: true,
      style: layerStyle,
      featureCount,
      georeferenceStatus: isCadLocal ? "local" : "referenced"
    };
    const dataProjection = isCadLocal ? "EPSG:3857" : "EPSG:4326";
    const source = new VectorSource<Feature<Geometry>>({
      features: geojsonFormat.readFeatures(geojson, {
        dataProjection,
        featureProjection: "EPSG:3857"
      }) as Feature<Geometry>[]
    });
    const vectorLayer = createVectorLayer(state, source);
    vectorLayer.setZIndex(10);
    layerRefs.current.set(id, { layer: vectorLayer, source });
    map.addLayer(vectorLayer);
    layersRef.current = [...layersRef.current, state];
    setLayers((current) => [...current, state]);
    activateLayer(id, source.getFeatures());
    const extent = source.getExtent();
    if (!isCadLocal && extent.every(Number.isFinite)) {
      map.getView().fit(extent, { padding: [32, 32, 32, 32], maxZoom: 18, duration: 250 });
    }
  }

  function addDrawingLayer() {
    const map = mapRef.current;
    if (!map) return null;
    const drawingCount = layers.filter((layer) => layer.kind === "drawing").length + 1;
    const id = `draw-${crypto.randomUUID()}`;
    const state = createDrawingLayerState(id, `Lớp vẽ ${drawingCount}`);
    const source = new VectorSource<Feature<Geometry>>();
    const vectorLayer = createVectorLayer(state, source);
    vectorLayer.setZIndex(20);
    layerRefs.current.set(id, { layer: vectorLayer, source });
    map.addLayer(vectorLayer);
    setLayers((current) => [...current, state]);
    setActiveLayerId(id);
    setExportLayerId(id);
    setActiveLayerFeatures([]);
    return source;
  }

  function updateLayer(id: string, patch: Partial<MapLayerState>) {
    setLayers((current) => current.map((layer) => (layer.id === id ? { ...layer, ...patch } : layer)));
  }

  function updateLayers(ids: string[], patch: Partial<MapLayerState>) {
    const targetIds = new Set(ids);
    setLayers((current) => current.map((layer) => (targetIds.has(layer.id) ? { ...layer, ...patch } : layer)));
  }

  function removeLayer(id: string) {
    const map = mapRef.current;
    const bundle = layerRefs.current.get(id);
    if (map && bundle) map.removeLayer(bundle.layer);
    layerRefs.current.delete(id);
    setLayers((current) => current.filter((layer) => layer.id !== id));
    setActiveLayerId((current) => (current === id ? "" : current));
    setExportLayerId((current) => (current === id ? "" : current));
    if (activeLayerIdRef.current === id) {
      setActiveLayerFeatures([]);
      clearSelectedFeature();
    }
  }

  function removeLayers(ids: string[]) {
    const targetIds = new Set(ids);
    const map = mapRef.current;
    for (const id of targetIds) {
      const bundle = layerRefs.current.get(id);
      if (map && bundle) map.removeLayer(bundle.layer);
      layerRefs.current.delete(id);
    }
    setLayers((current) => current.filter((layer) => !targetIds.has(layer.id)));
    setActiveLayerId((current) => (targetIds.has(current) ? "" : current));
    setExportLayerId((current) => (targetIds.has(current) ? "" : current));
    if (targetIds.has(activeLayerIdRef.current)) {
      setActiveLayerFeatures([]);
      clearSelectedFeature();
    }
  }

  function selectMapLayer(id: string) {
    const source = layerRefs.current.get(id)?.source;
    setActiveLayerId(id);
    setExportLayerId(id);
    if (source instanceof VectorSource) {
      setActiveLayerFeatures(source.getFeatures());
    } else {
      setActiveLayerFeatures([]);
    }
    clearSelectedFeature();
    return (source instanceof VectorSource) ? writeSource(source) : null;
  }

  function exportLayer(id: string) {
    const bundle = layerRefs.current.get(id);
    const state = layersRef.current.find((layer) => layer.id === id);
    if (!bundle || !state || !(bundle.source instanceof VectorSource)) return;
    downloadGeojson(`${state.name}.geojson`, writeSource(bundle.source));
  }

  function exportLayers(ids: string[], name: string) {
    const targetIds = new Set(ids);
    const selectedLayers = layersRef.current.filter((layer) => targetIds.has(layer.id) && layer.kind !== "uploaded-raster");
    if (selectedLayers.length === 0) return;
    downloadGeojson(`${name}.geojson`, mergeMapLayers(selectedLayers, layerRefs.current, name));
  }

  function exportMergedLayers() {
    const currentLayers = layersRef.current.filter((layer) => layer.kind !== "uploaded-raster");
    if (currentLayers.length === 0) return;
    downloadGeojson("merged-layers.geojson", mergeMapLayers(currentLayers, layerRefs.current));
  }

  function zoomLayer(id: string) {
    const map = mapRef.current;
    const bundle = layerRefs.current.get(id);
    if (!map || !bundle) return;
    const source = bundle.source;
    const layerExtent = bundle.layer.getExtent();

    if (layerExtent?.every(Number.isFinite)) {
      map.getView().fit(layerExtent, { padding: [64, 64, 64, 64], maxZoom: 18, duration: 220 });
    } else if (source instanceof VectorSource) {
      const extent = source.getExtent();
      if (extent.every(Number.isFinite)) {
        map.getView().fit(extent, { padding: [64, 64, 64, 64], maxZoom: 18, duration: 220 });
      }
    } else if (source instanceof GeoTIFF) {
      source.getView().then((view) => {
        if (view && view.extent) {
          map.getView().fit(view.extent, { padding: [64, 64, 64, 64], maxZoom: 18, duration: 220 });
        }
      });
    } else if (source instanceof Static) {
      const extent = source.getImageExtent();
      if (extent && extent.every(Number.isFinite)) {
        map.getView().fit(extent, { padding: [64, 64, 64, 64], maxZoom: 18, duration: 220 });
      }
    }
  }

  function zoomLayers(ids: string[]) {
    const map = mapRef.current;
    if (!map) return;
    const extents = ids
      .map((id) => {
        const bundle = layerRefs.current.get(id);
        const layerExtent = bundle?.layer.getExtent();
        if (layerExtent?.every(Number.isFinite)) return layerExtent;
        const source = bundle?.source;
        if (source instanceof VectorSource) return source.getExtent();
        if (source instanceof Static) return source.getImageExtent();
        return undefined;
      })
      .filter((extent): extent is number[] => Array.isArray(extent) && extent.every(Number.isFinite));
    if (extents.length === 0) return;
    const firstExtent = extents[0]!;
    const extent = extents.reduce<[number, number, number, number]>(
      (acc, item) => [Math.min(acc[0], item[0]), Math.min(acc[1], item[1]), Math.max(acc[2], item[2]), Math.max(acc[3], item[3])],
      [firstExtent[0], firstExtent[1], firstExtent[2], firstExtent[3]]
    );
    map.getView().fit(extent, { padding: [64, 64, 64, 64], maxZoom: 18, duration: 220 });
  }

  return {
    layers,
    layersRef,
    setLayers,
    activeLayerId,
    activeLayerIdRef,
    setActiveLayerId,
    selectedExportLayerId,
    setExportLayerId,
    activeLayer,
    drawingLayers,
    drawingTargetId,
    addUploadLayer,
    addDrawingLayer,
    updateLayer,
    updateLayers,
    removeLayer,
    removeLayers,
    selectMapLayer,
    zoomLayer,
    zoomLayers,
    exportLayer,
    exportLayers,
    exportMergedLayers
  };
}

function createDrawingLayerState(id: string, name: string): MapLayerState {
  return {
    id,
    datasetId: null,
    datasetName: null,
    sourceLayerId: null,
    sourceCategory: null,
    name,
    kind: "drawing",
    visible: true,
    opacity: 1,
    editable: true,
    style: {
      stroke: "#d97706",
      fill: "#f59e0b"
    },
    featureCount: 0
  };
}
