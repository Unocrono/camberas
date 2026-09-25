/**
 * Cloudflare Pages Functions: middleware de la web propia de las carreras.
 * Corre en cada navegación HTML (no en assets) y hace lo que una SPA no puede:
 *
 *  1. Bajo el dominio de un club (www.desafio-sarrio.com) resuelve la carrera
 *     con `carrera_por_dominio` e inyecta `window.__TENANT__` para que el
 *     cliente (src/tenant/resolverTenant.ts) no repita la consulta.
 *  2. Reescribe <title>, description, Open Graph, canonical y añade el JSON-LD
 *     SportsEvent con `evento_publico`: es lo que leen WhatsApp, Twitter y
 *     Facebook, que no ejecutan JavaScript (src/lib/seo.ts hace lo mismo en
 *     cliente para Google).
 *  3. En camberas.com/{slug}, si la carrera tiene dominio verificado y la web
 *     activa, responde 301 al dominio propio conservando la query
 *     (?inscribir=, ?cupon=): un solo canónico.
 *  4. Sirve un robots.txt propio bajo el dominio del club.
 *
 * Variables del proyecto Pages: SUPABASE_URL, SUPABASE_ANON_KEY (las públicas
 * del cliente). Caché de 5 minutos por hostname y por slug en la caché de
 * Cloudflare. Ver docs/web-propia.md.
 *
 * Este fichero no lo compila tsc (tsconfig.app.json solo incluye src/); lo
 * compila wrangler al desplegar. Los tipos de Workers se declaran aquí de
 * forma mínima para no añadir @cloudflare/workers-types al proyecto.
 */

interface Env {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
}

interface Contexto {
  request: Request;
  env: Env;
  next: () => Promise<Response>;
  waitUntil: (p: Promise<unknown>) => void;
}

interface Elemento {
  setInnerContent(texto: string, opciones?: { html?: boolean }): void;
  setAttribute(nombre: string, valor: string): void;
  append(contenido: string, opciones?: { html?: boolean }): void;
}

declare class HTMLRewriter {
  on(selector: string, manejadores: { element?: (e: Elemento) => void }): HTMLRewriter;
  transform(respuesta: Response): Response;
}

declare const caches: { default: { match(clave: Request): Promise<Response | undefined>; put(clave: Request, r: Response): Promise<void> } };

interface Tenant {
  race_id: string;
  slug: string;
  hostname: string;
  nombre: string;
  logo?: string | null;
  plantilla?: string;
  tema?: unknown;
}

interface Evento {
  slug: string;
  nombre: string;
  fecha: string;
  fechaTexto?: string;
  descripcion?: string;
  estado?: string;
  lugar?: { nombre?: string; municipio?: string; provincia?: string };
  organizador?: { nombre?: string; web?: string; email?: string };
  imagenes?: Record<string, string>;
  web?: { activa?: boolean; dominio?: string };
  seo?: { titulo?: string; descripcion?: string };
  pruebas?: { nombre: string; distanciaTexto?: string }[];
  inscripcion?: { cierre?: string; tarifas?: { nombre: string; precio?: number }[] };
}

const CACHE_SEGUNDOS = 300;

/** Mismo criterio que esHostCamberas en src/tenant/resolverTenant.ts */
function esHostCamberas(h: string): boolean {
  return (
    h === "camberas.com" ||
    h === "www.camberas.com" ||
    h === "localhost" ||
    h === "127.0.0.1" ||
    h.endsWith(".camberas.com") ||
    h.endsWith(".lovable.app") ||
    h.endsWith(".lovableproject.com") ||
    h.endsWith(".pages.dev") ||
    h.endsWith(".vercel.app") ||
    h.endsWith(".workers.dev")
  );
}

/** Rutas de camberas.com que nunca son un slug de carrera (ahorra la RPC) */
const RESERVADAS = new Set([
  "races", "race", "auth", "dashboard", "org", "timing", "admin", "blog", "contact", "contacto", "planes", "pricing",
  "help", "ayuda", "equipo", "team", "results", "resultados", "live", "gps", "retomar-pago", "mi-dorsal", "widget",
  "assets", "api", "functions", "manifest-selector.js", "sw.js", "robots.txt", "sitemap.xml", "favicon.ico",
]);

