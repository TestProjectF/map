"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Feature from "ol/Feature";
import Map from "ol/Map";
import View from "ol/View";
import { defaults as defaultControls, ScaleLine } from "ol/control";
import { Geometry } from "ol/geom";
import { defaults as defaultInteractions, Select } from "ol/interaction";
import TileLayer from "ol/layer/Tile";
import { unByKey } from "ol/Observable";
import VectorLayer from "ol/layer/Vector";
import { fromLonLat, toLonLat } from "ol/proj";
import OSM from "ol/source/OSM";
import VectorSource from "ol/source/Vector";

import { makeBoundingBoxStyle, makePickerHighlightStyle } from "@/lib/gis/styles";
import type { LayerBundle } from "@/lib/gis/types";

type UseOpenLayersMapOptions = {
  onFeatureSelect: (feature: Feature<Geometry> | null, additive?: boolean) => void;
};

export type FeaturePickerItem = {
  feature: Feature<Geometry>;
  label: string;
  geometryType: string;
};

export type FeaturePickerState = {
  pixel: [number, number];
  items: FeaturePickerItem[];
  additive: boolean;
} | null;

export function useOpenLayersMap({ onFeatureSelect }: UseOpenLayersMapOptions) {
  const mapElement = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const layerRefs = useRef<globalThis.Map<string, LayerBundle>>(new globalThis.Map());
  const bboxSourceRef = useRef<VectorSource<Feature<Geometry>> | null>(null);
  const pickerHighlightSourceRef = useRef<VectorSource<Feature<Geometry>> | null>(null);
  const pickerHighlightTimeoutRef = useRef<number | null>(null);
  const selectRef = useRef<Select | null>(null);
  const featurePickingEnabledRef = useRef(true);
  const [cursor, setCursor] = useState("105.85, 21.03");
  const [featurePicker, setFeaturePicker] = useState<FeaturePickerState>(null);

  const chooseFeature = useCallback((feature: Feature<Geometry>, additive = false) => {
    setFeaturePicker(null);
    onFeatureSelect(feature, additive);
  }, [onFeatureSelect]);

  const closeFeaturePicker = useCallback(() => {
    setFeaturePicker(null);
  }, []);

  const previewFeature = useCallback((feature: Feature<Geometry>) => {
    const geometry = feature.getGeometry();
    const source = pickerHighlightSourceRef.current;
    if (!geometry || !source) return;
    if (pickerHighlightTimeoutRef.current) window.clearTimeout(pickerHighlightTimeoutRef.current);
    source.clear();
    source.addFeature(new Feature<Geometry>(geometry.clone()));
    pickerHighlightTimeoutRef.current = window.setTimeout(() => {
      source.clear();
      pickerHighlightTimeoutRef.current = null;
    }, 1000);
  }, []);

  const setFeaturePickingEnabled = useCallback((enabled: boolean) => {
    featurePickingEnabledRef.current = enabled;
    if (!enabled) setFeaturePicker(null);
  }, []);

  useEffect(() => {
    if (!mapElement.current || mapRef.current) return;

    const bboxSource = new VectorSource<Feature<Geometry>>();
    bboxSourceRef.current = bboxSource;
    const bboxLayer = new VectorLayer({
      source: bboxSource,
      style: makeBoundingBoxStyle()
    });
    bboxLayer.set("selectable", false);
    bboxLayer.setZIndex(9999);
    const pickerHighlightSource = new VectorSource<Feature<Geometry>>();
    pickerHighlightSourceRef.current = pickerHighlightSource;
    const pickerHighlightLayer = new VectorLayer({
      source: pickerHighlightSource,
      style: makePickerHighlightStyle()
    });
    pickerHighlightLayer.set("selectable", false);
    pickerHighlightLayer.setZIndex(9998);

    const select = new Select({
      condition: () => false,
      filter: (_feature, layer) => layer?.get("selectable") !== false
    });
    selectRef.current = select;
    select.on("select", (event) => {
      onFeatureSelect((event.selected[0] as Feature<Geometry> | undefined) ?? null);
    });

    const map = new Map({
      target: mapElement.current,
      controls: defaultControls().extend([new ScaleLine()]),
      interactions: defaultInteractions().extend([select]),
      layers: [new TileLayer({ source: new OSM() }), pickerHighlightLayer, bboxLayer],
      view: new View({
        center: fromLonLat([105.85, 21.03]),
        zoom: 11
      })
    });

    const pointerKey = map.on("pointermove", (event) => {
      const [lon, lat] = toLonLat(event.coordinate);
      setCursor(`${lon.toFixed(6)}, ${lat.toFixed(6)}`);
    });
    const clickKey = map.on("singleclick", (event) => {
      if (!featurePickingEnabledRef.current || !selectRef.current?.getActive()) return;
      const originalEvent = event.originalEvent as MouseEvent;
      const additive = originalEvent.ctrlKey || originalEvent.metaKey;
      const features = selectableFeaturesAtPixel(map, event.pixel);
      if (features.length === 0) {
        setFeaturePicker(null);
        if (!additive) onFeatureSelect(null);
        return;
      }
      if (features.length === 1) {
        chooseFeature(features[0]!, additive);
        return;
      }
      setFeaturePicker({
        pixel: [event.pixel[0], event.pixel[1]],
        additive,
        items: features.map((feature, index) => ({
          feature,
          label: featurePickerLabel(feature, index),
          geometryType: feature.getGeometry()?.getType() ?? "Geometry"
        }))
      });
    });

    mapRef.current = map;

    return () => {
      unByKey(pointerKey);
      unByKey(clickKey);
      if (pickerHighlightTimeoutRef.current) window.clearTimeout(pickerHighlightTimeoutRef.current);
      map.setTarget(undefined);
      bboxSourceRef.current = null;
      pickerHighlightSourceRef.current = null;
      selectRef.current = null;
      mapRef.current = null;
    };
  }, [chooseFeature, onFeatureSelect]);

  return {
    mapElement,
    mapRef,
    layerRefs,
    bboxSourceRef,
    selectRef,
    cursor,
    featurePicker,
    chooseFeature,
    previewFeature,
    closeFeaturePicker,
    setFeaturePickingEnabled
  };
}

function selectableFeaturesAtPixel(map: Map, pixel: number[]) {
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

function featurePickerLabel(feature: Feature<Geometry>, index: number) {
  const props = feature.getProperties();
  const name = props.name ?? props.Name ?? props.id ?? props.ID ?? props.MAP_CAD_type ?? props.MAP_CAD_layer;
  const geometryType = feature.getGeometry()?.getType() ?? "Geometry";
  return `${index + 1}. ${name ? String(name) : geometryType}`;
}
