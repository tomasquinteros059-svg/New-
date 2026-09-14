import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSupervisor } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { MiembroForm } from "./miembro-form";
import { Banner } from "@/components/banner";
import type { Profile } from "@/lib/types";

export const metadata = { title: "Persona · Relevo" };

export default async function MiembroPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await requireSupervisor();

  const supabase = await createClient();
  const { data: person } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle<Profile>();

  if (!person) redirect("/equipo");

  return (
    <div className="space-y-6">
      <header>
        <p className="label">Persona</p>
        <h1 className="mt-1.5 font-display text-2xl leading-tight font-bold text-ink">
          {person.full_name}
        </h1>
        <p className="mt-1 text-[0.9375rem] text-ink-soft">
          {person.is_present ? "En turno" : "Fuera de turno"}
        </p>
      </header>

      {person.id === userId ? (
        <Banner tone="info">
          Sos vos. Si te sacás el rol de supervisor perdés esta pantalla, y la app no te va
          a dejar hacerlo si sos el único que queda.
        </Banner>
      ) : null}

      <MiembroForm person={person} />

      <p className="rounded-card border border-line bg-sunken/60 px-4 py-3.5 text-sm leading-relaxed text-muted">
        El nombre y la presencia los maneja cada uno desde su propia pantalla de Cuenta.
        Desde acá solo se cambian el rol y el tope.
      </p>

      <Link href="/equipo" className="btn-quiet w-full">
        Volver al equipo
      </Link>
    </div>
  );
}
