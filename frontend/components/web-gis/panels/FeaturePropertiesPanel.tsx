import { type Dispatch, type SetStateAction } from "react";
import { Trash2 } from "lucide-react";

import { propertyMetadata } from "@/lib/gis/propertyMetadata";

export function FeaturePropertiesPanel({
  properties,
  newKey,
  newValue,
  setNewKey,
  setNewValue,
  applyProperties,
  addProperty
}: {
  properties: Record<string, unknown>;
  newKey: string;
  newValue: string;
  setNewKey: Dispatch<SetStateAction<string>>;
  setNewValue: Dispatch<SetStateAction<string>>;
  applyProperties: (next: Record<string, unknown>) => void;
  addProperty: () => void;
}) {
  return (
    <div className="mt-3 space-y-2 rounded-md border border-[#b8c8c0] bg-[#f9fbfa] p-3">
      <div className="text-sm font-semibold">Thuộc tính feature</div>
      {Object.entries(properties).length === 0 && <div className="rounded-md bg-white px-3 py-2 text-sm text-[#617169]">Feature chưa có thuộc tính.</div>}
      {Object.entries(properties).map(([key, value]) => {
        const metadata = propertyMetadata(key);
        return (
          <div key={key} className="grid grid-cols-[minmax(118px,154px)_minmax(0,1fr)_36px] gap-2">
            <div className="min-w-0 rounded-md bg-white px-2 py-1.5" title={`${metadata.label}\n${metadata.description}\nKey: ${key}`}>
              <div className="truncate text-sm font-medium text-[#223029]">{metadata.label}</div>
              <div className="truncate text-[11px] text-[#6d7b73]">{key}</div>
            </div>
            <input className="min-w-0 rounded-md border border-[#c4cec8] bg-white px-2 py-2 text-sm" value={String(value ?? "")} onChange={(event) => applyProperties({ ...properties, [key]: event.target.value })} />
            <button
              className="rounded-md border border-[#c4cec8] bg-white"
              title="Xóa thuộc tính"
              onClick={() => {
                const next = { ...properties };
                delete next[key];
                applyProperties(next);
              }}
            >
              <Trash2 size={15} className="mx-auto" />
            </button>
          </div>
        );
      })}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_36px] gap-2">
        <input className="min-w-0 rounded-md border border-[#c4cec8] bg-white px-2 py-2 text-sm" placeholder="key" value={newKey} onChange={(event) => setNewKey(event.target.value)} />
        <input className="min-w-0 rounded-md border border-[#c4cec8] bg-white px-2 py-2 text-sm" placeholder="value" value={newValue} onChange={(event) => setNewValue(event.target.value)} />
        <button className="rounded-md bg-accent text-white" onClick={addProperty}>+</button>
      </div>
    </div>
  );
}
