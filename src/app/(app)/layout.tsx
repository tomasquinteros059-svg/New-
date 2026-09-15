import Link from "next/link";
import { requireSession } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/nav";
import { Wordmark } from "@/components/wordmark";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireSession();
  const isSupervisor = profile.role === "supervisor";

  // El contador de avisos sin ver es lo que hace que el rescate sirva: un aviso
  // que solo se ve entrando a su pantalla no avisa nada.
  let pendientes = 0;
  if (isSupervisor) {
    const supabase = await createClient();
    const { count } = await supabase
      .from("alerts")
      .select("*", { count: "exact", head: true })
      .is("acknowledged_at", null);
    pendientes = count ?? 0;
  }

  const items = [
    { href: "/mis-tareas", label: "Mis tareas" },
    { href: "/disponibles", label: "Disponibles" },
    ...(isSupervisor
      ? [
          { href: "/equipo", label: "Equipo" },
          { href: "/control", label: "Control", badge: pendientes },
        ]
      : []),
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-md items-center justify-between px-5 py-2.5">
          <Wordmark compact />
          <Link
            href="/cuenta"
            className="-mr-2 flex min-h-11 items-center gap-2 rounded-pill px-3 transition-colors hover:bg-sunken"
          >
            <span
              aria-hidden
              className={`h-2 w-2 rounded-full ${profile.is_present ? "bg-free" : "bg-line-strong"}`}
            />
            <span className="text-sm font-medium text-ink-soft">
              {profile.full_name.split(" ")[0]}
            </span>
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-5 pt-5 pb-28">{children}</main>

      <Nav items={items} />
    </div>
  );
}
