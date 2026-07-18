export type SourceCategory = "gis" | "cad" | "unknown";

export type GeometryType =
  | "Point"
  | "MultiPoint"
  | "LineString"
  | "MultiLineString"
  | "Polygon"
  | "MultiPolygon"
  | "Mixed"
  | "Unknown";

export interface DatasetWarning {
  code: string;
  message: string;
  severity: "info" | "warning" | "error";
}

export interface LayerMetadata {
  id: string;
  name: string;
  geometryType: GeometryType;
  featureCount: number | null;
  crs: string | null;
  bbox: [number, number, number, number] | null;
  editable: boolean;
  propertiesSchema: Record<string, string>;
  extra: Record<string, unknown>;
}

export interface NormalizedDataset {
  id: string;
  originalFileName: string;
  detectedFormat: string;
  sourceCategory: SourceCategory;
  readable: boolean;
  crs: string | null;
  bbox: [number, number, number, number] | null;
  layers: LayerMetadata[];
  warnings: DatasetWarning[];
  extra: Record<string, unknown>;
}

export type UploadDatasetResponse = {
  fileId: string;
  dataset: NormalizedDataset;
};

export type ConvertResponse = {
  previewUrl: string;
  sourceCrs: string | null;
  targetCrs: string;
  featureCount: number;
  truncated: boolean;
  rasterPreviewUrl?: string;
  rasterOverviewUrl?: string;
  rasterBbox?: [number, number, number, number];
};

export type PreviewLayerResponse = {
  layerId: string | null;
  layerName: string;
  previewUrl: string;
  sourceCrs: string | null;
  targetCrs: string;
  featureCount: number;
  truncated: boolean;
};

export type BatchPreviewResponse = {
  status: "completed";
  layers: PreviewLayerResponse[];
  rasterPreviewUrl?: string;
  rasterOverviewUrl?: string;
  rasterBbox?: [number, number, number, number];
};

export type MapLayerState = {
  id: string;
  datasetId: string | null;
  datasetName: string | null;
  sourceLayerId: string | null;
  sourceCategory: SourceCategory | null;
  name: string;
  kind: "uploaded" | "drawing" | "uploaded-raster";
  visible: boolean;
  opacity: number;
  editable: boolean;
  style: LayerStyle;
  featureCount: number;
  georeferenceStatus?: "referenced" | "local" | "fitting" | "accepted";
};

export type LayerStyle = {
  stroke: string;
  fill: string;
};

export type ToolMode =
  | "select"
  | "draw-point"
  | "draw-line"
  | "draw-polygon"
  | "draw-rectangle"
  | "draw-circle"
  | "draw-freehand"
  | "modify"
  | "delete";
