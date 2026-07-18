import { type Dispatch, type SetStateAction } from "react";
import { ArrowLeft } from "lucide-react";
import Feature from "ol/Feature";
import { Geometry } from "ol/geom";

import { FeaturePropertiesPanel } from "../panels/FeaturePropertiesPanel";
import { Panel } from "../panels/Panel";
import { LayerPath } from "../LayerPath";
import type { SidebarOption } from "../types";

export type SelectedFeatureInfo = {
  label: string;
  geometryType: string;
  layerName: string;
  datasetName: string;
  pathSegments: string[];
};

export function FeatureDetailTab({
  selectedFeature,
  selectedFeatureInfos,
  properties,
  newKey,
  newValue,
  setNewKey,
  setNewValue,
  applyProperties,
  addProperty,
  setActiveOption,
  onClose
}: {
  selectedFeature: Feature<Geometry> | null;
  selectedFeatureInfos: SelectedFeatureInfo[];
  properties: Record<string, unknown>;
  newKey: string;
  newValue: string;
  setNewKey: Dispatch<SetStateAction<string>>;
  setNewValue: Dispatch<SetStateAction<string>>;
  applyProperties: (next: Record<string, unknown>) => void;
  addProperty: () => void;
  setActiveOption: Dispatch<SetStateAction<SidebarOption | null>>;
  onClose: () => void;
}) {
  return (
    <Panel
      title={selectedFeatureInfos.length > 1 ? "Multi feature detail" : "Chi tiết feature"}
      onClose={onClose}
      action={
        <button className="grid h-8 w-8 place-items-center rounded-md border border-[#cbd5cf] bg-white hover:bg-[#edf2ef]" title="Quay lại feature" onClick={() => setActiveOption("features")}>
          <ArrowLeft size={16} />
        </button>
      }
    >
      {selectedFeatureInfos.length === 1 && selectedFeature && (
        <div className="space-y-2">
          <div className="rounded-md border border-[#d9e0dc] bg-white px-2 py-1">
            <LayerPath segments={selectedFeatureInfos[0].pathSegments} />
          </div>
          <FeaturePropertiesPanel
            properties={properties}
            newKey={newKey}
            newValue={newValue}
            setNewKey={setNewKey}
            setNewValue={setNewValue}
            applyProperties={applyProperties}
            addProperty={addProperty}
          />
        </div>
      )}
      {selectedFeatureInfos.length > 1 && (
        <div className="space-y-3">
          <div className="rounded-md bg-[#e7f1ee] px-3 py-2 text-sm font-medium text-[#0f5f58]">
            Đã chọn {selectedFeatureInfos.length} feature
          </div>
          <div className="max-h-[calc(100vh-180px)] space-y-1.5 overflow-y-auto pr-1">
            {selectedFeatureInfos.map((item, index) => (
              <div key={`${item.layerName}-${item.label}-${index}`} className="rounded-md border border-[#d9e0dc] bg-white px-2 py-1.5 text-sm">
                <div className="truncate font-semibold leading-5 text-[#26352d]">{index + 1}. {item.label}</div>
                <div className="truncate text-xs leading-4 text-[#718078]">{item.geometryType}</div>
                <LayerPath segments={item.pathSegments} />
              </div>
            ))}
          </div>
        </div>
      )}
      {selectedFeatureInfos.length === 0 && <div className="rounded-md bg-white px-3 py-4 text-sm text-[#617169]">Chưa chọn feature.</div>}
    </Panel>
  );
}
