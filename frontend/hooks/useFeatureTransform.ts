"use client";

import { type Dispatch, type MutableRefObject, type SetStateAction, useEffect, useRef } from "react";
import Feature from "ol/Feature";
import { getCenter } from "ol/extent";
import { Geometry } from "ol/geom";
import PointerInteraction from "ol/interaction/Pointer";
import Select from "ol/interaction/Select";
import Map from "ol/Map";
import { unByKey } from "ol/Observable";
import type { EventsKey } from "ol/events";
import VectorSource from "ol/source/Vector";

import {
  activeCorner,
  angle,
  featuresExtent,
  findSelectableFeaturesAtPixel,
  findTransformHandleAtPixel,
  isAnySelectedFeatureAtPixel,
  oppositeCorner,
  scaleCursor,
  scalesOnX,
  scalesOnY,
  toTransformExtent,
  updateBoundingBoxForFeatures,
  updateFeaturesAfterTransform,
} from "@/lib/gis/transform";
import type { LayerBundle, TransformDragState, TransformHandle } from "@/lib/gis/types";
import type { SidebarOption } from "@/components/web-gis/types";
import type { MapLayerState, ToolMode } from "@/types/gis";

type UseFeatureTransformOptions = {
  mapRef: MutableRefObject<Map | null>;
  layerRefs: MutableRefObject<globalThis.Map<string, LayerBundle>>;
  bboxSourceRef: MutableRefObject<VectorSource<Feature<Geometry>> | null>;
  selectRef: MutableRefObject<Select | null>;
  selectedFeatures: Feature<Geometry>[];
  selectedFeaturesRef: MutableRefObject<Feature<Geometry>[]>;
  activeLayerIdRef: MutableRefObject<string>;
  layersRef: MutableRefObject<MapLayerState[]>;
  tool: ToolMode;
  toolRef: MutableRefObject<ToolMode>;
  replaceSelectedFeatures: (features: Feature<Geometry>[]) => void;
  setActiveLayerFeatures: Dispatch<SetStateAction<Feature<Geometry>[]>>;
  setHistory: Dispatch<SetStateAction<GeoJSON.FeatureCollection[]>>;
  setRedoStack: Dispatch<SetStateAction<GeoJSON.FeatureCollection[]>>;
  setActiveOption: Dispatch<SetStateAction<SidebarOption | null>>;
  disabled?: boolean;
};

