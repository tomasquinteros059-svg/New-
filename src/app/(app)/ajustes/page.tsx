import Link from "next/link";
import { requireSupervisor } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { AjustesForm } from "./ajustes-form";
import { Banner } from "@/components/banner";
import type { AppSettings } from "@/lib/types";

export const metadata = { title: "Ajustes · Relevo" };

export default async function AjustesPage() {
  await requireSupervisor();

  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("*").maybeSingle<AppSettings>();

  if (!data) {
    return (
      <div className="space-y-5">
        <h1 className="font-display text-2xl font-bold text-ink">Ajustes</h1>
        <Banner tone="bad">
          No pudimos leer la configuración. Revisá que las migraciones estén aplicadas.
        </Banner>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-ink">Ajustes</h1>
        <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink-soft">
          Cuánto puede esperar el trabajo antes de que la app avise.
        </p>
      </header>

      <AjustesForm settings={data} />

      <p className="rounded-card border border-line bg-sunken/60 px-4 py-3.5 text-sm leading-relaxed text-muted">
        Los avisos los genera un barrido que corre cada quince minutos dentro de la base de
        datos. Cambiar estos números no dispara nada al instante: el próximo barrido usa
        los valores nuevos.
      </p>

      <Link href="/control" className="btn-quiet w-full">
        Volver a Control
      </Link>
    </div>
  );
}
