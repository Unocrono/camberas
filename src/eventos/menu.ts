import type { EventoPublico } from "./tipos";

/**
 * Menú de la web de la carrera, construido desde el evento (regla de
 * docs/eventos/plantilla.md): un grupo solo aparece si tiene datos; un grupo
 * con un único enlace se convierte en enlace directo; sin enlaces desaparece.
 *
 * Los enlaces son anclas de la portada (#recorridos) o rutas (reglamento);
 * `rutas.a()` los convierte en href válidos tanto en camberas.com/{slug} como
 * bajo el dominio propio.
 */
export interface EnlaceMenu {
  href: string;
  texto: string;
}

export interface GrupoMenu {
  id: string;
  texto: string;
  items: EnlaceMenu[];
}

export interface RutasWeb {
  /** "" en dominio propio, "/{slug}" en camberas.com */
  base: string;
  /** Ruta dentro de la web: a("/reglamento") → "/loiu-500-trail-2026/reglamento" o "/reglamento" */
  a: (path: string) => string;
  /** Ancla de la portada: ancla("recorridos") → "/loiu.../#recorridos" fuera de la portada, "#recorridos" en ella */
  ancla: (id: string) => string;
}

export function construirMenu(evento: EventoPublico, rutas: RutasWeb): GrupoMenu[] {
  const ins = evento.inscripcion;
  const grupos: GrupoMenu[] = [];

  grupos.push({
    id: "recorridos",
    texto: evento.pruebas.length > 1 ? "Recorridos" : "Recorrido",
    items: evento.pruebas.map((p) => ({ href: rutas.ancla(`prueba-${p.id}`), texto: p.nombre })),
  });

  const inscripcion: EnlaceMenu[] = [{ href: rutas.ancla("inscripcion"), texto: "Precios y plazos" }];
  if (ins.incluye?.length) inscripcion.push({ href: rutas.ancla("inscripcion-incluye"), texto: "Qué incluye" });
  if (ins.devolucion) inscripcion.push({ href: rutas.ancla("inscripcion-devoluciones"), texto: "Bajas y devoluciones" });
  if (ins.modalidades.includes("equipo")) inscripcion.push({ href: rutas.ancla("inscripcion-equipos"), texto: "Equipos" });
  grupos.push({ id: "inscripcion", texto: "Inscripción", items: inscripcion });

  const reg = evento.reglamento;
  const reglamento: EnlaceMenu[] = [];
  if (reg?.secciones?.length || reg?.url) reglamento.push({ href: rutas.a("/reglamento"), texto: "Reglamento" });
  if (reg?.materialObligatorio?.length) reglamento.push({ href: rutas.ancla("material"), texto: "Material obligatorio" });
  const hayCategorias = !!evento.categorias?.length || evento.pruebas.some((p) => p.categorias?.length);
  if (hayCategorias) reglamento.push({ href: rutas.ancla("categorias"), texto: "Categorías" });
  if (evento.pruebas.some((p) => p.avituallamientos?.some((a) => a.corte))) reglamento.push({ href: rutas.ancla("cortes"), texto: "Cortes y tiempos límite" });
  if (reg?.marcaje?.length) reglamento.push({ href: rutas.ancla("marcaje"), texto: "Marcaje y seguridad" });
  if (reg?.reclamaciones) reglamento.push({ href: rutas.ancla("reclamaciones"), texto: "Reclamaciones" });
  grupos.push({ id: "reglamento", texto: "Reglamento", items: reglamento });

  const dia: EnlaceMenu[] = [];
  if (evento.programa?.length) dia.push({ href: rutas.ancla("programa"), texto: "Programa y horarios" });
  if (evento.dorsales) dia.push({ href: rutas.ancla("dorsales"), texto: "Recogida de dorsales" });
  if (evento.pruebas.some((p) => p.lugarSalida || p.lugarMeta)) dia.push({ href: rutas.ancla("salida-meta"), texto: "Salida y meta" });
  if (evento.sanitario) dia.push({ href: rutas.ancla("sanitario"), texto: "Servicio sanitario" });
  grupos.push({ id: "dia", texto: "Día de carrera", items: dia });

  const ip = evento.infoPractica;
  const info: EnlaceMenu[] = [];
  if (ip?.comoLlegar) info.push({ href: rutas.ancla("como-llegar"), texto: "Cómo llegar" });
  if (ip?.alojamiento) info.push({ href: rutas.ancla("alojamiento"), texto: "Alojamiento" });
  if (ip?.espectadores) info.push({ href: rutas.ancla("espectadores"), texto: "Espectadores" });
  if (ip?.faq?.length) info.push({ href: rutas.ancla("faq"), texto: "FAQ" });
  grupos.push({ id: "info", texto: "Info práctica", items: info });

  const mas: EnlaceMenu[] = [];
  if (evento.clasificaciones?.url) mas.push({ href: evento.clasificaciones.url, texto: "Clasificaciones" });
  if (evento.gps?.activo && evento.gps.url) mas.push({ href: evento.gps.url, texto: "GPS en vivo" });
  if (evento.fotos?.url) mas.push({ href: evento.fotos.url, texto: "Galería" });
  if (evento.medioAmbiente) mas.push({ href: rutas.ancla("medioambiente"), texto: "Medioambiente" });
  if (evento.beneficiario) mas.push({ href: rutas.ancla("beneficiario"), texto: "Causa solidaria" });
  if (evento.patrocinadores?.length) mas.push({ href: rutas.ancla("patrocinadores"), texto: "Patrocinadores" });
  mas.push({ href: rutas.ancla("contacto"), texto: "Contacto" });
  grupos.push({ id: "mas", texto: "Más", items: mas });

  return grupos.filter((g) => g.items.length > 0);
}

/** true si el href es externo (https://…) o una ruta de Camberas fuera de la web */
export function esExterno(href: string): boolean {
  return /^https?:\/\//.test(href);
}
