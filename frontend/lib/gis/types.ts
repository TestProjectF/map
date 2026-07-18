import Feature from "ol/Feature";
import { Geometry } from "ol/geom";
import VectorLayer from "ol/layer/Vector";
import ImageLayer from "ol/layer/Image";
import VectorSource from "ol/source/Vector";
import ImageSource from "ol/source/Image";
import Static from "ol/source/ImageStatic";
import LayerGroup from "ol/layer/Group";

import WebGLTileLayer from "ol/layer/WebGLTile";
import GeoTIFF from "ol/source/GeoTIFF";

export type LayerBundle = {
  layer: VectorLayer<VectorSource<Feature<Geometry>>> | WebGLTileLayer | ImageLayer<ImageSource> | LayerGroup;
  source: VectorSource<Feature<Geometry>> | GeoTIFF | Static;
};

export type TransformHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "rotate";

export type TransformDragState = {
  mode: "scale" | "rotate" | "translate";
  handle?: TransformHandle;
  initialGeometries: Array<{ feature: Feature<Geometry>; geometry: Geometry }>;
  anchor: [number, number];
  initialActiveCorner: [number, number];
  startCoordinate: [number, number];
  initialVector: [number, number];
  initialAngle: number;
  changed: boolean;
};
