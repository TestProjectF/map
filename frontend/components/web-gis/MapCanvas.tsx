import { type RefObject } from "react";
import Feature from "ol/Feature";
import { Geometry } from "ol/geom";
import { Eye } from "lucide-react";

import type { FeaturePickerState } from "@/hooks/useOpenLayersMap";

export function MapCanvas({
  mapElement,
  cursor,
  featurePicker,
  chooseFeature,
  previewFeature,
  closeFeaturePicker
}: {
  mapElement: RefObject<HTMLDivElement | null>;
  cursor: string;
  featurePicker: FeaturePickerState;
  chooseFeature: (feature: Feature<Geometry>, additive?: boolean) => void;
  previewFeature: (feature: Feature<Geometry>) => void;
  closeFeaturePicker: () => void;
}) {
  return (
    <section className="relative min-w-0">
      <div ref={mapElement} className="h-full w-full" />
      {featurePicker && (
        <div
          className="absolute z-30 max-h-64 w-64 overflow-y-auto rounded-md border border-[#cbd5cf] bg-white p-1 text-sm shadow-xl"
          style={{ left: featurePicker.pixel[0] + 12, top: featurePicker.pixel[1] + 12 }}
        >
          <div className="flex items-center justify-between gap-2 px-2 py-1 text-xs font-semibold text-[#526158]">
            <span>{featurePicker.items.length} feature trùng vị trí</span>
            <button className="rounded px-1 text-[#6d7b73] hover:bg-[#edf2ef]" onClick={closeFeaturePicker} aria-label="Đóng danh sách feature">×</button>
          </div>
          <div className="space-y-1">
            {featurePicker.items.map((item, index) => (
              <div
                key={`${item.label}-${index}`}
                className="flex w-full min-w-0 items-center justify-between gap-2 rounded px-2 py-1.5 text-left hover:bg-[#edf2ef]"
                onClick={() => chooseFeature(item.feature, featurePicker.additive)}
                title={item.label}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") chooseFeature(item.feature, featurePicker.additive);
                }}
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-[#26352d]">{item.label}</div>
                  <div className="text-[11px] text-[#6d7b73]">{item.geometryType}</div>
                </div>
                <button
                  className="grid h-8 w-8 shrink-0 place-items-center rounded border border-[#cbd5cf] bg-white text-[#44544c] hover:bg-[#dff1ed]"
                  title="Highlight feature"
                  aria-label="Highlight feature"
                  onClick={(event) => {
                    event.stopPropagation();
                    previewFeature(item.feature);
                  }}
                >
                  <Eye size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-md border border-[#cfd7d2] bg-white/95 px-3 py-1.5 text-sm tabular-nums text-[#4a5a52] shadow-sm">
        {cursor}
      </div>
    </section>
  );
}
