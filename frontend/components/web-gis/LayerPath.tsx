export function LayerPath({ segments }: { segments: string[] }) {
  const items = segments.flatMap((segment) => segment.split("/")).map((segment) => segment.trim()).filter(Boolean);

  return (
    <div className="min-w-0 text-xs leading-4 text-[#34443b]">
      {items.map((item, index) => (
        <div key={`${item}-${index}`} className="flex min-w-0" style={{ paddingLeft: `${index * 12}px` }} title={item}>
          {index > 0 && <span className="mr-1 shrink-0 font-mono text-[#9aa6a0]">|___</span>}
          <span className={`truncate ${index === 0 ? "font-medium" : ""}`}>{item}</span>
        </div>
      ))}
    </div>
  );
}
