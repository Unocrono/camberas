import type { EventoPublico } from "@/eventos/tipos";

/**
 * SEO de la web de la carrera: título, description, Open Graph, Twitter,
 * canonical y JSON-LD (SportsEvent), escritos en el <head> como hace
 * BlogSEO.tsx. index.html trae los de Camberas fijos; aquí se sustituyen
 * mientras la página está montada y se restauran al salir.
 *
 * Es SEO de cliente: Google lo lee (renderiza JS); las previas de WhatsApp o
 * Twitter no. Para esas, el middleware del hosting reescribe el HTML (fase 6).
 */
export interface DatosSeo {
  titulo: string;
  descripcion?: string;
  canonical?: string;
  imagen?: string;
  jsonLd?: Record<string, unknown>;
}

interface Restaurar {
  titulo: string;
  metas: Map<string, string | null>;
  canonical: string | null;
}

function meta(selector: string, attr: "name" | "property", clave: string, valor: string | undefined, guardado: Map<string, string | null>) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!guardado.has(selector)) guardado.set(selector, el?.getAttribute("content") ?? null);
  if (valor == null) return;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, clave);
    document.head.appendChild(el);
  }
  el.setAttribute("content", valor);
}

/** Aplica el SEO y devuelve una función que lo deshace */
export function aplicarSeo(d: DatosSeo): () => void {
  if (typeof document === "undefined") return () => undefined;
  const guardado: Restaurar = { titulo: document.title, metas: new Map(), canonical: null };
  document.title = d.titulo;
  meta('meta[name="description"]', "name", "description", d.descripcion, guardado.metas);
  meta('meta[property="og:title"]', "property", "og:title", d.titulo, guardado.metas);
  meta('meta[property="og:description"]', "property", "og:description", d.descripcion, guardado.metas);
  meta('meta[property="og:type"]', "property", "og:type", "website", guardado.metas);
  meta('meta[property="og:url"]', "property", "og:url", d.canonical, guardado.metas);
  meta('meta[property="og:image"]', "property", "og:image", d.imagen, guardado.metas);
  meta('meta[name="twitter:card"]', "name", "twitter:card", d.imagen ? "summary_large_image" : "summary", guardado.metas);
  meta('meta[name="twitter:title"]', "name", "twitter:title", d.titulo, guardado.metas);
  meta('meta[name="twitter:description"]', "name", "twitter:description", d.descripcion, guardado.metas);
  meta('meta[name="twitter:image"]', "name", "twitter:image", d.imagen, guardado.metas);

  const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  guardado.canonical = canonical?.getAttribute("href") ?? null;
  if (d.canonical) {
    const link = canonical ?? document.createElement("link");
    link.rel = "canonical";
    link.href = d.canonical;
    if (!canonical) document.head.appendChild(link);
  }

  let jsonLd: HTMLScriptElement | null = null;
  if (d.jsonLd) {
    jsonLd = document.createElement("script");
    jsonLd.type = "application/ld+json";
    jsonLd.id = "wp-jsonld";
    jsonLd.textContent = JSON.stringify(d.jsonLd);
    document.head.querySelector("#wp-jsonld")?.remove();
    document.head.appendChild(jsonLd);
  }

  return () => {
    document.title = guardado.titulo;
    for (const [selector, valor] of guardado.metas) {
      const el = document.head.querySelector<HTMLMetaElement>(selector);
      if (!el) continue;
      if (valor == null) el.remove();
      else el.setAttribute("content", valor);
    }
    const c = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (c && guardado.canonical) c.href = guardado.canonical;
    else if (c && !guardado.canonical) c.remove();
    jsonLd?.remove();
  };
}

/** URL canónica de la web de una carrera: su dominio verificado o camberas.com/{slug} */
export function canonicalDe(evento: EventoPublico, path = "/"): string {
  const p = path === "/" ? "/" : path;
  if (evento.web?.dominio) return `https://${evento.web.dominio}${p}`;
  return `https://camberas.com/${evento.slug}${p === "/" ? "" : p}`;
}

/** SEO de la portada de la carrera, con JSON-LD SportsEvent */
export function seoDeEvento(evento: EventoPublico): DatosSeo {
  const lugar = [evento.lugar?.nombre, evento.lugar?.municipio, evento.lugar?.provincia].filter(Boolean).join(", ");
  const titulo = evento.seo?.titulo ?? `${evento.nombre} · ${evento.fechaTexto ?? evento.fecha}${evento.lugar?.municipio ? ` · ${evento.lugar.municipio}` : ""}`;
  const descripcion =
    evento.seo?.descripcion ??
    evento.descripcion ??
    `${evento.nombre}: ${evento.pruebas.map((p) => `${p.nombre}${p.distanciaTexto ? ` (${p.distanciaTexto})` : ""}`).join(", ")}. Inscripciones e información oficial.`;
  // Sin imagen propia se deja la de index.html (la de Camberas); bajo dominio
  // propio la reescribe el middleware del hosting con el logo de la carrera.
  const imagen = evento.imagenes?.hero ?? evento.imagenes?.cartel ?? evento.imagenes?.imagen ?? evento.imagenes?.logo;
  const canonical = canonicalDe(evento);
  return {
    titulo,
    descripcion: descripcion.slice(0, 300),
    imagen,
    canonical,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "SportsEvent",
      name: evento.nombre,
      startDate: evento.fecha,
      eventStatus: evento.estado === "suspendida" ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      url: canonical,
      image: imagen,
      description: descripcion.slice(0, 300),
      location: lugar ? { "@type": "Place", name: lugar, address: { "@type": "PostalAddress", addressLocality: evento.lugar?.municipio, addressRegion: evento.lugar?.provincia, addressCountry: "ES" } } : undefined,
      organizer: evento.organizador?.nombre ? { "@type": "Organization", name: evento.organizador.nombre, url: evento.organizador.web, email: evento.organizador.email } : undefined,
      offers: evento.inscripcion.tarifas
        .filter((t) => t.precio != null)
        .map((t) => ({
          "@type": "Offer",
          name: t.nombre,
          price: t.precio,
          priceCurrency: "EUR",
          url: `${canonical}#inscripcion`,
          availability: evento.estado === "abierta" ? "https://schema.org/InStock" : evento.estado === "agotada" ? "https://schema.org/SoldOut" : "https://schema.org/OutOfStock",
          validThrough: evento.inscripcion.cierre,
        })),
    },
  };
}
