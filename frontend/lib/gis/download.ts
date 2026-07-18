import { sanitizeFileName } from "./filenames";

export function downloadGeojson(fileName: string, geojson: GeoJSON.FeatureCollection) {
  const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: "application/geo+json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = sanitizeFileName(fileName);
  link.click();
  URL.revokeObjectURL(url);
}
