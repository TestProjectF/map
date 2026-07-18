"use client";

import { type Dispatch, type MutableRefObject, type SetStateAction, useCallback, useRef, useState } from "react";
import Feature from "ol/Feature";
import Map from "ol/Map";
import { Geometry } from "ol/geom";
import Select from "ol/interaction/Select";
import VectorSource from "ol/source/Vector";

import { cleanProperties } from "@/lib/gis/geojson";
import type { SidebarOption } from "@/components/web-gis/types";

type UseFeatureSelectionOptions = {
  mapRef: MutableRefObject<Map | null>;
  selectRef: MutableRefObject<Select | null>;
  bboxSourceRef: MutableRefObject<VectorSource<Feature<Geometry>> | null>;
  setActiveOption: Dispatch<SetStateAction<SidebarOption | null>>;
};

export function useFeatureSelection({ mapRef, selectRef, bboxSourceRef, setActiveOption }: UseFeatureSelectionOptions) {
  const selectedFeaturesRef = useRef<Feature<Geometry>[]>([]);
  const selectedFeatureRef = useRef<Feature<Geometry> | null>(null);
  const [selectedFeatures, setSelectedFeatures] = useState<Feature<Geometry>[]>([]);
  const selectedFeature = selectedFeatures.at(-1) ?? null;
  const [properties, setProperties] = useState<Record<string, unknown>>({});
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [activeLayerFeatures, setActiveLayerFeatures] = useState<Feature<Geometry>[]>([]);

  const replaceSelectedFeatures = useCallback((features: Feature<Geometry>[], openDetails = true) => {
    const uniqueFeatures = [...new Set(features)];
    const primaryFeature = uniqueFeatures.at(-1) ?? null;
    selectedFeaturesRef.current = uniqueFeatures;
    selectedFeatureRef.current = primaryFeature;
    setSelectedFeatures(uniqueFeatures);
    setProperties(uniqueFeatures.length === 1 && primaryFeature ? cleanProperties(primaryFeature.getProperties()) : {});
    const collection = selectRef.current?.getFeatures();
    collection?.clear();
    if (uniqueFeatures.length > 0) collection?.extend(uniqueFeatures);
    if (openDetails && primaryFeature) setActiveOption((current) => (current === "draw" ? current : "feature-detail"));
  }, [selectRef, setActiveOption]);

  const receiveSelectedFeature = useCallback((feature: Feature<Geometry> | null, additive = false) => {
    if (!feature) {
      replaceSelectedFeatures([]);
      return;
    }
    if (!additive) {
      replaceSelectedFeatures([feature]);
      return;
    }
    const current = selectedFeaturesRef.current;
    replaceSelectedFeatures(current.includes(feature) ? current.filter((item) => item !== feature) : [...current, feature]);
  }, [replaceSelectedFeatures]);

  const selectFeature = useCallback((feature: Feature<Geometry>, shouldZoom = false) => {
    replaceSelectedFeatures([feature]);
    if (shouldZoom) {
      const geometry = feature.getGeometry();
      if (geometry) mapRef.current?.getView().fit(geometry.getExtent(), { padding: [80, 80, 80, 80], maxZoom: 19, duration: 180 });
    }
  }, [mapRef, replaceSelectedFeatures]);

  const selectFeatureFromList = useCallback((feature: Feature<Geometry>, additive = false) => {
    if (additive) receiveSelectedFeature(feature, true);
    else selectFeature(feature, true);
  }, [receiveSelectedFeature, selectFeature]);

  const zoomToFeature = useCallback((feature: Feature<Geometry>) => {
    replaceSelectedFeatures([feature], false);
    const geometry = feature.getGeometry();
    if (geometry) mapRef.current?.getView().fit(geometry.getExtent(), { padding: [80, 80, 80, 80], maxZoom: 19, duration: 180 });
  }, [mapRef, replaceSelectedFeatures]);

  const editFeature = useCallback((feature: Feature<Geometry>) => {
    selectFeature(feature);
    setActiveOption("feature-detail");
  }, [selectFeature, setActiveOption]);

  const clearSelectedFeature = useCallback(() => {
    replaceSelectedFeatures([]);
    bboxSourceRef.current?.clear();
    mapRef.current?.getTargetElement().style.removeProperty("cursor");
  }, [bboxSourceRef, mapRef, replaceSelectedFeatures]);

  const applyProperties = useCallback((next: Record<string, unknown>) => {
    setProperties(next);
    const feature = selectedFeatureRef.current;
    if (!feature) return;
    const geometry = feature.getGeometry();
    feature.setProperties(next, true);
    if (geometry) feature.setGeometry(geometry);
    setActiveLayerFeatures((features) => [...features]);
  }, []);

  const addProperty = useCallback(() => {
    const key = newKey.trim();
    if (!key) return;
    applyProperties({ ...properties, [key]: newValue });
    setNewKey("");
    setNewValue("");
  }, [applyProperties, newKey, newValue, properties]);

  return {
    selectedFeatures,
    selectedFeaturesRef,
    selectedFeature,
    selectedFeatureRef,
    replaceSelectedFeatures,
    properties,
    setProperties,
    newKey,
    newValue,
    setNewKey,
    setNewValue,
    activeLayerFeatures,
    setActiveLayerFeatures,
    receiveSelectedFeature,
    selectFeatureFromList,
    zoomToFeature,
    editFeature,
    clearSelectedFeature,
    applyProperties,
    addProperty
  };
}
