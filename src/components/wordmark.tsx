export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden
        className="flex h-8 w-8 items-center justify-center rounded-[0.5rem] bg-brand-900"
      >
        {/* Dos barras: el relevo, una tarea que pasa de una mano a otra. */}
        <span className="block h-3 w-[3px] rounded-full bg-signal" />
        <span className="ml-[3px] block h-3 w-[3px] rounded-full bg-brand-300" />
      </span>
      <span
        className={`font-display font-bold tracking-tight text-brand-900 ${
          compact ? "text-base" : "text-lg"
        }`}
      >
        Relevo
      </span>
    </div>
  );
}
