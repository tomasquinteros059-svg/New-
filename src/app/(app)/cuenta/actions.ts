"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/dal";

export type ProfileState = { status: "idle" | "ok" | "error"; message?: string };

export async function updateProfile(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const { userId } = await requireSession();

  const fullName = String(formData.get("full_name") ?? "").trim();
  const isPresent = formData.get("is_present") === "on";

  if (fullName.length < 2 || fullName.length > 80) {
    return { status: "error", message: "El nombre tiene que tener entre 2 y 80 caracteres." };
  }

  const supabase = await createClient();

  // Solo full_name e is_present. El rol y el límite los bloquea un trigger en
  // la base de datos, no esta lista.
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName, is_present: isPresent })
    .eq("id", userId);

  if (error) {
    return { status: "error", message: "No pudimos guardar los cambios. Probá de nuevo." };
  }

  revalidatePath("/", "layout");
  return { status: "ok", message: "Guardado." };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
