/**
 * Instagram Graph API por el camino «Facebook Login»: la cuenta profesional de
 * Camberas está vinculada a su página de Facebook, y el token es el de un
 * usuario del sistema de la cartera de Meta, que no caduca.
 *
 * Secrets (Lovable Cloud): INSTAGRAM_TOKEN y INSTAGRAM_USER_ID, el id numérico
 * de la cuenta (no el @). Cómo sacarlos: docs/instagram-alta-meta.md.
 *
 * Lo que Meta NO deja hacer por la API, para no buscarlo: imágenes que no sean
 * JPEG, más de 10 piezas por carrusel, stickers en las historias (ni enlace ni
 * encuesta), música, filtros. Las imágenes tienen que estar en una URL pública:
 * Meta las descarga de ahí (usamos el bucket «instagram»).
 */

import { GRAPH_VERSION } from "./meta.ts";

const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

// Meta tarda segundos en descargar una imagen; más de esto es que algo va mal
const ESPERA_MAX_MS = 45_000;
const ESPERA_PASO_MS = 1_500;

export const MAX_CARRUSEL = 10;
export const MAX_PIE = 2_200;

export interface Credenciales {
  token: string;
  igUserId: string;
}

export class ErrorGraph extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly codigo: number | null,
    readonly subcodigo: number | null,
  ) {
    super(message);
  }
}

export function credenciales(): Credenciales {
  const token = Deno.env.get("INSTAGRAM_TOKEN");
  const igUserId = Deno.env.get("INSTAGRAM_USER_ID");
  if (!token || !igUserId) {
    throw new Error("INSTAGRAM_TOKEN o INSTAGRAM_USER_ID sin configurar (ver docs/instagram-alta-meta.md)");
  }
  return { token, igUserId };
}

interface ErrorMeta {
  code?: number;
  error_subcode?: number;
  error_user_msg?: string;
  message?: string;
}

/** Traduce los errores que sabemos qué significan; el resto, tal cual los da Meta. */
function mensajeDeError(status: number, e: ErrorMeta): string {
  const codigo = e.code ?? null;
  const sub = e.error_subcode ?? null;
  const original = e.error_user_msg || e.message || `Graph API ${status}`;
  const ref = `[${codigo ?? status}${sub ? `/${sub}` : ""}]`;
  if (codigo === 190) {
    return `El token de Instagram no vale (caducado o revocado). Genera otro en el usuario del sistema y cambia INSTAGRAM_TOKEN. ${ref}`;
  }
  if (sub === 2207042) {
    return `Se ha llegado al límite de publicaciones por API de las últimas 24 h. ${ref}`;
  }
  if (codigo === 10 || codigo === 200 || (codigo !== null && codigo >= 200 && codigo < 300)) {
    return `Al token le falta un permiso: ${original} ${ref}`;
  }
  return `${original} ${ref}`;
}