async function rpc<T>(env: Env, ctx: Contexto, nombre: string, args: Record<string, unknown>, claveCache: string): Promise<T | null> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;
  const clave = new Request(`https://cache.camberas.local/${nombre}/${encodeURIComponent(claveCache)}`);
  const cacheada = await caches.default.match(clave).catch(() => undefined);
  if (cacheada) return (await cacheada.json()) as T | null;

  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${nombre}`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!r.ok) return null;
  const datos = (await r.json()) as T | null;
  const paraCache = new Response(JSON.stringify(datos ?? null), {
    headers: { "Content-Type": "application/json", "Cache-Control": `s-maxage=${CACHE_SEGUNDOS}` },
  });
  ctx.waitUntil(caches.default.put(clave, paraCache).catch(() => undefined));
  return datos;
}

function tenantDe(env: Env, ctx: Contexto, hostname: string) {
  return rpc<Tenant>(env, ctx, "carrera_por_dominio", { p_hostname: hostname }, hostname);
}

function eventoDe(env: Env, ctx: Contexto, slug: string) {
  return rpc<Evento>(env, ctx, "evento_publico", { p_slug: slug }, slug);
}

/** Mismo criterio que seoDeEvento en src/lib/seo.ts */
function seoDe(e: Evento, canonical: string) {
  const titulo = e.seo?.titulo ?? `${e.nombre} · ${e.fechaTexto ?? e.fecha}${e.lugar?.municipio ? ` · ${e.lugar.municipio}` : ""}`;
  const descripcion = (
    e.seo?.descripcion ??
    e.descripcion ??
    `${e.nombre}: ${(e.pruebas ?? []).map((p) => `${p.nombre}${p.distanciaTexto ? ` (${p.distanciaTexto})` : ""}`).join(", ")}. Inscripciones e información oficial.`
  ).slice(0, 300);
  const imagen = e.imagenes?.hero ?? e.imagenes?.cartel ?? e.imagenes?.imagen ?? e.imagenes?.logo;
  const lugar = [e.lugar?.nombre, e.lugar?.municipio, e.lugar?.provincia].filter(Boolean).join(", ");
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: e.nombre,
    startDate: e.fecha,
    eventStatus: e.estado === "suspendida" ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    url: canonical,
    image: imagen,
    description: descripcion,
    location: lugar
      ? { "@type": "Place", name: lugar, address: { "@type": "PostalAddress", addressLocality: e.lugar?.municipio, addressRegion: e.lugar?.provincia, addressCountry: "ES" } }
      : undefined,
    organizer: e.organizador?.nombre ? { "@type": "Organization", name: e.organizador.nombre, url: e.organizador.web } : undefined,
    offers: (e.inscripcion?.tarifas ?? [])
      .filter((t) => t.precio != null)
      .map((t) => ({
        "@type": "Offer",
        name: t.nombre,
        price: t.precio,
        priceCurrency: "EUR",
        url: `${canonical}#inscripcion`,
        availability: e.estado === "abierta" ? "https://schema.org/InStock" : e.estado === "agotada" ? "https://schema.org/SoldOut" : "https://schema.org/OutOfStock",
        validThrough: e.inscripcion?.cierre,
      })),
  };
  return { titulo, descripcion, imagen, jsonLd };
}

/** JSON seguro dentro de <script>: sin "</script>" ni separadores de línea */
function jsonEnScript(v: unknown): string {
  return JSON.stringify(v).replace(/[<]/g, "\\u003c").replace(/[\u2028]/g, "\\u2028").replace(/[\u2029]/g, "\\u2029");
}

function reescribir(respuesta: Response, evento: Evento | null, tenant: Tenant | null | undefined, canonical: string): Response {
  let rw = new HTMLRewriter();
  if (tenant !== undefined) {
    // undefined = camberas.com (no se inyecta nada); null = dominio sin carrera
    rw = rw.on("head", { element: (el) => el.append(`<script>window.__TENANT__=${jsonEnScript(tenant)};</script>`, { html: true }) });
  }
  if (evento) {
    const seo = seoDe(evento, canonical);
    const meta = (selector: string, valor: string | undefined) => {
      if (valor == null) return;
      rw = rw.on(selector, { element: (el) => el.setAttribute("content", valor) });
    };
    rw = rw.on("title", { element: (el) => el.setInnerContent(seo.titulo) });
    meta('meta[name="description"]', seo.descripcion);
    meta('meta[property="og:title"]', seo.titulo);
    meta('meta[property="og:description"]', seo.descripcion);
    meta('meta[property="og:url"]', canonical);
    meta('meta[property="og:image"]', seo.imagen);
    meta('meta[name="twitter:title"]', seo.titulo);
    meta('meta[name="twitter:description"]', seo.descripcion);
    meta('meta[name="twitter:image"]', seo.imagen);
    rw = rw.on('link[rel="canonical"]', { element: (el) => el.setAttribute("href", canonical) });
    rw = rw.on("head", { element: (el) => el.append(`<script type="application/ld+json">${jsonEnScript(seo.jsonLd)}</script>`, { html: true }) });
  }
  const salida = rw.transform(respuesta);
  // El HTML depende del host y de la carrera: que ningún intermediario lo cachee por su cuenta
  salida.headers.set("Cache-Control", "no-store");
  return salida;
}

export const onRequest = async (ctx: Contexto): Promise<Response> => {
  const { request, env } = ctx;
  if (request.method !== "GET" && request.method !== "HEAD") return ctx.next();

  const url = new URL(request.url);
  const host = url.hostname.toLowerCase();
  const propio = !esHostCamberas(host);

  if (propio && url.pathname === "/robots.txt") {
    return new Response("User-agent: *\nAllow: /\n", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const esNavegacion = (request.headers.get("accept") ?? "").includes("text/html");
  if (!esNavegacion) return ctx.next();

  // --- camberas.com/{slug}: redirección canónica y previas sociales ---
  if (!propio) {
    const m = url.pathname.match(/^\/([a-z0-9][a-z0-9-]*)(\/.*)?$/);
    if (!m || RESERVADAS.has(m[1])) return ctx.next();
    const evento = await eventoDe(env, ctx, m[1]);
    if (!evento?.web?.activa) return ctx.next();

    const resto = m[2] ?? "/";
    if (evento.web.dominio && (host === "camberas.com" || host === "www.camberas.com")) {
      return Response.redirect(`https://${evento.web.dominio}${resto}${url.search}`, 301);
    }
    const canonical = `https://camberas.com/${evento.slug}${resto === "/" ? "" : resto}`;
    return reescribir(await ctx.next(), evento, undefined, canonical);
  }

  // --- dominio propio ---
  const tenant = await tenantDe(env, ctx, host);
  const respuesta = await ctx.next();
  if (!tenant) return reescribir(respuesta, null, null, `https://${host}/`);
  const evento = await eventoDe(env, ctx, tenant.slug);
  // Canónico sobre el host que sirve la página (normalmente www.<dominio>)
  const canonical = `https://${host}${url.pathname}`;
  return reescribir(respuesta, evento, tenant, canonical);
};
