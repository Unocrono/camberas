import { z } from "zod";

/**
 * race_web.contenido: las secciones de la web que Camberas no modela en
 * tablas. Mismas claves que docs/eventos/evento.schema.json. Tolerante: lo
 * que no se rellena no se guarda (los vacíos se quitan al guardar) y las
 * claves desconocidas se conservan (passthrough) para no perder nada que se
 * haya cargado por SQL.
 */
const texto = z.string().trim();
const textoOpc = texto.optional();
// Par [texto, texto] (día|horas, cuántos|qué). Como array de 2 para que el
// tipo inferido sea string[] y no una tupla con resto
const par = z.array(texto).min(2).max(2);

export const ContenidoSchema = z
  .object({
    nombreCorto: textoOpc,
    subtitulo: textoOpc,
    descripcion: textoOpc,
    fechaTexto: textoOpc,
    federacion: textoOpc,
    lugar: z
      .object({ nombre: textoOpc, direccion: textoOpc, municipio: textoOpc, provincia: textoOpc, zona: textoOpc, municipios: z.array(texto).optional(), mapaUrl: textoOpc })
      .partial()
      .optional(),
    organizador: z
      .object({ nombre: textoOpc, web: textoOpc, email: textoOpc, telefono: textoOpc, razonSocial: textoOpc, cif: textoOpc, direccion: textoOpc })
      .partial()
      .optional(),
    beneficiario: z.object({ nombre: texto, web: textoOpc, texto: textoOpc, logo: textoOpc }).optional(),
    inscripcion: z
      .object({
        cierreTexto: textoOpc,
        edadMinima: z.number().int().optional(),
        incluye: z.array(texto).optional(),
        nota: textoOpc,
        devolucion: z.object({ hasta: textoOpc, gastos: z.number().optional(), texto: textoOpc }).partial().optional(),
      })
      .partial()
      .optional(),
    reglamento: z
      .object({ url: textoOpc, materialObligatorio: z.array(texto).optional(), normasMaterial: textoOpc, marcaje: z.array(texto).optional(), normas: z.array(texto).optional(), reclamaciones: textoOpc })
      .partial()
      .optional(),
    programa: z.array(z.object({ fecha: textoOpc, hora: textoOpc, horaFin: textoOpc, titulo: texto, lugar: textoOpc })).optional(),
    dorsales: z.object({ lugar: textoOpc, horarios: z.array(par).optional(), nota: textoOpc }).partial().optional(),
    premios: z.array(z.object({ pruebas: z.array(texto).optional(), categoria: textoOpc, premio: texto, texto: textoOpc })).optional(),
    entregaPremios: textoOpc,
    servicios: z.array(z.object({ nombre: texto, texto: textoOpc, icono: textoOpc })).optional(),
    camiseta: z.object({ incluida: z.boolean().optional(), precio: z.number().optional(), hasta: textoOpc, limite: z.number().int().optional(), tallas: z.array(texto).optional(), texto: textoOpc, imagen: textoOpc }).partial().optional(),
    sanitario: z.object({ medios: z.array(par).optional(), nota: textoOpc }).partial().optional(),
    medioAmbiente: z.object({ espacio: textoOpc, habitats: textoOpc, especies: textoOpc, normas: textoOpc, adhesion: textoOpc }).partial().optional(),
    infoPractica: z
      .object({ comoLlegar: textoOpc, parking: textoOpc, alojamiento: textoOpc, espectadores: textoOpc, transporte: textoOpc, faq: z.array(z.object({ p: texto, r: texto })).optional() })
      .partial()
      .optional(),
    clasificaciones: z.object({ url: textoOpc, anteriores: z.array(z.object({ anio: z.number().int(), url: texto })).optional() }).partial().optional(),
    fotos: z.object({ url: textoOpc, disponible: z.boolean().optional(), texto: textoOpc }).partial().optional(),
    contacto: z.object({ email: textoOpc, emailDatos: textoOpc, telefono: textoOpc, direccion: textoOpc, redes: z.record(texto).optional() }).partial().optional(),
    documentos: z.array(z.object({ nombre: texto, url: texto, tipo: textoOpc })).optional(),
    imagenes: z.record(texto).optional(),
    seo: z.object({ titulo: textoOpc, descripcion: textoOpc }).partial().optional(),
    analytics: z.object({ ga4: textoOpc }).partial().optional(),
  })
  .passthrough();

export type Contenido = z.infer<typeof ContenidoSchema>;

/** Quita cadenas vacías, arrays vacíos y objetos vacíos, recursivamente */
export function limpiarVacios<T>(valor: T): T {
  if (Array.isArray(valor)) {
    const arr = valor.map(limpiarVacios).filter((v) => v !== undefined && v !== "" && !(typeof v === "object" && v !== null && Object.keys(v).length === 0));
    return arr as unknown as T;
  }
  if (valor && typeof valor === "object") {
    const salida: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      const limpio = limpiarVacios(v);
      if (limpio === undefined || limpio === "" || limpio === null) continue;
      if (Array.isArray(limpio) && limpio.length === 0) continue;
      if (typeof limpio === "object" && !Array.isArray(limpio) && Object.keys(limpio as object).length === 0) continue;
      salida[k] = limpio;
    }
    return salida as T;
  }
  if (typeof valor === "string") return valor.trim() as unknown as T;
  return valor;
}