async function graph<T>(
  c: Credenciales,
  metodo: "GET" | "POST",
  ruta: string,
  params: Record<string, string> = {},
): Promise<T> {
  const url = new URL(`${GRAPH}/${ruta}`);
  let body: URLSearchParams | undefined;
  if (metodo === "GET") {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  } else {
    body = new URLSearchParams(params);
  }
  const res = await fetch(url, {
    method: metodo,
    headers: { Authorization: `Bearer ${c.token}` },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.error) {
    const e = json?.error ?? {};
    throw new ErrorGraph(mensajeDeError(res.status, e), res.status, e.code ?? null, e.error_subcode ?? null);
  }
  return json as T;
}

// ── Estado de la cuenta (panel) ───────────────────────────────────────

export interface EstadoCuenta {
  id: string;
  username: string;
  name?: string;
  profile_picture_url?: string;
  followers_count?: number;
  media_count?: number;
  /** Publicaciones por API en las últimas 24 h y el tope de la cuenta */
  cupo: { usadas: number; total: number | null } | null;
}

export async function estadoCuenta(c: Credenciales): Promise<EstadoCuenta> {
  const cuenta = await graph<Omit<EstadoCuenta, "cupo">>(c, "GET", c.igUserId, {
    fields: "id,username,name,profile_picture_url,followers_count,media_count",
  });
  // El cupo es informativo: si esta llamada falla, la cuenta sigue sirviendo
  const limite = await graph<{ data?: { quota_usage?: number; config?: { quota_total?: number } }[] }>(
    c, "GET", `${c.igUserId}/content_publishing_limit`, { fields: "quota_usage,config" },
  ).catch(() => null);
  const d = limite?.data?.[0];
  return {
    ...cuenta,
    cupo: d ? { usadas: d.quota_usage ?? 0, total: d.config?.quota_total ?? null } : null,
  };
}

// ── Publicar ──────────────────────────────────────────────────────────

export type Formato = "feed" | "historia";

/** Espera a que Meta haya descargado y procesado el contenedor. */
async function esperarContenedor(c: Credenciales, id: string): Promise<void> {
  const t0 = Date.now();
  for (;;) {
    const r = await graph<{ status_code?: string; status?: string }>(c, "GET", id, {
      fields: "status_code,status",
    });
    if (r.status_code === "FINISHED" || r.status_code === "PUBLISHED") return;
    if (r.status_code === "ERROR" || r.status_code === "EXPIRED") {
      throw new Error(`Meta no pudo preparar la imagen (${r.status_code}${r.status ? `: ${r.status}` : ""})`);
    }
    if (Date.now() - t0 > ESPERA_MAX_MS) {
      throw new Error("Meta tarda demasiado en preparar la imagen; prueba otra vez en un minuto");
    }
    await new Promise((ok) => setTimeout(ok, ESPERA_PASO_MS));
  }
}

async function contenedor(c: Credenciales, params: Record<string, string>): Promise<string> {
  const r = await graph<{ id: string }>(c, "POST", `${c.igUserId}/media`, params);
  return r.id;
}

/**
 * Publica una foto, un carrusel (varias imágenes) o una historia.
 * Las URLs tienen que ser públicas y JPEG. La historia no lleva pie: Instagram
 * no lo enseña.
 */
export async function publicar(
  c: Credenciales,
  imagenes: string[],
  pie: string | null,
  formato: Formato,
): Promise<{ mediaId: string; permalink: string | null }> {
  if (imagenes.length === 0) throw new Error("No hay imágenes que publicar");
  if (formato === "historia" && imagenes.length !== 1) throw new Error("Una historia es una sola imagen");
  if (imagenes.length > MAX_CARRUSEL) throw new Error(`Un carrusel admite como mucho ${MAX_CARRUSEL} imágenes`);
  if (pie && pie.length > MAX_PIE) throw new Error(`El pie pasa de ${MAX_PIE} caracteres`);

  let creacion: string;
  if (formato === "historia") {
    creacion = await contenedor(c, { image_url: imagenes[0], media_type: "STORIES" });
  } else if (imagenes.length === 1) {
    creacion = await contenedor(c, { image_url: imagenes[0], ...(pie ? { caption: pie } : {}) });
  } else {
    // Carrusel: un contenedor por imagen y otro que los agrupa. Instagram
    // recorta todas al formato de la primera: que sean todas iguales.
    const hijos: string[] = [];
    for (const url of imagenes) {
      const id = await contenedor(c, { image_url: url, is_carousel_item: "true" });
      await esperarContenedor(c, id);
      hijos.push(id);
    }
    creacion = await contenedor(c, {
      media_type: "CAROUSEL",
      children: hijos.join(","),
      ...(pie ? { caption: pie } : {}),
    });
  }
  await esperarContenedor(c, creacion);

  const pub = await graph<{ id: string }>(c, "POST", `${c.igUserId}/media_publish`, {
    creation_id: creacion,
  });
  // El enlace es un adorno: si no llega, la publicación ya está hecha
  const info = await graph<{ permalink?: string }>(c, "GET", pub.id, { fields: "permalink" })
    .catch(() => ({} as { permalink?: string }));
  return { mediaId: pub.id, permalink: info.permalink ?? null };
}

// ── Leer otra cuenta (Business Discovery) ─────────────────────────────

export interface MediaAjena {
  id: string;
  caption?: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  /** No viene en vídeos con música con derechos: entonces vale la miniatura */
  media_url?: string;
  /** Solo en vídeos */
  thumbnail_url?: string;
  permalink: string;
  timestamp: string;
}

export interface CuentaAjena {
  username: string;
  name?: string;
  profile_picture_url?: string;
  followers_count?: number;
  media_count?: number;
  media?: { data: MediaAjena[] };
}

const USUARIO = /^[A-Za-z0-9._]{1,30}$/;
// Rutas de instagram.com que no son un perfil
const NO_PERFIL = new Set(["p", "reel", "reels", "tv", "stories", "explore", "accounts", "direct"]);

/**
 * El @ de una URL de perfil ('https://www.instagram.com/clubsarrio/',
 * 'instagram.com/clubsarrio?igsh=…') o de un '@clubsarrio' suelto. null si
 * no es un perfil.
 */
export function usuarioDeUrl(texto: string | null | undefined): string | null {
  const t = (texto ?? "").trim();
  const m = t.match(/instagram\.com\/([^/?#\s]+)/i) ?? t.match(/^@?([^/?#\s]+)$/);
  const u = m?.[1];
  if (!u || !USUARIO.test(u) || NO_PERFIL.has(u.toLowerCase())) return null;
  return u;
}

/**
 * Perfil y últimas publicaciones de OTRA cuenta, leídos desde la de Camberas.
 * La otra cuenta no autoriza nada, pero tiene que ser profesional (Empresa o
 * Creador): de una personal Meta no da nada. Gasta cupo de llamadas de la
 * cuenta de Camberas: quien la use, que guarde caché.
 */
export async function descubrir(c: Credenciales, usuario: string, cuantas = 6): Promise<CuentaAjena> {
  // El @ va dentro de la expresión de campos: nada que no sea un usuario válido
  if (!USUARIO.test(usuario)) throw new Error("Usuario de Instagram no válido");
  const campos = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp";
  const r = await graph<{ business_discovery?: CuentaAjena }>(c, "GET", c.igUserId, {
    fields:
      `business_discovery.username(${usuario})` +
      `{username,name,profile_picture_url,followers_count,media_count,media.limit(${cuantas}){${campos}}}`,
  });
  if (!r.business_discovery) throw new Error(`@${usuario} no devuelve datos`);
  return r.business_discovery;
}
