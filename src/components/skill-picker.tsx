import Link from "next/link";
import type { Skill } from "@/lib/types";

/**
 * Selector de habilidades.
 *
 * Casillas y no un desplegable múltiple: en un teléfono, un `select multiple`
 * es de lo peor que hay para tocar con el pulgar, y acá la lista es corta.
 */
export function SkillPicker({
  skills,
  selected,
  label,
  help,
  emptyHref,
}: {
  skills: Skill[];
  selected: Set<string>;
  label: string;
  help: string;
  /** A dónde mandar si todavía no hay catálogo. */
  emptyHref?: string;
}) {
  if (skills.length === 0) {
    return (
      <div className="space-y-2">
        <span className="label">{label}</span>
        <p className="rounded-card border border-dashed border-line-strong px-4 py-3.5 text-sm leading-relaxed text-muted">
          Todavía no hay habilidades cargadas.{" "}
          {emptyHref ? (
            <Link href={emptyHref} className="font-medium text-brand-700 underline-offset-4 hover:underline">
              Crear la primera
            </Link>
          ) : null}
        </p>
      </div>
    );
  }

  return (
    <fieldset className="space-y-2">
      <legend className="label">{label}</legend>

      <div className="flex flex-wrap gap-2">
        {skills.map((skill) => (
          <label
            key={skill.id}
            className="relative inline-flex min-h-11 cursor-pointer items-center rounded-pill border border-line-strong bg-surface px-4 text-[0.9375rem] font-medium text-ink-soft transition-colors has-checked:border-brand-500 has-checked:bg-brand-50 has-checked:text-brand-700"
          >
            <input
              type="checkbox"
              name="skill_id"
              value={skill.id}
              defaultChecked={selected.has(skill.id)}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
            {skill.name}
          </label>
        ))}
      </div>

      <p className="text-sm leading-relaxed text-muted">{help}</p>
    </fieldset>
  );
}
