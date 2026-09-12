import Link from "next/link";
import { requireSupervisor } from "@/lib/auth/dal";
import { NuevaTareaForm } from "./nueva-form";
import { TIME_ZONE } from "@/lib/format";

export const metadata = { title: "Crear tarea · Relevo" };

export default async function NuevaTareaPage() {
  await requireSupervisor();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-ink">Crear tarea</h1>
        <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink-soft">
          Entra a la cola como disponible. Cualquiera la puede tomar.
        </p>
      </header>

      <NuevaTareaForm timeZone={TIME_ZONE} />

      <Link href="/disponibles" className="btn-quiet w-full">
        Cancelar
      </Link>
    </div>
  );
}
