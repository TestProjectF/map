import { MapPin } from "lucide-react";

import type { AdminProvince, AdminWard } from "@/hooks/useAdminNavigation";
import { Panel } from "../panels/Panel";

export function NavigateTab({
  provinces,
  provinceWards,
  selectedProvinceCode,
  selectedWardCode,
  selectedProvince,
  selectedWard,
  loading,
  error,
  selectProvince,
  setSelectedWardCode,
  goToAdminArea,
  onClose
}: {
  provinces: AdminProvince[];
  provinceWards: AdminWard[];
  selectedProvinceCode: string;
  selectedWardCode: string;
  selectedProvince: AdminProvince | null;
  selectedWard: AdminWard | null;
  loading: boolean;
  error: string;
  selectProvince: (code: string) => void;
  setSelectedWardCode: (code: string) => void;
  goToAdminArea: () => void;
  onClose: () => void;
}) {
  const targetLabel = selectedWard ? `${selectedWard.type} ${selectedWard.name}` : selectedProvince?.name ?? "";

  return (
    <Panel title="Đi tới" onClose={onClose}>
      {loading && <div className="rounded-md bg-[#e7f1ee] px-3 py-2 text-sm text-[#0f5f58]">Đang tải danh sách...</div>}
      {error && <div className="rounded-md bg-[#fee7e2] px-3 py-2 text-sm text-[#8a2719]">{error}</div>}
      <div className="space-y-3 rounded-md border border-[#d9e0dc] bg-white p-3">
        <label className="space-y-1.5 text-sm">
          <span className="font-medium text-[#3d4a43]">Tỉnh/thành</span>
          <select
            className="w-full rounded-md border border-[#c4cec8] bg-white px-3 py-2 text-sm"
            disabled={loading || provinces.length === 0}
            value={selectedProvinceCode}
            onChange={(event) => selectProvince(event.target.value)}
          >
            {provinces.map((province) => (
              <option key={province.code} value={province.code}>
                {province.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="font-medium text-[#3d4a43]">Phường/xã</span>
          <select
            className="w-full rounded-md border border-[#c4cec8] bg-white px-3 py-2 text-sm"
            disabled={loading || !selectedProvinceCode}
            value={selectedWardCode}
            onChange={(event) => setSelectedWardCode(event.target.value)}
          >
            <option value="">Tâm tỉnh/thành</option>
            {provinceWards.map((ward) => (
              <option key={ward.code} value={ward.code}>
                {ward.type} {ward.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-[#9aa8a2]"
          disabled={loading || Boolean(error) || !selectedProvince}
          onClick={goToAdminArea}
          type="button"
        >
          <MapPin size={16} />
          {targetLabel || "Đi tới"}
        </button>
      </div>
    </Panel>
  );
}
