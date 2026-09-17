import * as React from "react";
import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";

import { Wordmark } from "@/components/wordmark";
import { Nav } from "@/components/nav";
import { PageHeader } from "@/components/page-header";
import { ActionGroup } from "@/components/action-group";
import { Fab } from "@/components/fab";
import { Banner } from "@/components/banner";
import { EmptyState } from "@/components/empty-state";
import { SearchBox } from "@/components/search-box";
import { Pager } from "@/components/pager";
import { TaskCard } from "@/components/task-card";
import { AvailableTaskCard } from "@/components/available-task-card";
import { TaskFacts } from "@/components/task-facts";
import { CapacityMeter } from "@/components/capacity-meter";
import { TeamRow } from "@/components/team-row";
import { TeamSummary } from "@/components/team-summary";
import { SkillPicker } from "@/components/skill-picker";
import { ThemeToggle } from "@/components/theme-toggle";
import { PRIORITY_CLASS, PRIORITY_LABEL, formatDateTime, timeAgo } from "@/lib/format";

import {
  CORTE_ESTANCADA, YO, aItemDeCola, avisos, equipo, habilidades, soltadas,
  tareasIniciales, yo, type TareaDemo,
} from "./datos";

const POR_PAGINA = 20;

type Rol = "worker" | "supervisor";

/* ========================================================================== */

export function App() {
  const ruta = usePathname();
  const router = useRouter();

  const [tareas, setTareas] = useState<TareaDemo[]>(tareasIniciales);
  const [rol, setRol] = useState<Rol>("worker");
  const [aviso, setAviso] = useState<string | null>(null);

  const misHabilidades = equipo.find((p) => p.id === YO)?.skills ?? [];
  const esSupervisor = rol === "supervisor";

  const mias = tareas.filter((t) => t.assignee_id === YO && t.status === "active");
  const disponibles = tareas.filter((t) => t.status === "available");

  function tomar(id: string) {
    const tarea = tareas.find((t) => t.id === id);
    if (!tarea) return;

    const faltan = tarea.required_skills.filter((h) => !misHabilidades.includes(h));
    if (faltan.length > 0) {
      setAviso(`No podés tomarla: te falta ${faltan.join(", ")}.`);
      return;
    }
    if (mias.length >= yo.active_task_limit) {
      setAviso(`Ya tenés ${mias.length} de ${yo.active_task_limit}. Cerrá alguna primero.`);
      return;
    }

    setTareas((xs) =>
      xs.map((t) =>
        t.id === id
          ? { ...t, status: "active", assignee_id: YO, assignment_kind: "claimed",
              assigned_at: new Date().toISOString() }
          : t,
      ),
    );
    setAviso(null);
    router.push("/mis-tareas");
  }

  function cerrar(id: string, nota: string) {
    setTareas((xs) =>
      xs.map((t) =>
        t.id === id
          ? { ...t, status: "closed", closed_at: new Date().toISOString(), closing_note: nota }
          : t,
      ),
    );
    router.push("/mis-tareas");
  }

  function soltar(id: string) {
    setTareas((xs) =>
      xs.map((t) =>
        t.id === id
          ? { ...t, status: "available", assignee_id: null, assignment_kind: null,
              assigned_at: null, available_since: new Date().toISOString() }
          : t,
      ),
    );
    router.push("/disponibles");
  }

  function crear(titulo: string, prioridad: TareaDemo["priority"]) {
    const nueva: TareaDemo = {
      id: `n${Date.now()}`, title: titulo, description: null, priority: prioridad,
      due_at: null, status: "available", requires_evidence: false, assignee_id: null,
      assignment_kind: null, assigned_at: null, available_since: new Date().toISOString(),
      closed_at: null, closing_note: null, cancelled_at: null, created_by: "p4",
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      required_skills: [],
    };
    setTareas((xs) => [nueva, ...xs]);
    router.push("/disponibles");
  }

  const destinos = [
    { href: "/mis-tareas", label: "Mis tareas" },
    { href: "/disponibles", label: "Disponibles" },
    ...(esSupervisor
      ? [
          { href: "/equipo", label: "Equipo" },
          { href: "/control", label: "Control", badge: avisos.length },
        ]
      : []),
  ];

  let pantalla: React.ReactNode;
  const detalle = ruta.match(/^\/tarea\/(.+)$/);

  if (detalle) {
    const tarea = tareas.find((t) => t.id === detalle[1]);
    pantalla = tarea ? (
      <Detalle
        tarea={tarea}
        esSupervisor={esSupervisor}
        misHabilidades={misHabilidades}
        aviso={aviso}
        onTomar={() => tomar(tarea.id)}
        onCerrar={(n) => cerrar(tarea.id, n)}
        onSoltar={() => soltar(tarea.id)}
      />
    ) : (
      <EmptyState title="Esta tarea ya no está" />
    );
  } else if (ruta.startsWith("/disponibles")) {
    pantalla = (
      <Cola
        tareas={disponibles}
        misHabilidades={misHabilidades}
        esSupervisor={esSupervisor}
        ruta={ruta}
      />
    );
  } else if (ruta.startsWith("/tarea-nueva")) {
    pantalla = <Nueva onCrear={crear} />;
  } else if (ruta.startsWith("/equipo")) {
    pantalla = <Equipo />;
  } else if (ruta.startsWith("/control")) {
    pantalla = <Control />;
  } else if (ruta.startsWith("/cuenta")) {
    pantalla = <Cuenta rol={rol} onRol={setRol} />;
  } else {
    pantalla = <MisTareas tareas={mias} aviso={aviso} />;
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-md items-center justify-between px-5 py-2.5">
          <Wordmark compact />
          <Link
            href="/cuenta"
            className="-mr-2 flex min-h-11 items-center gap-2 rounded-pill px-3 transition-colors hover:bg-sunken"
          >
            <span aria-hidden className="h-2 w-2 rounded-full bg-free" />
            <span className="text-sm font-medium text-ink-soft">
              {esSupervisor ? "Ana" : "Beto"}
            </span>
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-5 pt-5 pb-28">{pantalla}</main>

      <Nav items={destinos} />
    </div>
  );
}

