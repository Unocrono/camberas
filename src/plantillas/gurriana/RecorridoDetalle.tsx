import { lazy, Suspense, type ReactNode } from "react";
import { Download, MapPin, Plane, Map as MapaIcono } from "lucide-react";
import type { EventoPublico, Prueba, Tarifa } from "@/eventos/tipos";
import type { RutasWeb } from "@/eventos/menu";
import { formatoPrecio, precioVigente } from "@/eventos/useEventoPublico";
import { useTenant } from "@/tenant/TenantContext";
import type { LibroDiseno, SeccionEventoId } from "@/plantillas/libroDiseno";
import { ESTADO_BOTON, PerfilAltimetria } from "./Recorridos";

// Mapbox y el visor 3D solo se descargan cuando la sección está activa
const RouteFlightViewer = lazy(() => import("@/components/RouteFlightViewer").then((m) => ({ default: m.RouteFlightViewer })));
const RoutePreviewMap = lazy(() => import("@/components/RoutePreviewMap").then((m) => ({ default: m.RoutePreviewMap })));

/**
 * Página de un recorrido (evento): las secciones que el libro de diseño tenga
 * activas, en su orden (tokens.seccionesEvento). Cada sección se oculta sola
 * si el recorrido no tiene datos para ella. La usa la página pública y la
 * vista previa del panel («Diseño evento»).
 */
export interface PropsRecorridoDetalle {
  evento: EventoPublico;
  prueba: Prueba;
  rutas: RutasWeb;
  tokens: LibroDiseno;
}

const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short" }).replace(".", "");

