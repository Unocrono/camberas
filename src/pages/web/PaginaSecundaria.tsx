import { Suspense, useEffect, useMemo, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { useEventoPublico } from "@/eventos/useEventoPublico";
import type { EventoPublico } from "@/eventos/tipos";
import type { RutasWeb } from "@/eventos/menu";
import { plantillaDe } from "@/plantillas/registro";
import { cargarFuentes, resolverTokens, variablesCss } from "@/plantillas/libroDiseno";
import { Cabecera } from "@/plantillas/gurriana/Cabecera";
import { Pie } from "@/plantillas/gurriana/Pie";
import { rutasDeWeb, useTenant } from "@/tenant/TenantContext";
import { aplicarSeo, canonicalDe, seoDeEvento } from "@/lib/seo";
import { Cargando } from "./Cargando";
import NoEncontradoWeb from "./NoEncontradoWeb";
import "@/plantillas/gurriana/estilos.css";

/**
 * Marco de las páginas interiores de la web (reglamento, recorrido, resultado
 * del pago, legal): la misma cabecera con menú que la portada y el pie de la plantilla con los tokens de
 * la carrera, y el contenido en medio. Resuelve el evento por slug (URL o
 * tenant) y cachea con la portada.
 */
export function PaginaSecundaria({ titulo, children }: { titulo?: string; children: (evento: EventoPublico, rutas: RutasWeb) => ReactNode }) {
  const { slug: slugUrl } = useParams();
  const { modo, tenant } = useTenant();
  const slug = modo === "propia" ? tenant?.slug : slugUrl;
  const { data: evento, isLoading } = useEventoPublico(slug);
  const plantilla = plantillaDe(evento?.web?.plantilla);
  const tokens = useMemo(() => resolverTokens(plantilla.tokensPorDefecto, evento?.marca), [plantilla, evento?.marca]);
  const rutas = useMemo(() => rutasDeWeb(modo, slug ?? "", false), [modo, slug]);

  useEffect(() => {
    cargarFuentes(tokens);
  }, [tokens]);

  useEffect(() => {
    if (!evento) return;
    const base = seoDeEvento(evento);
    return aplicarSeo({
      ...base,
      titulo: titulo ? `${titulo} · ${evento.nombre}` : base.titulo,
      canonical: canonicalDe(evento, window.location.pathname.replace(rutas.base, "") || "/"),
      jsonLd: undefined,
    });
  }, [evento, titulo, rutas.base]);

  if (!slug) return <NoEncontradoWeb />;
  if (isLoading) return <Cargando />;
  if (!evento) return <NoEncontradoWeb />;

  return (
    <div className="wp min-h-screen" style={variablesCss(tokens)} data-plantilla={plantilla.id} data-modo={modo}>
      <Cabecera evento={evento} rutas={rutas} />
      <main className="pt-[72px]">
        <Suspense fallback={<Cargando />}>{children(evento, rutas)}</Suspense>
      </main>
      <Pie evento={evento} rutas={rutas} />
    </div>
  );
}

/** Cabecera de sección interior: etiqueta + título + volver a la portada */
export function TituloInterior({ etiqueta, titulo, rutas }: { etiqueta: string; titulo: string; rutas: RutasWeb }) {
  return (
    <div className="mx-auto max-w-[1296px] px-5 pt-12 lg:px-[72px] lg:pt-20">
      <a href={rutas.a("/") || "/"} className="text-sm font-semibold no-underline hover:underline" style={{ color: "var(--wp-marca)" }}>
        ← Volver a la portada
      </a>
      <p className="wp-label mt-6">{etiqueta}</p>
      <h1 className="mt-4" style={{ fontSize: "clamp(40px, 5vw, 60px)" }}>{titulo}</h1>
    </div>
  );
}
