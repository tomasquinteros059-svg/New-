import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import type { TaskEvidence } from "@/lib/types";

/**
 * La evidencia de una tarea.
 *
 * El bucket es privado, así que cada archivo se sirve con una URL firmada de
 * cinco minutos. Nada de URLs públicas adivinables: una foto de una avería
 * puede mostrar una instalación, una patente o la cara de alguien.
 */
export async function EvidenceList({ taskId }: { taskId: string }) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("task_evidence")
    .select("*")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });

  const items: TaskEvidence[] = data ?? [];
  if (items.length === 0) return null;

  const { data: signed } = await supabase.storage
    .from("evidence")
    .createSignedUrls(
      items.map((i) => i.storage_path),
      300,
    );

  const urlByPath = new Map<string, string>();
  for (const entry of signed ?? []) {
    if (entry.signedUrl && entry.path) urlByPath.set(entry.path, entry.signedUrl);
  }

  return (
    <section className="space-y-3">
      <h2 className="label">
        Evidencia ({items.length})
      </h2>

      <ul className="grid grid-cols-2 gap-3">
        {items.map((item) => {
          const url = urlByPath.get(item.storage_path);
          const isImage = (item.mime_type ?? "").startsWith("image/");
          const name = item.storage_path.split("/").pop() ?? "archivo";

          return (
            <li key={item.id} className="card overflow-hidden">
              {url && isImage ? (
                <a href={url} target="_blank" rel="noreferrer" className="block">
                  {/*
                    <img> y no next/image: la URL está firmada y vence a los
                    cinco minutos, así que el optimizador de Next no puede
                    cachearla ni volver a pedirla.
                  */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Evidencia: ${name}`}
                    className="aspect-square w-full bg-sunken object-cover"
                    loading="lazy"
                  />
                </a>
              ) : (
                <div className="flex aspect-square items-center justify-center bg-sunken px-3 text-center text-sm text-muted">
                  {url ? (
                    <a href={url} target="_blank" rel="noreferrer" className="underline">
                      Abrir archivo
                    </a>
                  ) : (
                    "No disponible"
                  )}
                </div>
              )}
              <p className="px-3 py-2 text-xs text-muted">{formatDateTime(item.created_at)}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
