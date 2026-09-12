"use server";

import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site";

export type LoginState = {
  status: "idle" | "sent" | "error";
  message?: string;
  email?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function sendMagicLink(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const volver = String(formData.get("volver") ?? "");

  if (!EMAIL_RE.test(email)) {
    return { status: "error", message: "Esa dirección de correo no es válida.", email };
  }

  const supabase = await createClient();
  const site = await getSiteUrl();

  const next = volver.startsWith("/") && !volver.startsWith("//") ? volver : "/mis-tareas";
  const redirectTo = `${site}/auth/callback?volver=${encodeURIComponent(next)}`;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo,
      // Registro cerrado: las cuentas las crea el supervisor. Sin esto,
      // cualquiera que sepa la URL se crea un usuario.
      shouldCreateUser: false,
    },
  });

  if (error) {
    // Supabase responde "Signups not allowed for otp" cuando el correo no tiene
    // cuenta. Lo traducimos a algo accionable.
    const notRegistered =
      error.message.toLowerCase().includes("signups not allowed") ||
      error.message.toLowerCase().includes("user not found");

    if (notRegistered) {
      return {
        status: "error",
        email,
        message: "Ese correo no tiene cuenta. Pedile al supervisor que te la cree.",
      };
    }

    if (error.status === 429) {
      return {
        status: "error",
        email,
        message: "Pediste demasiados enlaces seguidos. Esperá un minuto.",
      };
    }

    return { status: "error", email, message: "No pudimos enviar el enlace. Probá de nuevo." };
  }

  return { status: "sent", email };
}
