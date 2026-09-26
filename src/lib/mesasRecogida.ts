/**
 * Mesas de recogida de dorsales: numeración y nombre visibles.
 *
 * El número de una mesa es su orden de alta en la carrera, contando también
 * las revocadas (así revocar una no renumera las demás en mitad de la
 * recogida). Es la misma regla que recogida_contexto (migración
 * 20260926100000), que es lo que ve la propia mesa en su pantalla: panel,
 * app del organizador y mesa dicen siempre el mismo "Mesa #N".
 */

export interface MesaBasica {
  id: string;
  nombre: string;
  created_at: string;
}

/** id de mesa → { numero, nombre } */
export function numerarMesas(mesas: MesaBasica[]): Record<string, { numero: number; nombre: string }> {
  const ordenadas = [...mesas].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const mapa: Record<string, { numero: number; nombre: string }> = {};
  ordenadas.forEach((m, i) => {
    mapa[m.id] = { numero: i + 1, nombre: m.nombre };
  });
  return mapa;
}

/** "Mesa #1" y el nombre solo si dice algo más ("Mesa 1" no se repite; "Carpa federados" sí) */
export function textoMesa(numero: number, nombre: string): string {
  const soloNumero = nombre.trim().toLowerCase().replace(/[#º°.\s]/g, "") === `mesa${numero}`;
  return soloNumero ? `Mesa #${numero}` : `Mesa #${numero} · ${nombre}`;
}

/** ¿La vimos hace poco? Con el latido de un minuto de la mesa, dos minutos es holgado */
export const mesaAtendiendo = (lastSeen: string | null) =>
  !!lastSeen && Date.now() - new Date(lastSeen).getTime() < 2 * 60 * 1000;
