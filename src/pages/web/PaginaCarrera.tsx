import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useEventoPublico } from "@/eventos/useEventoPublico";
import { useIrAlAncla } from "@/eventos/useIrAlAncla";
import type { EventoPublico } from "@/eventos/tipos";
import { inscripcionExterna } from "@/lib/resultados";
import { InscripcionDialog } from "@/eventos/InscripcionDialog";
import { ConsultaInscripcionDialog } from "@/components/ConsultaInscripcionDialog";
import { useConsultaInscripcion } from "@/hooks/useConsultaInscripcion";
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
 *   ?consulta=1    abre la consulta de inscripción (DNI + email o nacimiento)
 */
export default function PaginaCarrera({ evento: eventoDado }: { evento?: EventoPublico }) {
  const { slug: slugUrl } = useParams();
  const { modo, tenant } = useTenant();
  const slug = modo === "propia" ? tenant?.slug : slugUrl;
  const { data, isLoading } = useEventoPublico(eventoDado ? undefined : slug);
  const evento = eventoDado ?? data ?? null;
  // Anclas de la portada (#inscripcion…) al llegar desde una página interior
  useIrAlAncla(!!evento);
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const cuponDeUrl = (searchParams.get("cupon") ?? searchParams.get("coupon") ?? "").trim();
  const inscribirDeUrl = (searchParams.get("inscribir") ?? "").trim();
  const inscripcionDirectaHecha = useRef(false);

  const [pruebaId, setPruebaId] = useState<string | null>(null);
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const consulta = useConsultaInscripcion();

  // Todos los botones de inscripción de la plantilla (cabecera, portada,
  // sección, tarjetas y «¿en qué recorrido?») pasan por aquí. Si el recorrido
  // tiene enlace externo de inscripción (uno.es…), se va allí en vez de abrir
  // el formulario de Camberas; los plazos ya los aplica la plantilla (estado).
  const abrirInscripcion = (id: string) => {
    const externa = inscripcionExterna(evento?.pruebas.find((p) => p.id === id));
    if (externa) {
      window.open(externa, "_blank", "noopener,noreferrer");
      return;
    }
    setPruebaId(id);
    setDialogoAbierto(true);
  };

  // ?inscribir=ID: se abre una sola vez, con las mismas condiciones que el botón
  useEffect(() => {
    if (!inscribirDeUrl || inscripcionDirectaHecha.current || !evento) return;
    inscripcionDirectaHecha.current = true;
    const prueba = evento.pruebas.find((p) => p.id === inscribirDeUrl);
    if (!prueba) return;
    // Con cupón en el enlace, un recorrido completo se abre igual: el cupón
    // puede reservar plaza (coupons.reserva_plaza) y lo decide el servidor
    const completoConCupon = prueba.estado === "agotada" && !!cuponDeUrl;
    if (prueba.estado && prueba.estado !== "abierta" && !completoConCupon) {
      toast({
        title: prueba.estado === "agotada" ? "Recorrido completo" : "Inscripción no disponible",
        description: `${prueba.nombre}: ahora mismo no admite inscripciones.`,
      });
      return;
    }
    // Al llegar por enlace no hay clic del usuario: una pestaña nueva la
    // frenaría el navegador, así que se sigue en esta
    const externa = inscripcionExterna(prueba);
    if (externa) {
      window.location.assign(externa);
      return;
    }
    abrirInscripcion(prueba.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inscribirDeUrl, evento, toast]);

  // ?cupon=CODIGO con el recorrido completo: los botones de la plantilla
  // están deshabilitados, así que se abre el formulario desde aquí. Si el
  // cupón reserva plaza, el servidor deja inscribirse; si no, lo rechaza por
  // aforo igual que siempre. Con un solo recorrido no hay que elegir
  const cuponAbierto = useRef(false);
  useEffect(() => {
    if (!cuponDeUrl || inscribirDeUrl || cuponAbierto.current || !evento) return;
    const agotadas = evento.pruebas.filter((p) => (p.estado ?? evento.estado) === "agotada");
    if (agotadas.length !== 1) return;
    cuponAbierto.current = true;
    abrirInscripcion(agotadas[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuponDeUrl, inscribirDeUrl, evento]);

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
  // Solo sin evento: si falla un refresco de fondo se sigue con los datos que
  // hay (antes la página entera pasaba a "no encontrado" y cerraba lo abierto)
  if (!evento) return <NoEncontradoWeb />;

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
      <ConsultaInscripcionDialog
        carrera={evento.id}
        nombreCarrera={evento.nombre}
        open={consulta.abierta}
        onOpenChange={consulta.onOpenChange}
      />
    </>
  );
}
