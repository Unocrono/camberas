/**
 * Resultados de un evento: los de Camberas o, si el recorrido tiene una «URL
 * alternativa de resultados» (race_distances.results_url, se pone en
 * Recorridos), esa. Mientras las clasificaciones de Camberas no estén del
 * todo, las carreras cronometradas fuera (RaceTec…) enlazan allí.
 *
 * Regla: URL alternativa rellena → manda ella; vacía → resultados de Camberas.
 */

export interface EnlaceResultados {
  href: string;
  /** true si sale de Camberas: se abre en pestaña nueva */
  externo: boolean;
}

/**
 * La URL alternativa saneada, o null si está vacía o no es http(s). El valor
 * lo teclea el organizador y acaba en un href: nada de `javascript:` ni rutas
 * raras (la tabla lleva además un CHECK con la misma regla).
 */
export function urlAlternativa(valor: unknown): string | null {
  const texto = String(valor ?? "").trim();
  if (!texto) return null;
  try {
    const u = new URL(texto);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    // Sin usuario:clave delante del dominio (el viejo truco de «banco.com@malo.com»)
    if (u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Lo que se teclea en Recorridos, listo para guardar: admite pegar la
 * dirección sin «https://» (se le pone) y exige un dominio con punto.
 * null si no es una dirección web válida.
 */
export function urlTecleada(valor: string): string | null {
  const texto = valor.trim();
  if (!texto) return null;
  const conEsquema = /^https?:\/\//i.test(texto) ? texto : `https://${texto}`;
  const url = urlAlternativa(conEsquema);
  if (!url || !new URL(url).hostname.includes(".")) return null;
  return url;
}

/** Dónde se ven los resultados de UN recorrido */
export function resultadosDeRecorrido(
  recorrido: { results_url?: string | null } | null | undefined,
  enCamberas: string,
): EnlaceResultados {
  const alternativa = urlAlternativa(recorrido?.results_url);
  return alternativa ? { href: alternativa, externo: true } : { href: enCamberas, externo: false };
}

/**
 * Dónde se ven las clasificaciones de la CARRERA entera: la primera URL
 * alternativa de sus recorridos (en su orden) o, si ninguno tiene, Camberas.
 */
export function resultadosDeCarrera(
  recorridos: { results_url?: string | null }[] | null | undefined,
  enCamberas: string,
): EnlaceResultados {
  for (const r of recorridos ?? []) {
    const alternativa = urlAlternativa(r?.results_url);
    if (alternativa) return { href: alternativa, externo: true };
  }
  return { href: enCamberas, externo: false };
}

/** Atributos para abrir fuera de Camberas en pestaña nueva */
export const atributosEnlace = (e: EnlaceResultados) =>
  e.externo ? ({ target: "_blank", rel: "noopener noreferrer" } as const) : {};
