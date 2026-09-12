import { requireSession } from "@/lib/auth/dal";
import { Nav } from "@/components/nav";
import { Wordmark } from "@/components/wordmark";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireSession();
  const isSupervisor = profile.role === "supervisor";

  const items = [
    { href: "/mis-tareas", label: "Mis tareas" },
    ...(isSupervisor ? [{ href: "/equipo", label: "Equipo" }] : []),
    { href: "/cuenta", label: "Cuenta" },
  ];

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-md items-center justify-between px-5 py-3.5">
          <Wordmark compact />
          <span className="flex items-center gap-2">
            <span
              aria-hidden
              className={`h-2 w-2 rounded-full ${profile.is_present ? "bg-free" : "bg-line-strong"}`}
            />
            <span className="text-sm font-medium text-ink-soft">
              {profile.full_name.split(" ")[0]}
            </span>
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-5 py-6">{children}</main>

      <Nav items={items} />
    </div>
  );
}
