/**
 * Acciones secundarias, agrupadas y en dos columnas.
 *
 * El problema que resuelve: el detalle de una tarea llegó a tener cinco
 * botones grises idénticos apilados, uno abajo del otro. Con todo del mismo
 * tamaño y el mismo color, nada es lo importante y hay que leer los cinco.
 *
 * La regla acá es: UNA acción principal por pantalla, a todo el ancho y en
 * color. Todo lo demás baja de jerarquía, se agrupa bajo una etiqueta que dice
 * de quién son esas acciones, y entra en dos columnas para no estirar la
 * pantalla.
 */
export function ActionGroup({
  label,
  children,
}: {
  /** De quién son estas acciones. Ej: «Como supervisor». */
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2.5 border-t border-line pt-5">
      {label ? <p className="label">{label}</p> : null}
      <div className="grid grid-cols-2 gap-2.5">{children}</div>
    </section>
  );
}
