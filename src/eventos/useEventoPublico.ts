import { useQuery } from "@tanstack/react-query";
import { rpcSinTipos } from "./rpc";
import type { EventoPublico } from "./tipos";

/**
 * El evento entero para la web de la carrera, de la RPC evento_publico(slug).
 *
 * - `null` = la carrera no existe o está oculta (la RPC devuelve NULL).
 * - Se cachea un minuto; si hay pruebas abiertas se refresca cada minuto para
 *   que el estado (abierta/agotada) y las plazas sigan al día sin republicar.
 * - Hasta regenerar types.ts la RPC no está en los tipos del cliente: se
 *   castea, igual que widget_carrera.
 */
export function useEventoPublico(slug: string | undefined) {
  return useQuery<EventoPublico | null>({
    queryKey: ["evento-publico", slug],
    enabled: !!slug,
    staleTime: 60_000,
    refetchInterval: (query) => {
      const evento = query.state.data;
      return evento?.pruebas?.some((p) => p.estado === "abierta") ? 60_000 : false;
    },
    queryFn: async () => (await rpcSinTipos<EventoPublico | null>("evento_publico", { p_slug: slug })) ?? null,
  });
}

/** Primer periodo vigente de una tarifa, o su precio calculado. */
export function precioVigente(tarifa: { precio?: number; periodos: { precio: number; vigente?: boolean }[] }): number | undefined {
  if (tarifa.precio != null) return tarifa.precio;
  return tarifa.periodos.find((p) => p.vigente)?.precio ?? tarifa.periodos[0]?.precio;
}

/** "12 €" / "12,50 €" */
export function formatoPrecio(n: number | undefined): string {
  if (n == null) return "";
  return `${Number.isInteger(n) ? n : n.toFixed(2).replace(".", ",")} €`;
}

/** "Domingo 1 de noviembre de 2026" desde "2026-11-01" */
export function fechaLarga(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00`);
  if (isNaN(d.getTime())) return iso;
  const s = d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** { dia: "1", mes: "noviembre" } */
export function diaMes(iso: string | undefined): { dia: string; mes: string } {
  if (!iso) return { dia: "", mes: "" };
  const d = new Date(`${iso}T12:00:00`);
  if (isNaN(d.getTime())) return { dia: "", mes: "" };
  return { dia: String(d.getDate()), mes: d.toLocaleDateString("es-ES", { month: "long" }) };
}

/** "15 FEB" desde una fecha ISO o un texto "15 de febrero de 2027" */
export function diaMesAbreviado(valor: string | undefined): string {
  if (!valor) return "";
  // Del valor ISO solo cuenta el día, tal cual (es hora local): con new Date()
  // un cierre desde las 22:00 se anunciaba al día siguiente
  const d = new Date(`${valor.slice(0, 10)}T12:00:00`);
  if (!isNaN(d.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(valor)) {
    return `${d.getDate()} ${d.toLocaleDateString("es-ES", { month: "short" }).replace(".", "").toUpperCase()}`;
  }
  const m = valor.match(/(\d{1,2})\s+de\s+([a-záéíóúñ]+)/i);
  return m ? `${m[1]} ${m[2].slice(0, 3).toUpperCase()}` : valor;
}
