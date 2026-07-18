export const SYSTEM_PROPERTY_PREFIX = "MAP_";
export const CAD_PROPERTY_NAMESPACE = "CAD_";

export function systemProperty(name: string) {
  return `${SYSTEM_PROPERTY_PREFIX}${name}`;
}

export function cadProperty(name: string) {
  return systemProperty(`${CAD_PROPERTY_NAMESPACE}${name}`);
}

export const mapProperties = {
  sourceLayer: systemProperty("sourceLayer"),
  sourceLayerId: systemProperty("sourceLayerId"),
  sourceLayerKind: systemProperty("sourceLayerKind"),
  sourceDatasetId: systemProperty("sourceDatasetId"),
  sourceDatasetLayerId: systemProperty("sourceDatasetLayerId"),
  sourceCategory: systemProperty("sourceCategory"),
  georeferenceStatus: systemProperty("georeferenceStatus"),
  cadLayer: cadProperty("layer"),
  cadType: cadProperty("type"),
  cadText: cadProperty("text"),
  cadTextHeight: cadProperty("text_height"),
  cadRotation: cadProperty("rotation")
} as const;