function Dato({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  return (
    <div>
      <p className="wp-num" style={{ fontSize: "30px" }}>{valor}</p>
      <p className="mt-1 text-sm">{etiqueta}</p>
    </div>
  );
}

function Tarjeta({ id, titulo, color, children }: { id?: string; titulo: string; color: string; children: ReactNode }) {
  return (
    <section id={id} className="wp-card mt-10 p-[22px] lg:p-8" style={{ scrollMarginTop: 90 }}>
      <h2 className="text-[24px] lg:text-[28px]" style={{ color }}>{titulo}</h2>
      <div className="mt-6">{children}</div>
    </section>
  );
}

export function RecorridoDetalle({ evento, prueba, rutas, tokens }: PropsRecorridoDetalle) {
  const { urlCamberas } = useTenant();
  const gpx = prueba.track?.gpx;
  const estado = prueba.estado ?? evento.estado;
  const abierta = estado === "abierta";
  const color = prueba.color ?? "var(--wp-marca)";
  const tarifas: Tarifa[] = evento.inscripcion.tarifas.filter((t) => t.pruebas.includes(prueba.id) || t.id === prueba.id);
  const categorias = prueba.categorias?.length ? prueba.categorias : (evento.categorias ?? []);
  const hayPerfil = !!gpx || !!prueba.avituallamientos?.length;

  const secciones: Record<SeccionEventoId, () => ReactNode> = {
    cifras: () => (
      <>
        <div className="grid grid-cols-2 gap-5 lg:grid-cols-6">
          {prueba.distanciaTexto && <Dato valor={prueba.distanciaTexto} etiqueta="distancia" />}
          {prueba.desnivelPos != null && <Dato valor={`+${prueba.desnivelPos} m`} etiqueta="desnivel positivo" />}
          {prueba.desnivelNeg != null && <Dato valor={`−${prueba.desnivelNeg} m`} etiqueta="desnivel negativo" />}
          {prueba.altMax != null && <Dato valor={`${prueba.altMax} m`} etiqueta="altitud máxima" />}
          {prueba.salida && <Dato valor={`${prueba.salida} h`} etiqueta="salida prevista" />}
          {prueba.limite && <Dato valor={prueba.limite} etiqueta="tiempo límite" />}
          {prueba.precio != null && <Dato valor={formatoPrecio(prueba.precio)} etiqueta="inscripción" />}
        </div>
        {(prueba.lugarSalida || prueba.lugarMeta || prueba.municipios || prueba.marcaje) && (
          <p className="mt-6 text-[15px]">
            {[
              prueba.lugarSalida ? `Salida desde ${prueba.lugarSalida}` : null,
              prueba.lugarMeta && prueba.lugarMeta !== prueba.lugarSalida ? `meta en ${prueba.lugarMeta}` : null,
              prueba.municipios,
              prueba.marcaje ? `marcaje ${prueba.marcaje}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      </>
    ),

    descripcion: () =>
      prueba.descripcion || prueba.relato ? (
        <div className="mt-6">
          {prueba.descripcion && <p className="max-w-[820px] text-[17px] leading-relaxed" style={{ color: "var(--wp-ink)" }}>{prueba.descripcion}</p>}
          {prueba.relato && (
            <div className="mt-4 max-w-[820px] text-[15px] leading-relaxed">
              {prueba.relato.split(/\n+/).map((parrafo, i) => (
                <p key={i} className={i > 0 ? "mt-3" : ""}>{parrafo}</p>
              ))}
            </div>
          )}
        </div>
      ) : null,

    perfil: () =>
      hayPerfil ? (
        <Tarjeta id="perfil" titulo="Perfil" color={color}>
          <PerfilAltimetria prueba={prueba} />
        </Tarjeta>
      ) : null,

    botones: () => (
      <div className="mt-8 flex flex-wrap items-center gap-3">
        {estado === "celebrada" && evento.clasificaciones?.url ? (
          <a href={evento.clasificaciones.url} className="wp-btn">Ver resultados</a>
        ) : abierta ? (
          <a href={`${rutas.a("/") || "/"}?inscribir=${prueba.id}`} className="wp-btn">Inscribirme en {prueba.nombre}</a>
        ) : (
          <button type="button" className="wp-btn" disabled>
            {ESTADO_BOTON[estado] ?? "Inscribirme"}
          </button>
        )}
        {gpx && (
          <>
            <a href="#mapa" className="wp-btn-outline" style={{ color: "var(--wp-ink)" }}>
              <MapPin size={18} strokeWidth={2} aria-hidden="true" />
              Mapa
            </a>
            <a href="#vuelo-3d" className="wp-btn-outline" style={{ color: "var(--wp-ink)" }}>
              <Plane size={18} strokeWidth={2} aria-hidden="true" />
              Vuelo 3D
            </a>
            <a href={gpx} download className="wp-btn-outline" style={{ color: "var(--wp-ink)" }}>
              <Download size={18} strokeWidth={2} aria-hidden="true" />
              Descargar GPX
            </a>
          </>
        )}
        {prueba.rutometro && (
          <a href="#rutometro" className="wp-btn-outline" style={{ color: "var(--wp-ink)" }}>
            <MapaIcono size={18} strokeWidth={2} aria-hidden="true" />
            Rutómetro
          </a>
        )}
        {prueba.track?.wikiloc && (
          <a href={prueba.track.wikiloc} target="_blank" rel="noopener noreferrer" className="wp-btn-outline" style={{ color: "var(--wp-ink)" }}>
            Ver en Wikiloc
          </a>
        )}
      </div>
    ),

    precios: () =>
      tarifas.length > 0 ? (
        <Tarjeta id="precios" titulo="Precios y plazos" color={color}>
          {tarifas.map((t) => {
            const vigente = precioVigente(t);
            return (
              <div key={t.id} className="border-b py-4 last:border-b-0" style={{ borderColor: "var(--wp-border)" }}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="wp-display text-[24px]">{t.nombre}</p>
                  <p className="wp-num" style={{ fontSize: "32px" }}>{formatoPrecio(vigente)}</p>
                </div>
                {t.periodos.length > 1 && (
                  <ul className="mt-3 grid grid-cols-1 gap-1 text-sm list-none p-0 m-0 sm:grid-cols-2">
                    {t.periodos.map((p, i) => (
                      <li key={i} className="flex justify-between rounded-md px-3 py-1.5" style={p.vigente ? { background: "var(--wp-cream)", color: "var(--wp-ink)", fontWeight: 600 } : undefined}>
                        <span>{p.etiqueta ?? [p.desde && fechaCorta(p.desde), p.hasta && fechaCorta(p.hasta)].filter(Boolean).join(" – ")}</span>
                        <span className="tabular-nums">{formatoPrecio(p.precio)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
          <p className="mt-4 text-sm">
            {[
              evento.inscripcion.apertura && `Apertura ${fechaCorta(evento.inscripcion.apertura)}`,
              evento.inscripcion.cierreTexto ? `Cierre: ${evento.inscripcion.cierreTexto}` : evento.inscripcion.cierre && `Cierre ${fechaCorta(evento.inscripcion.cierre)}`,
              prueba.plazas != null && `${prueba.plazas} dorsales`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </Tarjeta>
      ) : null,

    categorias: () =>
      categorias.length > 0 ? (
        <Tarjeta id="categorias-recorrido" titulo="Categorías" color={color}>
          <ul className="grid grid-cols-1 gap-2 list-none p-0 m-0 sm:grid-cols-2 lg:grid-cols-3">
            {categorias.map((c) => (
              <li key={c.id} className="rounded-lg px-4 py-3 text-[15px]" style={{ background: "var(--wp-cream)" }}>
                <strong style={{ color: "var(--wp-ink)" }}>{c.nombre}</strong>
                {(c.edadMin != null || c.edadMax != null) && (
                  <span className="block text-sm">
                    {c.edadMin != null && c.edadMax != null ? `${c.edadMin}–${c.edadMax} años` : c.edadMin != null ? `desde ${c.edadMin} años` : `hasta ${c.edadMax} años`}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Tarjeta>
      ) : null,

    terreno: () =>
      prueba.terreno && prueba.terreno.length > 0 ? (
        <div className="mt-8">
          <p className="wp-label">Terreno</p>
          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {prueba.terreno.map(([tipo, dist]) => (
              <p key={tipo} className="rounded-md px-3 py-2 text-[13px]" style={{ background: "var(--wp-cream)" }}>
                {tipo} · <span className="font-semibold" style={{ color: "var(--wp-ink)" }}>{dist}</span>
              </p>
            ))}
          </div>
        </div>
      ) : null,

    mapa: () =>
      gpx ? (
        <section id="mapa" className="wp-card mt-10 overflow-hidden" style={{ scrollMarginTop: 90 }}>
          <h2 className="px-[22px] pt-[22px] text-[24px] lg:px-8 lg:pt-8 lg:text-[28px]" style={{ color }}>Mapa</h2>
          <div className="mt-4 overflow-hidden">
            <Suspense fallback={null}>
              <RoutePreviewMap gpxUrl={gpx} distanceName={prueba.nombre} puntos={prueba.rutometro?.puntos?.length ? prueba.rutometro.puntos : prueba.avituallamientos} />
            </Suspense>
          </div>
        </section>
      ) : null,

    vuelo3d: () =>
      gpx ? (
        <section id="vuelo-3d" className="wp-card mt-10 overflow-hidden" style={{ scrollMarginTop: 90 }}>
          <h2 className="px-[22px] pt-[22px] text-[24px] lg:px-8 lg:pt-8 lg:text-[28px]" style={{ color }}>Vuelo 3D</h2>
          <div className="mt-4 overflow-hidden" style={{ minHeight: 420 }}>
            <Suspense fallback={null}>
              <RouteFlightViewer gpxUrl={gpx} distanceName={prueba.nombre} />
            </Suspense>
          </div>
        </section>
      ) : null,

    rutometro: () =>
      prueba.rutometro ? (
        <Tarjeta id="rutometro" titulo={prueba.rutometro.nombre ?? "Rutómetro"} color={color}>
          {prueba.rutometro.descripcion && <p className="text-[15px]">{prueba.rutometro.descripcion}</p>}
          {prueba.rutometro.puntos && prueba.rutometro.puntos.length > 0 && (
            <ol className="mt-4 flex flex-col gap-2 list-none p-0 m-0">
              {prueba.rutometro.puntos.map((p, i) => (
                <li key={`${p.km}-${i}`} className="flex flex-wrap items-start gap-3 rounded-lg px-4 py-3 text-[15px]" style={{ background: p.destacado ? "var(--wp-claro, var(--wp-cream))" : "var(--wp-cream)" }}>
                  <span className="wp-num shrink-0 text-[18px]" style={{ color: "var(--wp-ink)", minWidth: 72 }}>km {String(Math.round(p.km * 10) / 10).replace(".", ",")}</span>
                  <span className="min-w-0 flex-1">
                    <strong style={{ color: "var(--wp-ink)" }}>{p.descripcion}</strong>
                    {p.etiqueta && <span className="ml-2 text-[12px] font-semibold uppercase tracking-[1px]" style={{ color: "var(--wp-body)" }}>{p.etiqueta}</span>}
                    {(p.via || p.notas || p.altitud != null) && (
                      <span className="block text-sm">{[p.via, p.altitud != null ? `${p.altitud} m` : null, p.notas].filter(Boolean).join(" · ")}</span>
                    )}
                  </span>
                  {p.kmParcial != null && <span className="text-sm">+{String(Math.round(p.kmParcial * 10) / 10).replace(".", ",")} km</span>}
                </li>
              ))}
            </ol>
          )}
          <a href={urlCamberas(`/roadbook/${prueba.rutometro.id}`)} target="_blank" rel="noopener noreferrer" className="wp-btn-outline mt-5" style={{ color: "var(--wp-ink)" }}>
            <MapaIcono size={18} strokeWidth={2} aria-hidden="true" />
            Abrir el rutómetro completo
          </a>
        </Tarjeta>
      ) : null,

    avituallamientos: () =>
      prueba.avituallamientos && prueba.avituallamientos.length > 0 ? (
        <Tarjeta id="avituallamientos" titulo="Avituallamientos y controles" color={color}>
          <ul className="flex flex-col gap-2 list-none p-0 m-0">
            {prueba.avituallamientos.map((a) => (
              <li key={`${a.nombre}-${a.km}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-4 py-3 text-[15px]" style={{ background: "var(--wp-cream)" }}>
                <span>
                  <strong style={{ color: "var(--wp-ink)" }}>km {String(a.km).replace(".", ",")}</strong> · {a.nombre}
                  {a.lugar && a.lugar !== a.nombre ? ` · ${a.lugar}` : ""}
                </span>
                {a.corte && <span className="wp-num text-[18px]" style={{ color: "var(--wp-red)" }}>corte {a.corte}</span>}
              </li>
            ))}
          </ul>
        </Tarjeta>
      ) : null,
  };

  return (
    <>
      {tokens.seccionesEvento.filter((s) => s.activa).map((s) => (
        <div key={s.id}>{secciones[s.id]?.()}</div>
      ))}
      {!gpx && tokens.seccionesEvento.some((s) => s.activa && (s.id === "mapa" || s.id === "vuelo3d")) && (
        <p className="mt-10 text-[15px]">El track de este recorrido se publicará próximamente.</p>
      )}
    </>
  );
}
