import { LoginForm } from "./login-form";
import { Wordmark } from "@/components/wordmark";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ volver?: string; error?: string }>;
}) {
  // Next.js 16: searchParams es una promesa. La versión síncrona fue removida.
  const { volver = "", error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-12">
      <header className="mb-10">
        <Wordmark />
        <h1 className="mt-6 font-display text-[1.75rem] leading-tight font-bold text-ink">
          Entrá a tu cola
        </h1>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-soft">
          Lo que tenés que hacer hoy, y lo que está libre para tomar.
        </p>
      </header>

      {error ? (
        <p
          role="alert"
          className="mb-5 rounded-card border border-high/25 bg-high-soft px-4 py-3 text-[0.9375rem] leading-relaxed text-high"
        >
          {error === "expirado"
            ? "Ese enlace ya venció. Pedí uno nuevo."
            : "No pudimos validar el enlace. Pedí uno nuevo."}
        </p>
      ) : null}

      <LoginForm volver={volver} />
    </main>
  );
}
