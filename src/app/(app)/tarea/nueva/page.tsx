import { requireSupervisor } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { NuevaTareaForm } from "./nueva-form";
import { PageHeader } from "@/components/page-header";
import { TIME_ZONE } from "@/lib/format";

export const metadata = { title: "Crear tarea · Relevo" };

export default async function NuevaTareaPage() {
  await requireSupervisor();

  const supabase = await createClient();
  const { data: skills } = await supabase.from("skills").select("*").order("name");

  return (
    <div className="space-y-6">
      <PageHeader title="Crear tarea" backHref="/disponibles" backLabel="Cola">
        Entra a la cola como disponible. Cualquiera la puede tomar.
      </PageHeader>

      <NuevaTareaForm timeZone={TIME_ZONE} skills={skills ?? []} />
    </div>
  );
}
