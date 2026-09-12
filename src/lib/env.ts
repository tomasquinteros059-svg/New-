/**
 * Lectura de variables de entorno con error explícito.
 *
 * Sin esto, una variable faltante se manifiesta como un 500 opaco en Vercel o
 * como `undefined` viajando hasta el cliente de Supabase.
 */
function required(name: string, value: string | undefined): string {
  if (!value || value.length === 0) {
    throw new Error(
      `Falta la variable de entorno ${name}. ` +
        `Copiá .env.example a .env.local y completá los valores del panel de Supabase (Settings → API).`,
    );
  }
  return value;
}

export const SUPABASE_URL = () =>
  required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);

export const SUPABASE_ANON_KEY = () =>
  required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