/* ========================================================================== */

function MisTareas({ tareas, aviso }: { tareas: TareaDemo[]; aviso: string | null }) {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-ink">Mis tareas</h1>
        <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink-soft">
          {tareas.length === 0
            ? "No tenés nada activo ahora mismo."
            : `Tenés ${tareas.length} ${tareas.length === 1 ? "tarea activa" : "tareas activas"}.`}
        </p>
      </header>

      {aviso ? <Banner tone="warn">{aviso}</Banner> : null}

      <CapacityMeter used={tareas.length} limit={yo.active_task_limit} />

      {tareas.length === 0 ? (
        <EmptyState title="Sin tareas activas">
          Tomá algo de la cola de disponibles, o esperá a que el supervisor te asigne
          trabajo.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {tareas.map((t) => (
            <li key={t.id}>
              <TaskCard task={t} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Cola({
  tareas,
  misHabilidades,
  esSupervisor,
  ruta,
}: {
  tareas: TareaDemo[];
  misHabilidades: string[];
  esSupervisor: boolean;
  ruta: string;
}) {
  const busqueda = useMemo(() => {
    const i = ruta.indexOf("?");
    return i === -1 ? "" : (new URLSearchParams(ruta.slice(i + 1)).get("q") ?? "");
  }, [ruta]);

  const filtradas = tareas.filter(
    (t) =>
      !busqueda ||
      t.title.toLowerCase().includes(busqueda.toLowerCase()) ||
      (t.description ?? "").toLowerCase().includes(busqueda.toLowerCase()),
  );

  const ordenadas = [...filtradas].sort((a, b) => {
    const orden = { high: 3, medium: 2, low: 1 } as const;
    const va = new Date(a.available_since).getTime() < CORTE_ESTANCADA ? 1 : 0;
    const vb = new Date(b.available_since).getTime() < CORTE_ESTANCADA ? 1 : 0;
    if (va !== vb) return vb - va;
    return orden[b.priority] - orden[a.priority];
  });

  const estancadas = ordenadas.filter(
    (t) => new Date(t.available_since).getTime() < CORTE_ESTANCADA,
  ).length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-ink">Disponibles</h1>
        <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink-soft">
          {ordenadas.length === 0
            ? "No hay nada esperando en la cola."
            : `${ordenadas.length} ${ordenadas.length === 1 ? "tarea espera" : "tareas esperan"} que alguien las tome.`}
        </p>
      </header>

      <SearchBox q={busqueda} total={ordenadas.length} mostrando={ordenadas.length} />

      {estancadas > 0 ? (
        <Banner tone="warn">
          {estancadas === 1
            ? "Hay 1 tarea esperando hace más de 12 h. Está arriba de todo."
            : `Hay ${estancadas} tareas esperando hace más de 12 h. Están arriba de todo.`}
        </Banner>
      ) : null}

      {ordenadas.length === 0 ? (
        <EmptyState title={busqueda ? "Sin coincidencias" : "Cola vacía"}>
          {busqueda ? "Probá con otra palabra." : "Cuando el supervisor cargue trabajo, lo vas a ver acá."}
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {ordenadas.map((t) => {
            const item = aItemDeCola(t, misHabilidades, ordenadas.length);
            return (
              <li key={t.id}>
                <AvailableTaskCard
                  task={item}
                  stale={item.is_stale}
                  requiredSkills={item.required_skills}
                  meetsSkills={item.meets_skills}
                />
              </li>
            );
          })}
        </ul>
      )}

      <Pager page={1} pageSize={POR_PAGINA} total={ordenadas.length} q={busqueda} />

      {esSupervisor ? <Fab href="/tarea-nueva" label="Crear tarea" /> : null}
    </div>
  );
}

function Detalle({
  tarea,
  esSupervisor,
  misHabilidades,
  aviso,
  onTomar,
  onCerrar,
  onSoltar,
}: {
  tarea: TareaDemo;
  esSupervisor: boolean;
  misHabilidades: string[];
  aviso: string | null;
  onTomar: () => void;
  onCerrar: (nota: string) => void;
  onSoltar: () => void;
}) {
  const [nota, setNota] = useState("");
  const [soltando, setSoltando] = useState(false);
  const esMia = tarea.assignee_id === YO;
  const faltan = tarea.required_skills.filter((h) => !misHabilidades.includes(h));

  return (
    <div className="space-y-6">
      <PageHeader
        title={tarea.title}
        backHref={tarea.status === "available" ? "/disponibles" : "/mis-tareas"}
        backLabel={tarea.status === "available" ? "Cola" : "Mis tareas"}
      >
        <span className={`pill ${PRIORITY_CLASS[tarea.priority]}`}>
          Prioridad {PRIORITY_LABEL[tarea.priority].toLowerCase()}
        </span>
        {tarea.description ? (
          <p className="mt-3 whitespace-pre-line">{tarea.description}</p>
        ) : null}
      </PageHeader>

      {aviso ? <Banner tone="warn">{aviso}</Banner> : null}

      <TaskFacts task={tarea} isMine={esMia} />

      {tarea.required_skills.length > 0 ? (
        <section className="space-y-2">
          <h2 className="label">Habilidades que pide</h2>
          <div className="flex flex-wrap gap-2">
            {tarea.required_skills.map((n) => (
              <span
                key={n}
                className={`pill ${faltan.includes(n) ? "bg-high-soft text-high" : "bg-free-soft text-free"}`}
              >
                {n}
                {faltan.includes(n) ? " · te falta" : ""}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {tarea.status === "available" && faltan.length > 0 ? (
        <Banner tone="warn">
          No podés tomar esta tarea: te falta {faltan.join(", ")}. Pedile al supervisor que
          te agregue la habilidad.
        </Banner>
      ) : null}

      {tarea.status === "available" && faltan.length === 0 ? (
        <button type="button" onClick={onTomar} className="btn-primary">
          Tomar esta tarea
        </button>
      ) : null}

      {tarea.status === "active" && esMia ? (
        <section className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="nota" className="label">
              Qué hiciste
            </label>
            <textarea
              id="nota"
              rows={3}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Una línea alcanza. Ej: cambié el rodamiento, quedó sin ruido."
              className="field resize-y"
            />
            <p className="text-sm leading-relaxed text-muted">
              Queda en el historial. Es lo que va a leer el que agarre esto después.
            </p>
          </div>

          <button
            type="button"
            onClick={() => onCerrar(nota)}
            disabled={nota.trim().length < 3}
            className="btn-primary"
          >
            Cerrar tarea
          </button>

          {soltando ? (
            <div className="card space-y-4 p-4">
              <p className="label">Por qué la soltás</p>
              <textarea rows={3} className="field resize-y" placeholder="Ej: me falta la llave de 32." />
              <button
                type="button"
                onClick={onSoltar}
                className="btn-quiet w-full border-medium/40 text-medium"
              >
                Soltar y devolver a la cola
              </button>
              <button
                type="button"
                onClick={() => setSoltando(false)}
                className="w-full py-1 text-center text-sm font-medium text-muted"
              >
                Mejor no
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setSoltando(true)} className="btn-quiet w-full">
              No puedo con esta
            </button>
          )}
        </section>
      ) : null}

      {esSupervisor && (tarea.status === "available" || tarea.status === "active") ? (
        <ActionGroup label="Como supervisor">
          <span className="btn-quiet">
            {tarea.status === "available" ? "Asignar" : "Pasar a otro"}
          </span>
          <span className="btn-quiet">Editar</span>
        </ActionGroup>
      ) : null}
    </div>
  );
}

function Nueva({ onCrear }: { onCrear: (t: string, p: TareaDemo["priority"]) => void }) {
  const [titulo, setTitulo] = useState("");
  const [prioridad, setPrioridad] = useState<TareaDemo["priority"]>("medium");

  return (
    <div className="space-y-6">
      <PageHeader title="Crear tarea" backHref="/disponibles" backLabel="Cola">
        Entra a la cola como disponible. Cualquiera la puede tomar.
      </PageHeader>

      <div className="space-y-2">
        <label htmlFor="titulo" className="label">
          Qué hay que hacer
        </label>
        <input
          id="titulo"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Ej: revisar bomba 3 del sector norte"
          className="field"
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="label">Prioridad</legend>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ["low", "Baja"],
              ["medium", "Media"],
              ["high", "Alta"],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => setPrioridad(v)}
              aria-pressed={prioridad === v}
              className={`min-h-11 rounded-card border py-3 font-display text-[0.9375rem] font-semibold transition-colors ${
                prioridad === v
                  ? "border-signal bg-signal-soft text-signal"
                  : "border-line-strong bg-surface text-ink-soft"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </fieldset>

      <SkillPicker
        skills={habilidades}
        selected={new Set()}
        label="Habilidades que exige"
        help="Sin ninguna, la puede tomar cualquiera."
      />

      <button
        type="button"
        onClick={() => onCrear(titulo.trim(), prioridad)}
        disabled={titulo.trim().length < 3}
        className="btn-primary"
      >
        Crear y mandar a la cola
      </button>
    </div>
  );
}

function Equipo() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-ink">Equipo</h1>
        <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink-soft">
          Quién tiene lugar y quién no da más.
        </p>
      </header>

      <TeamSummary team={equipo} />

      <ul className="space-y-3">
        {equipo.map((p) => (
          <li key={p.id}>
            <TeamRow person={p} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Control() {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-2xl font-bold text-ink">Control</h1>
        <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink-soft">
          Lo que se está quedando atrás, y lo que la gente devuelve.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="font-display text-lg font-semibold text-ink">
          Rescate
          <span className="ml-2 align-middle text-sm font-semibold text-signal">
            {avisos.length} sin ver
          </span>
        </h2>

        <ul className="space-y-3">
          {avisos.map((a) => (
            <li
              key={a.id}
              className={`rounded-card border p-4 ${
                a.type === "stale_active"
                  ? "border-high/25 bg-high-soft"
                  : "border-medium/30 bg-medium-soft"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <span
                  className={`font-display text-sm font-semibold ${
                    a.type === "stale_active" ? "text-high" : "text-medium"
                  }`}
                >
                  {a.type === "stale_active" ? "Nadie la cierra" : "Nadie la toma"}
                </span>
                <span className={`pill shrink-0 ${PRIORITY_CLASS[a.priority]}`}>
                  {PRIORITY_LABEL[a.priority]}
                </span>
              </div>
              <Link
                href={`/tarea/${a.task_id}`}
                className="mt-1.5 block font-display text-[1.0625rem] leading-snug font-semibold text-ink"
              >
                {a.title}
              </Link>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                {a.type === "stale_available"
                  ? `En la cola ${timeAgo(a.stale_since)}, y el umbral son ${a.threshold_hours} h.`
                  : `La tiene ${a.assignee_name}, ${timeAgo(a.stale_since)}, y el umbral son ${a.threshold_hours} h.`}
              </p>
              <span className="btn-quiet mt-3.5 w-full">Lo vi</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4 border-t border-line pt-8">
        <h2 className="font-display text-lg font-semibold text-ink">Soltadas recientes</h2>
        <ul className="space-y-3">
          {soltadas.map((e) => (
            <li key={e.id} className="card p-4">
              <p className="font-display text-[1.0625rem] leading-snug font-semibold text-ink">
                {e.title}
              </p>
              <p className="mt-1 text-sm text-muted">
                {e.self_released
                  ? `${e.subject_name} la soltó`
                  : `${e.actor_name} se la sacó a ${e.subject_name}`}
                {" · "}
                {formatDateTime(e.released_at)}
              </p>
              <p className="mt-2.5 border-l-2 border-line-strong pl-3 text-[0.9375rem] leading-relaxed text-ink-soft">
                {e.reason}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Cuenta({ rol, onRol }: { rol: Rol; onRol: (r: Rol) => void }) {
  return (
    <div className="space-y-6">
      <PageHeader title="Cuenta" backHref="/mis-tareas" backLabel="Mis tareas">
        beto@tuempresa.cl
      </PageHeader>

      <div className="card space-y-2.5 border-signal/30 bg-signal-soft p-4">
        <p className="font-display text-[1.0625rem] font-semibold text-signal">Solo en el demo</p>
        <p className="text-sm leading-relaxed text-ink-soft">
          Cambiá de rol para ver las dos caras de la app. En la app de verdad esto lo
          define el supervisor, no se elige.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["worker", "Trabajador"],
              ["supervisor", "Supervisor"],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => onRol(v)}
              aria-pressed={rol === v}
              className={`min-h-11 rounded-card border py-3 font-display text-[0.9375rem] font-semibold ${
                rol === v
                  ? "border-signal bg-surface text-signal"
                  : "border-line-strong bg-surface text-ink-soft"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-line pt-5">
        <ThemeToggle />
      </div>

      <div className="border-t border-line pt-5">
        <dl className="space-y-2 text-[0.9375rem]">
          <div className="flex justify-between">
            <dt className="text-muted">Rol</dt>
            <dd className="font-medium text-ink">
              {rol === "supervisor" ? "Supervisor" : "Trabajador"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Tope de tareas activas</dt>
            <dd className="font-medium text-ink">{yo.active_task_limit}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
