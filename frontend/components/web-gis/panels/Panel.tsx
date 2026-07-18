import { type ReactNode } from "react";
import { X } from "lucide-react";

export function Panel({ title, action, onClose, children }: { title: string; action?: ReactNode; onClose: () => void; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex min-h-8 items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[#536158]">{title}</h2>
        <div className="flex items-center gap-2">
          {action}
          <button className="grid h-8 w-8 place-items-center rounded-md border border-[#cbd5cf] bg-white hover:bg-[#edf2ef]" title="Đóng panel" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}
