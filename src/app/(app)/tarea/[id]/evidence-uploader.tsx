"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Banner } from "@/components/banner";

const MAX_BYTES = 25 * 1024 * 1024;

/** Nombre de archivo seguro para una ruta de Storage. */
function safeName(name: string) {
  const cleaned = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(-80);
  return cleaned || "archivo";
}

/**
 * Sube el archivo a Storage y después lo registra con attach_evidence.
 *
 * Son dos pasos y pueden romperse en el medio. Si el registro falla, el archivo
 * queda huérfano en el bucket pero NO cuenta como evidencia: la verdad es la
 * fila en task_evidence, no el archivo. Es el lado seguro para fallar — lo
 * contrario dejaría cerrar tareas con evidencia que no está.
 */
export function EvidenceUploader({ taskId }: { taskId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);

    if (file.size > MAX_BYTES) {
      setError("El archivo pasa los 25 MB. Sacá la foto con menos resolución.");
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const path = `${taskId}/${crypto.randomUUID()}-${safeName(file.name)}`;

      const { error: uploadError } = await supabase.storage
        .from("evidence")
        .upload(path, file, { contentType: file.type || undefined, upsert: false });

      if (uploadError) {
        setError("No pudimos subir el archivo. Probá de nuevo.");
        return;
      }

      const { data, error: rpcError } = await supabase.rpc("attach_evidence", {
        p_task_id: taskId,
        p_path: path,
        p_mime: file.type || undefined,
        p_size: file.size,
      });

      if (rpcError || !data?.ok) {
        setError("El archivo subió pero no quedó registrado. Probá de nuevo.");
        return;
      }

      if (inputRef.current) inputRef.current.value = "";
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  const working = busy || pending;

  return (
    <div className="space-y-3">
      {/*
        Encabezado, no <label>: dos labels sobre el mismo input hacen que el
        lector de pantalla anuncie los dos textos pegados. El label es el botón.
      */}
      <p className="label">Evidencia</p>

      {/*
        El input nativo se oculta y el botón es una <label>: el texto del botón
        nativo lo pone el navegador en SU idioma ("Choose File"), no en el de la
        página, y acá la gente lee en español.
      */}
      <input
        ref={inputRef}
        id="evidence"
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        disabled={working}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
        className="sr-only"
      />

      <label
        htmlFor="evidence"
        aria-disabled={working}
        className={`btn-quiet w-full cursor-pointer ${working ? "pointer-events-none opacity-55" : ""}`}
      >
        {working ? "Subiendo…" : "Sacar foto o elegir archivo"}
      </label>

      <p className="text-sm leading-relaxed text-muted">
        Esta tarea no se cierra sin una foto o un archivo tuyo. Si ya hay
        evidencia de un intento anterior, no cuenta. Hasta 25 MB.
      </p>

      {error ? <Banner tone="bad">{error}</Banner> : null}
    </div>
  );
}
