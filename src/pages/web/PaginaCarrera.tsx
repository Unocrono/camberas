import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useEventoPublico } from "@/eventos/useEventoPublico";
import type { EventoPublico } from "@/eventos/tipos";
import { InscripcionDialog } from "@/eventos/InscripcionDialog";
import { plantillaDe } from "@/plantillas/registro";
import { resolverTokens } from "@/plantillas/libroDiseno";
import { rutasDeWeb, useTenant } from "@/tenant/TenantContext";
import { aplicarSeo, seoDeEvento } from "@/lib/seo";
import { Cargando } from "./Cargando";
import NoEncontradoWeb from "./NoEncontradoWeb";
import { AvisoCookies } from "./AvisoCookies";

/**
 * Portada de la web de la carrera: plantilla + diálogo de inscripción.
 * Sirve igual en camberas.com/{slug} (slug de la URL) y bajo dominio propio
 * (slug del tenant). Entiende los mismos parámetros que la ficha clásica:
 *   ?inscribir=ID  abre el formulario de ese recorrido (lo usa widget.js)
 *   ?cupon=CODIGO  aplica el cupón al abrir la inscripción
 */
export default function PaginaCarrera({ evento: eventoDado }: { evento?: EventoPublico }) {
  const { slug: slugUrl } = useParams();
  const { modo, tenant } = useTenant();
  const slug = modo === "propia" ? tenant?.slug : slugUrl;
  const { data, isLoading, isError } = useEventoPublico(eventoDado ? undefined : slug);
  const evento = eventoDado ?? data ?? null;
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const cuponDeUrl = (searchParams.get("cupon") ?? searchParams.get("coupon") ?? "").trim();
  const inscribirDeUrl = (searchParams.get("inscribir") ?? "").trim();
  const inscripcionDirectaHecha = useRef(false);

  const [pruebaId, setPruebaId] = useState<string | null>(null);
  const [dialogoAbierto, setDialogoAbierto] = useState(false);

  const abrirInscripcion = (id: string) => {
    setPruebaId(id);
    setDialogoAbierto(true);
  };

  // ?inscribir=ID: se abre una sola vez, con las mismas condiciones que el botón
  useEffect(() => {
    if (!inscribirDeUrl || inscripcionDirectaHecha.current || !evento) return;
    inscripcionDirectaHecha.current = true;
    const prueba = evento.pruebas.find((p) => p.id === inscribirDeUrl);
    if (!prueba) return;
    if (prueba.estado && prueba.estado !== "abierta") {
      toast({
        title: prueba.estado === "agotada" ? "Recorrido completo" : "Inscripción no disponible",
        description: `${prueba.nombre}: ahora mismo no admite inscripciones.`,
      });
      return;
    }
    abrirInscripcion(prueba.id);
  }, [inscribirDeUrl, evento, toast]);

  // SEO por carrera: título, description, OG, canonical (su dominio si lo
  // tiene) y JSON-LD SportsEvent. Se restaura al salir de la página.
  useEffect(() => {
    if (!evento) return;
    return aplicarSeo(seoDeEvento(evento));
  }, [evento]);

  const plantilla = plantillaDe(evento?.web?.plantilla);
  const tokens = useMemo(() => resolverTokens(plantilla.tokensPorDefecto, evento?.marca), [plantilla, evento?.marca]);
  const rutas = useMemo(() => rutasDeWeb(modo, slug ?? "", true), [modo, slug]);

  if (!slug) return <NoEncontradoWeb />;
  if (isLoading && !evento) return <Cargando />;
  if (isError || !evento) return <NoEncontradoWeb />;

  const Plantilla = plantilla.componente;
  const prueba = evento.pruebas.find((p) => p.id === pruebaId) ?? null;

  return (
    <>
      <Suspense fallback={<Cargando />}>
        <Plantilla evento={evento} tokens={tokens} rutas={rutas} modo={modo} onInscribirse={abrirInscripcion} />
      </Suspense>
      {/* Analytics del organizador solo en su dominio y con consentimiento */}
      {modo === "propia" && <AvisoCookies ga4={evento.analytics?.ga4} hrefCookies={rutas.a("/cookies")} />}
      {prueba && (
        <InscripcionDialog
          evento={evento}
          prueba={prueba}
          abierto={dialogoAbierto}
          onOpenChange={(abierto) => {
            setDialogoAbierto(abierto);
            if (!abierto) setPruebaId(null);
          }}
          cuponInicial={cuponDeUrl || undefined}
        />
      )}
    </>
  );
}
