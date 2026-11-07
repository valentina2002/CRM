/** Loading state shown while a page's data streams in (title stays visible). */
export function PageSkeleton({ title }: { title: string }) {
  return (
    <div aria-busy="true">
      <h1 className="mb-5 text-[22px] font-bold tracking-[-.01em]">{title}</h1>
      <div className="grid gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-[10px] border bg-card" />
        ))}
      </div>
    </div>
  );
}
