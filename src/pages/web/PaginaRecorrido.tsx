import { lazy } from "react";
import { useParams } from "react-router-dom";
import { Download, MapPin, Plane } from "lucide-react";
import { ESTADO_BOTON, PerfilAltimetria } from "@/plantillas/gurriana/Recorridos";
import { formatoPrecio } from "@/eventos/useEventoPublico";
import { PaginaSecundaria, TituloInterior } from "./PaginaSecundaria";
import NoEncontradoWeb from "./NoEncontradoWeb";

// Mapbox y el visor 3D solo se descargan en esta página
const RouteFlightViewer = lazy(() => import("@/components/RouteFlightViewer").then((m) => ({ default: m.RouteFlightViewer })));
const RoutePreviewMap = lazy(() => import("@/components/RoutePreviewMap").then((m) => ({ default: m.RoutePreviewMap })));

const TIPO_TEXTO: Record<string, string> = { carrera: "Carrera", marcha: "Marcha", infantil: "Infantil", relevos: "Relevos", km_vertical: "Kilómetro vertical" };

/**
 * Un solo recorrido, con todo lo suyo: cifras, descripción y relato, perfil
 * real (GPX), mapa, vuelo 3D, descarga, terreno, avituallamientos y cortes,
 * y el botón de inscribirse a ESE recorrido. Es la página a la que lleva el
 * menú «Recorridos»; en la portada están todos juntos.
 */
export default function PaginaRecorrido() {
  const { pruebaId } = useParams();
  return (
    <PaginaSecundaria titulo="Recorrido">
      {(evento, rutas) => {
        const prueba = evento.pruebas.find((p) => p.id === pruebaId);
        if (!prueba) return <NoEncontradoWeb />;
        const gpx = prueba.track?.gpx;
        const estado = prueba.estado ?? evento.estado;
        const abierta = estado === "abierta";
        const color = prueba.color ?? "var(--wp-marca)";
        const otras = evento.pruebas.filter((p) => p.id !== prueba.id);
        return (
          <>
            <TituloInterior etiqueta={`${TIPO_TEXTO[prueba.tipo] ?? "Recorrido"}${prueba.competitiva === false ? " · no competitiva" : ""}`} titulo={prueba.nombre} rutas={rutas} />
            <div className="mx-auto max-w-[1296px] px-5 pb-16 pt-8 lg:px-[72px] lg:pb-24">
              {/* Otros recorridos, para cambiar sin volver a la portada */}
              {otras.length > 0 && (
                <p className="mb-8 flex flex-wrap items-center gap-2 text-[14px]">
                  <span className="wp-label">Ver también</span>
                  {otras.map((p) => (
                    <a key={p.id} href={rutas.a(`/recorrido/${p.id}`)} className="rounded-full border px-3 py-1 font-semibold no-underline hover:underline" style={{ borderColor: "var(--wp-border)", color: "var(--wp-ink)" }}>
                      {p.nombre}
                    </a>
                  ))}
                </p>
              )}

              <div className="grid grid-cols-2 gap-5 lg:grid-cols-6">
                {prueba.distanciaTexto && <Dato valor={prueba.distanciaTexto} etiqueta="distancia" />}
                {prueba.desnivelPos != null && <Dato valor={`+${prueba.desnivelPos} m`} etiqueta="desnivel positivo" />}
                {prueba.desnivelNeg != null && <Dato valor={`−${prueba.desnivelNeg} m`} etiqueta="desnivel negativo" />}
                {prueba.altMax != null && <Dato valor={`${prueba.altMax} m`} etiqueta="altitud máxima" />}
                {prueba.salida && <Dato valor={`${prueba.salida} h`} etiqueta="salida" />}
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
              {prueba.descripcion && <p className="mt-4 max-w-[820px] text-[17px] leading-relaxed" style={{ color: "var(--wp-ink)" }}>{prueba.descripcion}</p>}
              {prueba.relato && (
                <div className="mt-4 max-w-[820px] text-[15px] leading-relaxed">
                  {prueba.relato.split(/\n+/).map((parrafo, i) => (
                    <p key={i} className={i > 0 ? "mt-3" : ""}>{parrafo}</p>
                  ))}
                </div>
              )}

              {/* Perfil: real si hay GPX; si no, el esquema de avituallamientos */}
              {(gpx || (prueba.avituallamientos && prueba.avituallamientos.length > 0)) && (
                <div className="wp-card mt-10 p-[22px] lg:p-8">
                  <h2 className="text-[24px] lg:text-[28px]" style={{ color }}>Perfil</h2>
                  <div className="mt-6">
                    <PerfilAltimetria prueba={prueba} />
                  </div>
                </div>
              )}

              {/* Botones debajo del perfil: inscribirse y saltar al mapa, al vuelo 3D y al GPX */}
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
                {prueba.track?.wikiloc && (
                  <a href={prueba.track.wikiloc} target="_blank" rel="noopener noreferrer" className="wp-btn-outline" style={{ color: "var(--wp-ink)" }}>
                    Ver en Wikiloc
                  </a>
                )}
                {prueba.track?.mapa && (
                  <a href={prueba.track.mapa} target="_blank" rel="noopener noreferrer" className="wp-btn-outline" style={{ color: "var(--wp-ink)" }}>
                    Rutómetro
                  </a>
                )}
              </div>

              {prueba.terreno && prueba.terreno.length > 0 && (
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
              )}

              {gpx ? (
                <div className="mt-10 flex flex-col gap-6">
                  <section id="mapa" className="wp-card overflow-hidden" style={{ scrollMarginTop: 90 }}>
                    <h2 className="px-[22px] pt-[22px] text-[24px] lg:px-8 lg:pt-8 lg:text-[28px]" style={{ color }}>Mapa</h2>
                    <div className="mt-4 overflow-hidden">
                      <RoutePreviewMap gpxUrl={gpx} distanceName={prueba.nombre} />
                    </div>
                  </section>
                  <section id="vuelo-3d" className="wp-card overflow-hidden" style={{ scrollMarginTop: 90 }}>
                    <h2 className="px-[22px] pt-[22px] text-[24px] lg:px-8 lg:pt-8 lg:text-[28px]" style={{ color }}>Vuelo 3D</h2>
                    <div className="mt-4 overflow-hidden" style={{ minHeight: 420 }}>
                      <RouteFlightViewer gpxUrl={gpx} distanceName={prueba.nombre} />
                    </div>
                  </section>
                </div>
              ) : (
                <p className="mt-10 text-[15px]">El track de este recorrido se publicará próximamente.</p>
              )}

              {prueba.avituallamientos && prueba.avituallamientos.length > 0 && (
                <div className="wp-card mt-10 p-[22px] lg:p-8">
                  <h2 className="text-[24px] lg:text-[28px]">Avituallamientos y controles</h2>
                  <ul className="mt-6 flex flex-col gap-2 list-none p-0 m-0">
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
                </div>
              )}
            </div>
          </>
        );
      }}
    </PaginaSecundaria>
  );
}

function Dato({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  return (
    <div>
      <p className="wp-num" style={{ fontSize: "30px" }}>{valor}</p>
      <p className="mt-1 text-sm">{etiqueta}</p>
    </div>
  );
}
