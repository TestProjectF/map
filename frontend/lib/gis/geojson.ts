import GeoJSONFormat from "ol/format/GeoJSON";
import Feature from "ol/Feature";
import { Geometry } from "ol/geom";
import VectorSource from "ol/source/Vector";

import type { MapLayerState } from "@/types/gis";
import type { LayerBundle } from "./types";
import { mapProperties } from "./systemProperties";

export const geojsonFormat = new GeoJSONFormat();

export function cleanProperties(raw: Record<string, unknown>) {
  const props = { ...raw };
  delete props.geometry;
  return props;
}

export function writeSource(source: VectorSource<Feature<Geometry>>): GeoJSON.FeatureCollection {
  return geojsonFormat.writeFeaturesObject(source.getFeatures(), {
    dataProjection: "EPSG:4326",
    featureProjection: "EPSG:3857"
  }) as GeoJSON.FeatureCollection;
}

export function mergeDrawingLayers(layers: MapLayerState[], refs: globalThis.Map<string, LayerBundle>): GeoJSON.FeatureCollection {
  return mergeMapLayers(
    layers.filter((layer) => layer.kind === "drawing"),
    refs,
    "drawing-layers"
  );
}

export function mergeMapLayers(layers: MapLayerState[], refs: globalThis.Map<string, LayerBundle>, name = "merged-layers"): GeoJSON.FeatureCollection {
  const features = layers.flatMap((layer) => {
    const source = refs.get(layer.id)?.source;
    if (!(source instanceof VectorSource)) return [];
    const collection = writeSource(source);
    return collection.features.map((feature) => ({
      ...feature,
      properties: {
        ...(feature.properties ?? {}),
        [mapProperties.sourceLayer]: layer.name,
        [mapProperties.sourceLayerId]: layer.id,
        [mapProperties.sourceLayerKind]: layer.kind,
        [mapProperties.sourceDatasetId]: layer.datasetId,
        [mapProperties.sourceDatasetLayerId]: layer.sourceLayerId,
        [mapProperties.sourceCategory]: layer.sourceCategory,
        [mapProperties.georeferenceStatus]: layer.georeferenceStatus
      }
    }));
  });
  return {
    type: "FeatureCollection",
    metadata: {
      name,
      layerField: mapProperties.sourceLayer,
      layers: layers.map((layer) => ({
        id: layer.id,
        name: layer.name,
        kind: layer.kind,
        datasetId: layer.datasetId,
        sourceLayerId: layer.sourceLayerId,
        sourceCategory: layer.sourceCategory,
        featureCount: layer.featureCount,
        georeferenceStatus: layer.georeferenceStatus
      }))
    },
    features
  } as GeoJSON.FeatureCollection;
}
