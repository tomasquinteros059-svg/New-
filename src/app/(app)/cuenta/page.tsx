import { requireSession } from "@/lib/auth/dal";
import { CuentaForm } from "./cuenta-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { PushToggle } from "@/components/push-toggle";
import { signOut } from "./actions";

export const metadata = { title: "Cuenta · Relevo" };

export default async function CuentaPage() {
  const { email, profile } = await requireSession();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-ink">Cuenta</h1>
        <p className="mt-1 text-[0.9375rem] text-ink-soft">{email}</p>
      </header>

      <CuentaForm fullName={profile.full_name} isPresent={profile.is_present} />

      <div className="border-t border-line pt-5">
        <PushToggle />
      </div>

      <div className="border-t border-line pt-5">
        <ThemeToggle />
      </div>

      <div className="border-t border-line pt-5">
        <dl className="space-y-2 text-[0.9375rem]">
          <div className="flex justify-between">
            <dt className="text-muted">Rol</dt>
            <dd className="font-medium text-ink">
              {profile.role === "supervisor" ? "Supervisor" : "Trabajador"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Tope de tareas activas</dt>
            <dd className="font-medium text-ink">{profile.active_task_limit}</dd>
          </div>
        </dl>
        <p className="mt-2.5 text-sm leading-relaxed text-muted">
          El rol y el tope los cambia un supervisor. No podés cambiarlos vos, ni acá ni
          consultando la API directamente.
        </p>
      </div>

      <form action={signOut} className="border-t border-line pt-5">
        <button type="submit" className="btn-quiet w-full">
          Cerrar sesión
        </button>
      </form>
    </div>
  );
}
