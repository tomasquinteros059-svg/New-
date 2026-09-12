export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-card border border-dashed border-line-strong bg-sunken/50 px-5 py-10 text-center">
      <p className="font-display text-[1.0625rem] font-semibold text-ink-soft">{title}</p>
      {children ? (
        <div className="mx-auto mt-2 max-w-[32ch] text-[0.9375rem] leading-relaxed text-muted">
          {children}
        </div>
      ) : null}
    </div>
  );
}
