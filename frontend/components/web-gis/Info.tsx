export function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-2 text-sm">
      <div className="text-[#617169]">{label}</div>
      <div className="min-w-0 truncate font-medium">{value}</div>
    </div>
  );
}