export function useFeatureTransform({
  mapRef,
  layerRefs,
  bboxSourceRef,
  selectRef,
  selectedFeatures,
  selectedFeaturesRef,
  activeLayerIdRef,
  layersRef,
  tool,
  toolRef,
  replaceSelectedFeatures,
  setActiveLayerFeatures,
  setHistory,
  setRedoStack,
  setActiveOption,
  disabled = false
}: UseFeatureTransformOptions) {
  const transformDragRef = useRef<TransformDragState | null>(null);
  const pointerKeyRef = useRef<EventsKey | null>(null);

  useEffect(() => {
    selectRef.current?.setActive(tool === "select" && !disabled);
    if (tool !== "select" || disabled) {
      selectRef.current?.getFeatures().clear();
      mapRef.current?.getTargetElement().style.removeProperty("cursor");
    }
  }, [disabled, mapRef, selectRef, tool]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const transformInteraction = new PointerInteraction({
      handleDownEvent: (event) => {
        if (disabled || toolRef.current !== "select") return false;
        const originalEvent = event.originalEvent as PointerEvent;
        if (originalEvent.ctrlKey || originalEvent.metaKey) return false;
        const handleFeature = findTransformHandleAtPixel(map, event.pixel);
        const handle = handleFeature?.get("transformHandle") as TransformHandle | undefined;
        let features = selectedFeaturesRef.current;
        if (!handle) {
          const featuresAtPixel = findSelectableFeaturesAtPixel(map, event.pixel);
          const selectedFeatureAtPixel = features.find((feature) => featuresAtPixel.includes(feature)) ?? null;
          if (featuresAtPixel.length > 1 && !selectedFeatureAtPixel) return false;
          if (!selectedFeatureAtPixel) {
            const featureAtPixel = featuresAtPixel[0];
            if (!featureAtPixel) return false;
            replaceSelectedFeatures([featureAtPixel]);
            setActiveOption((current) => (current === "draw" ? current : "feature-detail"));
            return true;
          }
          features = selectedFeaturesRef.current;
          setActiveOption((current) => (current === "draw" ? current : "feature-detail"));
        }
        if (features.length === 0) return false;

        const coordinate = event.coordinate as [number, number];
        const extent = toTransformExtent(featuresExtent(features) ?? []);
        if (!extent) return false;
        const center = getCenter(extent) as [number, number];
        const initialGeometries = features.flatMap((feature) => {
          const geometry = feature.getGeometry();
          return geometry ? [{ feature, geometry: geometry.clone() }] : [];
        });
        if (initialGeometries.length === 0) return false;
        if (handle) {
          const anchor = handle === "rotate" ? center : oppositeCorner(handle, extent);
          const initialActiveCorner = handle === "rotate" ? coordinate : activeCorner(handle, extent);
          transformDragRef.current = {
            mode: handle === "rotate" ? "rotate" : "scale",
            handle,
            initialGeometries,
            anchor,
            initialActiveCorner,
            startCoordinate: coordinate,
            initialVector: [initialActiveCorner[0] - anchor[0], initialActiveCorner[1] - anchor[1]],
            initialAngle: angle(anchor, coordinate),
            changed: false
          };
          map.getTargetElement().style.cursor = handle === "rotate" ? "grabbing" : scaleCursor(handle);
          return true;
        }

        transformDragRef.current = {
          mode: "translate",
          initialGeometries,
          anchor: center,
          initialActiveCorner: coordinate,
          startCoordinate: coordinate,
          initialVector: [0, 0],
          initialAngle: 0,
          changed: false
        };
        map.getTargetElement().style.cursor = "grabbing";
        return true;
      },
      handleDragEvent: (event) => {
        if (disabled || toolRef.current !== "select") return;
        const drag = transformDragRef.current;
        if (!drag) return;

        const coordinate = event.coordinate as [number, number];
        for (const item of drag.initialGeometries) {
          const next = item.geometry.clone();
          if (drag.mode === "translate") {
            next.translate(coordinate[0] - drag.startCoordinate[0], coordinate[1] - drag.startCoordinate[1]);
          } else if (drag.mode === "rotate") {
            next.rotate(angle(drag.anchor, coordinate) - drag.initialAngle, drag.anchor);
          } else {
            const targetCorner: [number, number] = [
              drag.initialActiveCorner[0] + coordinate[0] - drag.startCoordinate[0],
              drag.initialActiveCorner[1] + coordinate[1] - drag.startCoordinate[1]
            ];
            const nextVector: [number, number] = [targetCorner[0] - drag.anchor[0], targetCorner[1] - drag.anchor[1]];
            const sx = scalesOnX(drag.handle) && drag.initialVector[0] !== 0 ? nextVector[0] / drag.initialVector[0] : 1;
            const sy = scalesOnY(drag.handle) && drag.initialVector[1] !== 0 ? nextVector[1] / drag.initialVector[1] : 1;
            next.scale(sx, sy, drag.anchor);
          }
          item.feature.setGeometry(next);
        }
        drag.changed = true;
        if (bboxSourceRef.current) updateBoundingBoxForFeatures(bboxSourceRef.current, drag.initialGeometries.map((item) => item.feature));
      },
      handleMoveEvent: (event) => {
        const target = map.getTargetElement();
        if (disabled || toolRef.current !== "select") {
          target.style.cursor = "";
          return;
        }
        const handle = findTransformHandleAtPixel(map, event.pixel)?.get("transformHandle") as TransformHandle | undefined;
        const features = selectedFeaturesRef.current;
        if (handle === "rotate") {
          target.style.cursor = "grab";
        } else if (handle) {
          target.style.cursor = scaleCursor(handle);
        } else if (features.length > 0 && isAnySelectedFeatureAtPixel(map, event.pixel, features)) {
          target.style.cursor = "move";
        } else {
          target.style.cursor = "";
        }
      },
      handleUpEvent: () => {
        const drag = transformDragRef.current;
        if (drag?.changed) updateFeaturesAfterTransform(drag.initialGeometries.map((item) => item.feature), layerRefs.current, activeLayerIdRef.current, layersRef.current, setActiveLayerFeatures, setHistory, setRedoStack);
        transformDragRef.current = null;
        map.getTargetElement().style.cursor = "";
        return false;
      },
      stopDown: (handled) => handled
    });
    map.addInteraction(transformInteraction);
    pointerKeyRef.current = transformInteraction.on("change:active", () => undefined);

    return () => {
      map.removeInteraction(transformInteraction);
      if (pointerKeyRef.current) unByKey(pointerKeyRef.current);
      pointerKeyRef.current = null;
    };
  }, [activeLayerIdRef, bboxSourceRef, disabled, layerRefs, layersRef, mapRef, replaceSelectedFeatures, selectRef, selectedFeaturesRef, setActiveLayerFeatures, setActiveOption, setHistory, setRedoStack, toolRef]);

  useEffect(() => {
    const source = bboxSourceRef.current;
    if (!source) return;
    source.clear();
    if (disabled || selectedFeatures.length === 0 || tool !== "select") return;

    updateBoundingBoxForFeatures(source, selectedFeatures);
    const keys = selectedFeatures.flatMap((feature) => {
      const geometry = feature.getGeometry();
      return geometry ? [geometry.on("change", () => updateBoundingBoxForFeatures(source, selectedFeatures))] : [];
    });
    return () => {
      for (const key of keys) unByKey(key);
      source.clear();
    };
  }, [bboxSourceRef, disabled, selectedFeatures, tool]);
}
