import { type Dispatch, type SetStateAction } from "react";
import Map from "ol/Map";
import Feature from "ol/Feature";
import { Geometry, Point } from "ol/geom";
import { fromExtent } from "ol/geom/Polygon";
import { createEmpty, extend, getCenter } from "ol/extent";
import Select from "ol/interaction/Select";
import VectorSource from "ol/source/Vector";

import type { MapLayerState } from "@/types/gis";
import { cleanProperties, geojsonFormat, writeSource } from "./geojson";
import type { LayerBundle, TransformHandle } from "./types";

export function updateBoundingBox(source: VectorSource<Feature<Geometry>>, feature: Feature<Geometry>) {
  updateBoundingBoxForFeatures(source, [feature]);
}

export function updateBoundingBoxForFeatures(source: VectorSource<Feature<Geometry>>, features: Feature<Geometry>[]) {
  source.clear();
  const rawExtent = featuresExtent(features);
  if (!rawExtent) return;
  const extent = normalizeTransformExtent(rawExtent);
  if (!extent.every(Number.isFinite)) return;

  addBoundingBoxFeatures(source, extent);
}

export function featuresExtent(features: Feature<Geometry>[]): [number, number, number, number] | null {
  const combinedExtent = createEmpty();
  for (const feature of features) {
    const geometry = feature.getGeometry();
    if (geometry) extend(combinedExtent, geometry.getExtent());
  }
  return combinedExtent.every(Number.isFinite) ? [combinedExtent[0], combinedExtent[1], combinedExtent[2], combinedExtent[3]] : null;
}

function addBoundingBoxFeatures(source: VectorSource<Feature<Geometry>>, extent: [number, number, number, number]) {
  const [minX, minY, maxX, maxY] = extent;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const height = maxY - minY;
  const rotateOffset = Math.max(height * 0.18, 24);
  const rotateCoordinate: [number, number] = [centerX, maxY + rotateOffset];

  const box = new Feature<Geometry>(fromExtent(extent));
  box.set("transformBox", true);
  const rotateGuide = new Feature<Geometry>(
    geojsonFormat.readGeometry(
      {
        type: "LineString",
        coordinates: [
          [centerX, maxY],
          rotateCoordinate
        ]
      },
      {
        dataProjection: "EPSG:3857",
        featureProjection: "EPSG:3857"
      }
    ) as Geometry
  );
  rotateGuide.set("transformGuide", true);

  const handles: Array<[TransformHandle, [number, number]]> = [
    ["nw", [minX, maxY]],
    ["n", [centerX, maxY]],
    ["ne", [maxX, maxY]],
    ["e", [maxX, centerY]],
    ["se", [maxX, minY]],
    ["s", [centerX, minY]],
    ["sw", [minX, minY]],
    ["w", [minX, centerY]],
    ["rotate", rotateCoordinate]
  ];
  source.addFeatures([
    box,
    rotateGuide,
    ...handles.map(([handle, coordinate]) => {
      const item = new Feature<Geometry>(new Point(coordinate));
      item.set("transformHandle", handle);
      return item;
    })
  ]);
}

export function findFeatureLayerId(feature: Feature<Geometry>, refs: globalThis.Map<string, LayerBundle>) {
  for (const [id, bundle] of refs.entries()) {
    if (bundle.source instanceof VectorSource && bundle.source.hasFeature(feature)) return id;
  }
  return "";
}

export function findTransformHandleAtPixel(map: Map, pixel: number[]) {
  return map.forEachFeatureAtPixel(
    pixel,
    (feature) => (feature.get("transformHandle") ? feature : undefined),
    {
      hitTolerance: 8,
      layerFilter: (layer) => layer.get("selectable") === false
    }
  ) as Feature<Geometry> | undefined;
}

export function isSelectedFeatureAtPixel(map: Map, pixel: number[], selectedFeature: Feature<Geometry>) {
  return Boolean(
    map.forEachFeatureAtPixel(
      pixel,
      (feature) => (feature === selectedFeature ? feature : undefined),
      {
        hitTolerance: 4,
        layerFilter: (layer) => layer.get("selectable") !== false
      }
    )
  );
}

export function isAnySelectedFeatureAtPixel(map: Map, pixel: number[], selectedFeatures: Feature<Geometry>[]) {
  const selected = new Set(selectedFeatures);
  return Boolean(
    map.forEachFeatureAtPixel(
      pixel,
      (feature) => (selected.has(feature as Feature<Geometry>) ? feature : undefined),
      {
        hitTolerance: 4,
        layerFilter: (layer) => layer.get("selectable") !== false
      }
    )
  );
}

export function findSelectableFeatureAtPixel(map: Map, pixel: number[]) {
  return findSelectableFeaturesAtPixel(map, pixel)[0];
}

export function findSelectableFeaturesAtPixel(map: Map, pixel: number[]) {
  const seen = new Set<Feature<Geometry>>();
  const features: Feature<Geometry>[] = [];
  map.forEachFeatureAtPixel(
    pixel,
    (feature) => {
      const item = feature as Feature<Geometry>;
      if (!seen.has(item)) {
        seen.add(item);
        features.push(item);
      }
      return undefined;
    },
    {
      hitTolerance: 4,
      layerFilter: (layer) => layer.get("selectable") !== false
    }
  );
  return features;
}

