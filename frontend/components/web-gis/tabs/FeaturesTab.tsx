import { type Dispatch, type SetStateAction } from "react";
import { ArrowLeft, Edit3, Trash2, ZoomIn } from "lucide-react";
import Feature from "ol/Feature";
import { Geometry } from "ol/geom";

import type { MapLayerState } from "@/types/gis";
import { LayerPath } from "../LayerPath";
import { Panel } from "../panels/Panel";
import type { SidebarOption } from "../types";

export function FeaturesTab({
  activeLayer,
  activeLayerFeatures,
  selectedFeatures,
  setActiveOption,
  selectFeatureFromList,
  zoomToFeature,
  editFeature,
  deleteFeature,
  onClose
}: {
  activeLayer: MapLayerState | null;
  activeLayerFeatures: Feature<Geometry>[];
  selectedFeatures: Feature<Geometry>[];
  setActiveOption: Dispatch<SetStateAction<SidebarOption | null>>;
  selectFeatureFromList: (feature: Feature<Geometry>, additive?: boolean) => void;
  zoomToFeature: (feature: Feature<Geometry>) => void;
  editFeature: (feature: Feature<Geometry>) => void;
  deleteFeature: (layerId: string, feature: Feature<Geometry>, featureIndex: number) => void;
  onClose: () => void;
}) {
  return (
    <Panel
      title={activeLayer ? "Danh sách feature" : "Feature"}
      onClose={onClose}
      action={
        <button className="grid h-8 w-8 place-items-center rounded-md border border-[#cbd5cf] bg-white hover:bg-[#edf2ef]" title="Quay lại layer" onClick={() => setActiveOption("layers")}>
          <ArrowLeft size={16} />
        </button>
      }
    >
      {!activeLayer && <div className="rounded-md bg-white px-3 py-4 text-sm text-[#5c6b63]">Chưa chọn layer.</div>}
      {activeLayer && (
        <div className="space-y-2">
          <div className="rounded-md border border-[#d9e0dc] bg-white px-2 py-1.5">
            <LayerPath segments={[activeLayer.name]} />
          </div>
          {activeLayerFeatures.length === 0 && <div className="rounded-md bg-white px-3 py-4 text-sm text-[#617169]">Layer này chưa có feature.</div>}
          <div className="max-h-[calc(100vh-150px)] space-y-2 overflow-y-auto pr-1">
            {activeLayerFeatures.map((feature, index) => (
              <div
                key={feature.getId()?.toString() ?? `${activeLayer.id}-${index}`}
                className={`rounded-md border bg-white p-2 ${selectedFeatures.includes(feature) ? "border-accent" : "border-[#d9e0dc]"}`}
              >
                <div className="flex items-center gap-2">
                  <button className="min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm font-medium hover:bg-[#edf2ef]" onClick={(event) => selectFeatureFromList(feature, event.ctrlKey || event.metaKey)}>
                    {featureLabel(feature, index)}
                  </button>
                  <button type="button" className="grid h-8 w-8 shrink-0 place-items-center rounded-md hover:bg-[#edf2ef]" title="Zoom vào feature" onClick={() => zoomToFeature(feature)}>
                    <ZoomIn size={16} />
                  </button>
                  <button className="grid h-8 w-8 shrink-0 place-items-center rounded-md hover:bg-[#edf2ef]" title="Sửa thuộc tính" onClick={() => editFeature(feature)}>
                    <Edit3 size={16} />
                  </button>
                  <button
                    type="button"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-md hover:bg-[#edf2ef]"
                    title="Xóa feature"
                    aria-label={`Xóa ${featureLabel(feature, index)}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      deleteFeature(activeLayer.id, feature, index);
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}

function featureLabel(feature: Feature<Geometry>, index: number) {
  const props = cleanProperties(feature.getProperties());
  const name = props.name ?? props.Name ?? props.id ?? props.ID;
  const geometryType = feature.getGeometry()?.getType() ?? "Geometry";
  return `${index + 1}. ${name ? String(name) : geometryType}`;
}

function cleanProperties(raw: Record<string, unknown>) {
  const props = { ...raw };
  delete props.geometry;
  return props;
}
