import { lazy } from "react";
import { useParams } from "react-router-dom";
import { Download } from "lucide-react";
import { PerfilAltimetria } from "@/plantillas/gurriana/Recorridos";
import { PaginaSecundaria, TituloInterior } from "./PaginaSecundaria";
import NoEncontradoWeb from "./NoEncontradoWeb";

// Mapbox y el visor 3D solo se descargan en esta página
const RouteFlightViewer = lazy(() => import("@/components/RouteFlightViewer").then((m) => ({ default: m.RouteFlightViewer })));
const RoutePreviewMap = lazy(() => import("@/components/RoutePreviewMap").then((m) => ({ default: m.RoutePreviewMap })));

/** Un recorrido: mapa, vuelo 3D, GPX, avituallamientos, cortes */
export default function PaginaRecorrido() {
  const { pruebaId } = useParams();
  return (
    <PaginaSecundaria titulo="Recorrido">
      {(evento, rutas) => {
        const prueba = evento.pruebas.find((p) => p.id === pruebaId);
        if (!prueba) return <NoEncontradoWeb />;
        const gpx = prueba.track?.gpx;
        return (
          <>
            <TituloInterior etiqueta="Recorrido" titulo={prueba.nombre} rutas={rutas} />
            <div className="mx-auto max-w-[1296px] px-5 pb-16 pt-10 lg:px-[72px] lg:pb-24">
              <div className="grid grid-cols-2 gap-5 lg:grid-cols-5">
                {prueba.distanciaTexto && <Dato valor={prueba.distanciaTexto} etiqueta="distancia" />}
                {prueba.desnivelPos != null && <Dato valor={`+${prueba.desnivelPos} m`} etiqueta="desnivel positivo" />}
                {prueba.desnivelNeg != null && <Dato valor={`−${prueba.desnivelNeg} m`} etiqueta="desnivel negativo" />}
                {prueba.altMax != null && <Dato valor={`${prueba.altMax} m`} etiqueta="altitud máxima" />}
                {prueba.salida && <Dato valor={`${prueba.salida} h`} etiqueta="salida" />}
                {prueba.limite && <Dato valor={prueba.limite} etiqueta="tiempo límite" />}
              </div>

              {gpx ? (
                <div className="mt-10 flex flex-col gap-6">
                  <div className="wp-card overflow-hidden">
                    <RoutePreviewMap gpxUrl={gpx} distanceName={prueba.nombre} />
                  </div>
                  <div className="wp-card overflow-hidden" style={{ minHeight: 420 }}>
                    <RouteFlightViewer gpxUrl={gpx} distanceName={prueba.nombre} />
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <a href={gpx} download className="wp-btn-outline" style={{ color: "var(--wp-ink)" }}>
                      <Download size={18} strokeWidth={2} aria-hidden="true" />
                      Descargar GPX
                    </a>
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
                </div>
              ) : (
                <p className="mt-10 text-[15px]">El track de este recorrido se publicará próximamente.</p>
              )}

              {prueba.avituallamientos && prueba.avituallamientos.length > 0 && (
                <div className="wp-card mt-10 p-[22px] lg:p-8">
                  <h2 className="text-[24px] lg:text-[28px]">Avituallamientos y controles</h2>
                  <div className="mt-6">
                    <PerfilAltimetria prueba={prueba} />
                  </div>
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
