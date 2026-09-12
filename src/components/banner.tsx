const TONE = {
  info: "border-brand-300/60 bg-brand-50 text-brand-900",
  good: "border-free/25 bg-free-soft text-free",
  warn: "border-medium/25 bg-medium-soft text-medium",
  bad: "border-high/25 bg-high-soft text-high",
} as const;

export function Banner({
  tone = "info",
  children,
}: {
  tone?: keyof typeof TONE;
  children: React.ReactNode;
}) {
  return (
    <p
      role="status"
      className={`rounded-card border px-4 py-3 text-[0.9375rem] leading-relaxed ${TONE[tone]}`}
    >
      {children}
    </p>
  );
}