export function selectFeatureForTransform(
  feature: Feature<Geometry>,
  select: Select | null,
  setSelectedFeature: Dispatch<SetStateAction<Feature<Geometry> | null>>,
  setProperties: Dispatch<SetStateAction<Record<string, unknown>>>
) {
  select?.getFeatures().clear();
  select?.getFeatures().push(feature);
  setSelectedFeature(feature);
  setProperties(cleanProperties(feature.getProperties()));
}

export function oppositeCorner(handle: TransformHandle, extent: [number, number, number, number]): [number, number] {
  const [minX, minY, maxX, maxY] = extent;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  switch (handle) {
    case "nw":
      return [maxX, minY];
    case "n":
      return [centerX, minY];
    case "ne":
      return [minX, minY];
    case "e":
      return [minX, centerY];
    case "se":
      return [minX, maxY];
    case "s":
      return [centerX, maxY];
    case "sw":
      return [maxX, maxY];
    case "w":
      return [maxX, centerY];
    case "rotate":
      return getCenter(extent) as [number, number];
  }
}

export function activeCorner(handle: TransformHandle, extent: [number, number, number, number]): [number, number] {
  const [minX, minY, maxX, maxY] = extent;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  switch (handle) {
    case "nw":
      return [minX, maxY];
    case "n":
      return [centerX, maxY];
    case "ne":
      return [maxX, maxY];
    case "e":
      return [maxX, centerY];
    case "se":
      return [maxX, minY];
    case "s":
      return [centerX, minY];
    case "sw":
      return [minX, minY];
    case "w":
      return [minX, centerY];
    case "rotate":
      return getCenter(extent) as [number, number];
  }
}

export function toTransformExtent(raw: number[]): [number, number, number, number] | null {
  if (raw.length < 4 || !raw.every(Number.isFinite)) return null;
  return [raw[0], raw[1], raw[2], raw[3]];
}

export function scaleCursor(handle: TransformHandle) {
  if (handle === "nw" || handle === "se") return "nwse-resize";
  if (handle === "ne" || handle === "sw") return "nesw-resize";
  if (handle === "n" || handle === "s") return "ns-resize";
  if (handle === "e" || handle === "w") return "ew-resize";
  return "grab";
}

export function scalesOnX(handle: TransformHandle | undefined) {
  return handle === "nw" || handle === "ne" || handle === "e" || handle === "se" || handle === "sw" || handle === "w";
}

export function scalesOnY(handle: TransformHandle | undefined) {
  return handle === "nw" || handle === "n" || handle === "ne" || handle === "se" || handle === "s" || handle === "sw";
}

export function angle(a: [number, number], b: [number, number]) {
  return Math.atan2(b[1] - a[1], b[0] - a[0]);
}

export function updateFeatureAfterTransform(
  feature: Feature<Geometry>,
  refs: globalThis.Map<string, LayerBundle>,
  activeLayerId: string,
  layers: MapLayerState[],
  setActiveLayerFeatures: Dispatch<SetStateAction<Feature<Geometry>[]>>,
  setHistory: Dispatch<SetStateAction<GeoJSON.FeatureCollection[]>>,
  setRedoStack: Dispatch<SetStateAction<GeoJSON.FeatureCollection[]>>
) {
  const changedLayerId = findFeatureLayerId(feature, refs);
  if (!changedLayerId || activeLayerId !== changedLayerId) return;
  const source = refs.get(changedLayerId)?.source;
  if (!(source instanceof VectorSource)) return;
  setActiveLayerFeatures(source.getFeatures());
  if (layers.find((layer) => layer.id === changedLayerId)?.editable) {
    setHistory((items) => [...items, writeSource(source)]);
    setRedoStack([]);
  }
}

export function updateFeaturesAfterTransform(
  features: Feature<Geometry>[],
  refs: globalThis.Map<string, LayerBundle>,
  activeLayerId: string,
  layers: MapLayerState[],
  setActiveLayerFeatures: Dispatch<SetStateAction<Feature<Geometry>[]>>,
  setHistory: Dispatch<SetStateAction<GeoJSON.FeatureCollection[]>>,
  setRedoStack: Dispatch<SetStateAction<GeoJSON.FeatureCollection[]>>
) {
  const changedLayerIds = new Set(features.map((feature) => findFeatureLayerId(feature, refs)).filter(Boolean));
  if (!changedLayerIds.has(activeLayerId)) return;
  const source = refs.get(activeLayerId)?.source;
  if (!(source instanceof VectorSource)) return;
  setActiveLayerFeatures(source.getFeatures());
  if (changedLayerIds.size === 1 && layers.find((layer) => layer.id === activeLayerId)?.editable) {
    setHistory((items) => [...items, writeSource(source)]);
    setRedoStack([]);
  }
}

function normalizeTransformExtent(raw: number[]): [number, number, number, number] {
  let [minX, minY, maxX, maxY] = raw;
  const minSize = 24;
  const width = maxX - minX;
  const height = maxY - minY;
  if (width < minSize) {
    const padding = (minSize - width) / 2;
    minX -= padding;
    maxX += padding;
  }
  if (height < minSize) {
    const padding = (minSize - height) / 2;
    minY -= padding;
    maxY += padding;
  }
  return [minX, minY, maxX, maxY];
}
