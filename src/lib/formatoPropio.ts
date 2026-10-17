// Formato «nombre propio» (el PROPER de Excel) para los datos que se importan
// de otras plataformas: primera letra de cada palabra en mayúscula y el resto
// en minúscula. «MARTA CASCANTE MARTINEZ» → «Marta Cascante Martinez»,
// «jean-pierre» → «Jean-Pierre», «o'donnell» → «O'Donnell», «C.D. ARNEDO» →
// «C.D. Arnedo». Tras una cifra no se pone mayúscula («12k» sigue «12k»).
//
// Copia exacta en supabase/functions/_shared/formatoPropio.ts (las edge
// functions no pueden importar de src): si cambias una, cambia la otra.
//
// Se aplica a nombres, apellidos, localidad, provincia, comunidad, domicilio,
// país, club y equipo. NUNCA a email, DNI, teléfono ni talla.

export function formatoPropio(texto: string | null | undefined): string | null {
  if (texto == null) return null;
  const limpio = String(texto).trim().replace(/\s+/g, " ");
  if (!limpio) return null;
  return limpio
    .toLocaleLowerCase("es")
    .replace(/(^|[\s\-'’.(/])(\p{L})/gu, (_, sep: string, letra: string) => sep + letra.toLocaleUpperCase("es"));
}

/**
 * Respuestas libres del formulario (nombre del tutor…): en formato propio
 * solo si parecen un nombre, es decir, sin cifras ni @ (así no se tocan DNI,
 * teléfonos ni correos que vengan en un campo propio).
 */
export function formatoPropioSiEsNombre(texto: string): string {
  return /[0-9@]/.test(texto) ? texto.trim() : (formatoPropio(texto) ?? "");
}
