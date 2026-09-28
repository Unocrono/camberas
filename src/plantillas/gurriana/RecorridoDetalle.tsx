import { lazy, Suspense, type CSSProperties, type ReactNode } from "react";
import { Download, MapPin, Plane, Map as MapaIcono } from "lucide-react";
import type { EventoPublico, Prueba, Tarifa } from "@/eventos/tipos";
import type { RutasWeb } from "@/eventos/menu";
import { formatoPrecio, precioVigente } from "@/eventos/useEventoPublico";
import { useTenant } from "@/tenant/TenantContext";
import type { LibroDiseno, SeccionEventoId } from "@/plantillas/libroDiseno";
import { ESTADO_BOTON, PerfilAltimetria } from "./Recorridos";
import { iconoRutometro } from "@/lib/iconosRutometro";
import { RITMO_CORTE, RITMO_PRIMERO, horaDePaso, ritmoATexto, ritmosDe } from "@/lib/ritmos";

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
  const ritmos = ritmosDe(prueba.rutometro?.ritmos);
  const hayHoras = !!prueba.salida && !!(ritmos.primero || ritmos.corte);
  const kmTexto = (km: number) => String(Math.round(km * 10) / 10).replace(".", ",");
  // Horarios en dos columnas con cabecera, «Primero» y «Cierre» (solo con ritmos)
  const conPrimero = hayHoras && !!ritmos.primero;
  const conCierre = hayHoras && !!ritmos.corte;
  const colsRutometro = [
    "56px minmax(0,1fr)",
    conPrimero ? "52px" : "",
    conCierre ? "52px" : "",
  ].filter(Boolean).join(" ");
  const colsRutometroSm = [
    "72px minmax(0,1fr) 64px",
    conPrimero ? "72px" : "",
    conCierre ? "72px" : "",
  ].filter(Boolean).join(" ");
  const estiloCols = { "--cols": colsRutometro, "--cols-sm": colsRutometroSm } as CSSProperties;
  const claseFila = "grid gap-x-3 [grid-template-columns:var(--cols)] sm:[grid-template-columns:var(--cols-sm)]";
  // En móvil el nombre ocupa la fila y las horas bajan a una segunda línea,
  // alineadas bajo su cabecera; desde sm, todo en una fila
  const spanPunto = hayHoras ? (conPrimero && conCierre ? "col-span-3 sm:col-span-1" : "col-span-2 sm:col-span-1") : "";
  const primeraHora = "col-start-3 sm:col-start-auto";
  const Cabecera = ({ primera }: { primera: string }) => (
    <div className={`${claseFila} px-4 pb-1 text-[12px] font-semibold uppercase tracking-[1px]`} style={{ ...estiloCols, color: "var(--wp-body)" }}>
      <span>km</span>
      <span>{primera}</span>
      <span className="hidden text-right sm:block">Parcial</span>
      {conPrimero && <span className="text-right">Primero</span>}
      {conCierre && <span className="text-right">Cierre</span>}
    </div>
  );
  // Tipos de avituallamiento presentes, para la leyenda
  const leyenda = Array.from(
    new Map(
      (prueba.avituallamientos ?? [])
        .filter((a) => a.etiqueta && a.tipo !== "start" && a.tipo !== "finish")
        .map((a) => [a.etiqueta as string, a]),
    ).values(),
  );

  const secciones: Record<SeccionEventoId, () => ReactNode> = {
    cifras: () => (
      <>
        <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
          {prueba.distanciaTexto && <Dato valor={prueba.distanciaTexto} etiqueta="distancia" />}
          {prueba.desnivelPos != null && <Dato valor={`+${prueba.desnivelPos} m`} etiqueta="desnivel positivo" />}
          {prueba.altMax != null && <Dato valor={`${prueba.altMax} m`} etiqueta="altitud máxima" />}
          {prueba.altMin != null && <Dato valor={`${prueba.altMin} m`} etiqueta="altitud mínima" />}
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
          {hayHoras && (
            <p className="mt-2 text-sm">
              {[
                ritmos.primero && RITMO_PRIMERO.nombre + " " + ritmoATexto(ritmos.primero) + " min/km",
                ritmos.corte && RITMO_CORTE.nombre.toLowerCase() + " " + ritmoATexto(ritmos.corte) + " min/km",
              ]
                .filter(Boolean)
                .join(" · ")}
              . Horas estimadas desde la salida prevista de las {prueba.salida}.
            </p>
          )}
          {prueba.rutometro.puntos && prueba.rutometro.puntos.length > 0 && (
            <>
            {hayHoras && <div className="mt-4"><Cabecera primera="Punto" /></div>}
            <ol className={`${hayHoras ? "" : "mt-4 "}flex flex-col gap-2 list-none p-0 m-0`}>
              {prueba.rutometro.puntos.map((p, i) => (
                <li key={`${p.km}-${i}`} className={`${claseFila} items-start rounded-lg px-4 py-3 text-[15px]`} style={{ ...estiloCols, background: p.destacado ? "var(--wp-claro, var(--wp-cream))" : "var(--wp-cream)" }}>
                  <span className="wp-num text-[18px]" style={{ color: "var(--wp-ink)" }}>{kmTexto(p.km)}</span>
                  <span className={`min-w-0 ${spanPunto}`}>
                    <strong style={{ color: "var(--wp-ink)" }}>{p.descripcion}</strong>
                    {p.etiqueta && <span className="ml-2 text-[12px] font-semibold uppercase tracking-[1px]" style={{ color: "var(--wp-body)" }}>{p.etiqueta}</span>}
                    {(p.via || p.notas || p.altitud != null) && (
                      <span className="block text-sm">{[p.via, p.altitud != null ? `${p.altitud} m` : null, p.notas].filter(Boolean).join(" · ")}</span>
                    )}
                  </span>
                  <span className="hidden text-right text-sm tabular-nums sm:block">{p.kmParcial ? `+${kmTexto(p.kmParcial)} km` : ""}</span>
                  {conPrimero && <span className={`${primeraHora} text-right text-sm tabular-nums`}>{horaDePaso(prueba.salida, p.km, ritmos.primero)}</span>}
                  {conCierre && <span className={`${conPrimero ? "" : primeraHora} text-right text-sm tabular-nums`}>{horaDePaso(prueba.salida, p.km, ritmos.corte)}</span>}
                </li>
              ))}
            </ol>
            </>
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
          {leyenda.length > 0 && (
            <ul className="mb-4 flex flex-wrap gap-x-5 gap-y-2 text-sm list-none p-0 m-0">
              {leyenda.map((a) => {
                const Icono = iconoRutometro(a.icono, a.tipo);
                return (
                  <li key={a.etiqueta} className="inline-flex items-center gap-2">
                    <Icono size={16} strokeWidth={2} aria-hidden="true" style={{ color }} />
                    {a.etiqueta}
                  </li>
                );
              })}
            </ul>
          )}
          {hayHoras && <Cabecera primera="Punto" />}
          <ul className="flex flex-col gap-2 list-none p-0 m-0">
            {prueba.avituallamientos.map((a, i) => {
              const Icono = iconoRutometro(a.icono, a.tipo);
              const esExtremo = a.tipo === "start" || a.tipo === "finish";
              return (
                <li key={`${a.nombre}-${a.km}-${i}`} className={`${claseFila} items-center rounded-lg px-4 py-3 text-[15px]`} style={{ ...estiloCols, background: "var(--wp-cream)" }}>
                  <span className="wp-num text-[18px]" style={{ color: "var(--wp-ink)" }}>{kmTexto(a.km)}</span>
                  <span className={`flex min-w-0 items-start gap-2 ${spanPunto}`}>
                    <Icono size={18} strokeWidth={2} aria-hidden="true" className="mt-0.5 shrink-0" style={{ color }} />
                    <span className="min-w-0">
                      <strong style={{ color: "var(--wp-ink)" }}>{a.nombre}</strong>
                      {a.lugar && a.lugar !== a.nombre ? ` · ${a.lugar}` : ""}
                      {(!esExtremo && (a.etiqueta || a.control)) || a.corte ? (
                        <span className="block text-sm">
                          {[!esExtremo ? a.etiqueta : null, !esExtremo && a.control ? "control de paso" : null].filter(Boolean).join(" · ")}
                          {a.corte && (
                            <span className="wp-num ml-2 text-[16px]" style={{ color: "var(--wp-red)" }}>
                              corte oficial {a.corte}
                            </span>
                          )}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <span className="hidden sm:block" />
                  {conPrimero && <span className={`${primeraHora} text-right text-sm tabular-nums`}>{a.pasoPrimero ?? ""}</span>}
                  {conCierre && <span className={`${conPrimero ? "" : primeraHora} text-right text-sm tabular-nums`}>{a.cierreEstimado ?? ""}</span>}
                </li>
              );
            })}
          </ul>
          {prueba.avituallamientos.some((a) => a.pasoPrimero || a.cierreEstimado) && (
            <p className="mt-4 text-sm">
              Horas estimadas con los ritmos del rutómetro, sin contar el desnivel. Los cortes oficiales mandan.
            </p>
          )}
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
