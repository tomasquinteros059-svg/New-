"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { sendMagicLink, type LoginState } from "./actions";

const INITIAL: LoginState = { status: "idle" };

function SubmitButton({ sent }: { sent: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? "Enviando…" : sent ? "Enviar otro enlace" : "Enviarme el enlace"}
    </button>
  );
}

export function LoginForm({ volver }: { volver: string }) {
  const [state, formAction] = useActionState(sendMagicLink, INITIAL);

  if (state.status === "sent") {
    return (
      <div className="space-y-5">
        <div className="rounded-card border border-free/25 bg-free-soft p-5">
          <h2 className="font-display text-lg font-semibold text-free">Revisá tu correo</h2>
          <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-ink-soft">
            Le mandamos un enlace a <span className="font-semibold text-ink">{state.email}</span>.
            Abrilo desde este mismo teléfono. Vence en una hora.
          </p>
        </div>
        <form action={formAction}>
          <input type="hidden" name="volver" value={volver} />
          <input type="hidden" name="email" value={state.email ?? ""} />
          <SubmitButton sent />
        </form>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="volver" value={volver} />

      <div className="space-y-2">
        <label htmlFor="email" className="label">
          Correo
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          required
          defaultValue={state.email}
          placeholder="vos@empresa.cl"
          className="field"
          aria-describedby={state.status === "error" ? "login-error" : undefined}
          aria-invalid={state.status === "error"}
        />
      </div>

      {state.status === "error" && state.message ? (
        <p
          id="login-error"
          role="alert"
          className="rounded-card border border-high/25 bg-high-soft px-4 py-3 text-[0.9375rem] leading-relaxed text-high"
        >
          {state.message}
        </p>
      ) : null}

      <SubmitButton sent={false} />

      <p className="pt-1 text-center text-sm leading-relaxed text-muted">
        No hay contraseña. Te llega un enlace y listo.
      </p>
    </form>
  );
}
