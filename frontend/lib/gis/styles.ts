import Feature, { FeatureLike } from "ol/Feature";
import { Geometry, MultiPoint, Point } from "ol/geom";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from "ol/style";

import type { MapLayerState } from "@/types/gis";
import type { TransformHandle } from "./types";
import { mapProperties } from "./systemProperties";

const CAD_POINT_MIN_ZOOM = 18;
const CAD_POINT_MAX_RESOLUTION = 156543.03392804097 / 2 ** CAD_POINT_MIN_ZOOM;
const CAD_TEXT_TYPES = new Set(["TEXT", "MTEXT", "ATTRIB", "ATTDEF"]);

export function createVectorLayer(state: MapLayerState, source: VectorSource<Feature<Geometry>>) {
  return new VectorLayer({
    source,
    visible: state.visible,
    opacity: state.opacity,
    style: makeStyle(state),
    updateWhileAnimating: false,
    updateWhileInteracting: false,
  });
}

export function makeBoundingBoxStyle() {
  return (feature: FeatureLike) => {
    const handle = feature.get("transformHandle") as TransformHandle | undefined;
    if (handle) {
      return new Style({
        image: new CircleStyle({
          radius: handle === "rotate" ? 7 : 6,
          stroke: new Stroke({ color: "#ffffff", width: 2 }),
          fill: new Fill({ color: handle === "rotate" ? "#2563eb" : "#f97316" })
        })
      });
    }

    if (feature.get("transformGuide")) {
      return new Style({
        stroke: new Stroke({ color: "#2563eb", lineDash: [4, 4], width: 1.5 })
      });
    }

    return new Style({
      stroke: new Stroke({
        color: "#f97316",
        lineDash: [8, 5],
        width: 2
      }),
      fill: new Fill({ color: "rgba(249, 115, 22, 0.08)" })
    });
  };
}

export function makeAdminHighlightStyle() {
  return [
    new Style({
      stroke: new Stroke({ color: "rgba(17, 24, 39, 0.75)", width: 8 }),
      fill: new Fill({ color: "rgba(236, 72, 153, 0.12)" })
    }),
    new Style({
      stroke: new Stroke({ color: "#ec4899", width: 4 }),
      fill: new Fill({ color: "rgba(236, 72, 153, 0.10)" })
    })
  ];
}

export function makePickerHighlightStyle() {
  return makeAdminHighlightStyle();
}

export function makeStyle(state: MapLayerState) {
  return (feature: FeatureLike, resolution: number) => {
    const geometry = feature.getGeometry();
    const isPoint = geometry instanceof Point || geometry instanceof MultiPoint;
    const cadType = feature.get(mapProperties.cadType);
    const cadText = feature.get(mapProperties.cadText);
    const isCadText = state.sourceCategory === "cad" && CAD_TEXT_TYPES.has(String(cadType)) && typeof cadText === "string" && cadText.trim() !== "";

    if (isCadText) {
      if (resolution > CAD_POINT_MAX_RESOLUTION) return undefined;
      return makeCadTextStyle(feature, state);
    }

    if (state.sourceCategory === "cad" && isPoint && resolution > CAD_POINT_MAX_RESOLUTION) return undefined;
    if (state.sourceCategory === "cad" && cadType === "HATCH" && resolution > CAD_POINT_MAX_RESOLUTION) return undefined;
    return new Style({
      stroke: new Stroke({ color: state.style.stroke, width: 2 }),
      fill: new Fill({ color: withAlpha(state.style.fill, 0.32) }),
      image: isPoint
        ? new CircleStyle({
            radius: 6,
            stroke: new Stroke({ color: state.style.stroke, width: 2 }),
            fill: new Fill({ color: withAlpha(state.style.fill, 0.75) })
          })
        : undefined
    });
  };
}

function makeCadTextStyle(feature: FeatureLike, state: MapLayerState) {
  const value = normalizeCadText(String(feature.get(mapProperties.cadText) ?? ""));
  const height = Number(feature.get(mapProperties.cadTextHeight));
  const rotation = Number(feature.get(mapProperties.cadRotation));
  const fontSize = Number.isFinite(height) ? Math.max(11, Math.min(22, height * 2)) : 13;

  return new Style({
    text: new Text({
      text: value,
      font: `${fontSize}px sans-serif`,
      rotation: Number.isFinite(rotation) ? -(rotation * Math.PI) / 180 : 0,
      rotateWithView: true,
      overflow: true,
      fill: new Fill({ color: state.style.stroke }),
      stroke: new Stroke({ color: "rgba(255, 255, 255, 0.9)", width: 3 }),
      textAlign: "left",
      offsetX: 2
    })
  });
}

function normalizeCadText(value: string) {
  return value
    .replace(/\\P/gi, "\n")
    .replace(/%%d/gi, "°")
    .replace(/%%p/gi, "±")
    .replace(/%%c/gi, "Ø");
}

function withAlpha(hex: string, alpha: number) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
