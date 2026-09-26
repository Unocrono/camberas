import { Download, MapPin } from "lucide-react";
import type { EventoPublico, Prueba } from "@/eventos/tipos";
import type { RutasWeb } from "@/eventos/menu";
import { formatoPrecio } from "@/eventos/useEventoPublico";
import { PerfilGpxSvg, usePerfilGpx } from "./PerfilGpx";

interface Props {
  evento: EventoPublico;
  rutas: RutasWeb;
  onInscribirse: (pruebaId: string) => void;
}

const ESTADO_BOTON: Record<string, string> = {
  abierta: "Inscribirme",
  proximamente: "Próximamente",
  cerrada: "Inscripción cerrada",
  agotada: "Completo",
  celebrada: "Ver resultados",
};

const TIPO_TEXTO: Record<string, string> = {
  carrera: "Carrera",
  marcha: "Marcha",
  infantil: "Infantil",
  relevos: "Relevos",
  km_vertical: "Kilómetro vertical",
};

function Cifra({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  return (
    <div>
      <p className="wp-num" style={{ fontSize: "30px" }}>{valor}</p>
      <p className="mt-1 text-sm">{etiqueta}</p>
    </div>
  );
}

/**
 * Perfil esquemático del recorrido: una línea con los avituallamientos y
 * controles colocados por km. No inventa alturas: si no hay altMax/altMin,
 * solo pinta los puntos. (El perfil real sale del GPX en la página del
 * recorrido, con el visor 3D de Camberas.)
 */
export function PerfilAltimetria({ prueba }: { prueba: Prueba }) {
  // Con GPX, perfil real (PerfilGpx.tsx); mientras carga o sin GPX, el esquema
  const perfil = usePerfilGpx(prueba.track?.gpx);
  if (perfil) return <PerfilGpxSvg perfil={perfil} prueba={prueba} />;
  return <PerfilEsquematico prueba={prueba} />;
}

function PerfilEsquematico({ prueba }: { prueba: Prueba }) {
  const km = prueba.distancia ? prueba.distancia / 1000 : undefined;
  const puntos = (prueba.avituallamientos ?? []).filter((a) => km == null || a.km <= km + 0.01);
  if (!km || puntos.length === 0) return null;
  const W = 600;
  const H = 72;
  const x = (k: number) => 16 + (k / km) * (W - 32);
  const color = prueba.color ?? "var(--wp-marca)";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Avituallamientos de ${prueba.nombre}`}>
      <line x1={16} y1={40} x2={W - 16} y2={40} stroke={color} strokeWidth={3} strokeLinecap="round" />
      {puntos.map((p) => {
        const liquido = p.tipo === "liquido" || p.tipo === "standard";
        const meta = p.tipo === "finish" || p.km >= km - 0.05;
        return (
          <g key={`${p.nombre}-${p.km}`}>
            <circle cx={x(p.km)} cy={40} r={meta ? 7 : 5} fill={meta ? "var(--wp-ink)" : liquido ? "var(--wp-secundario)" : "var(--wp-accion)"} stroke="#fff" strokeWidth={2} />
            <text x={x(p.km)} y={62} textAnchor="middle" fontSize={11} fill="var(--wp-body)">
              km {String(p.km).replace(".", ",")}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function TarjetaPrueba({ prueba, evento, rutas, onInscribirse }: { prueba: Prueba; evento: EventoPublico; rutas: RutasWeb; onInscribirse: (id: string) => void }) {
  const estado = prueba.estado ?? evento.estado;
  const abierta = estado === "abierta";
  const color = prueba.color ?? "var(--wp-marca)";
  const cortes = (prueba.avituallamientos ?? []).filter((a) => a.corte);
  return (
    <article id={`prueba-${prueba.id}`} className="wp-card p-[22px] lg:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h3 style={{ fontSize: "clamp(36px, 5vw, 56px)", color }}>{prueba.nombre}</h3>
          <span className="text-[13px] font-semibold uppercase tracking-[1px]">
            {TIPO_TEXTO[prueba.tipo] ?? prueba.tipo}
            {prueba.competitiva === false ? " · no competitiva" : ""}
          </span>
        </div>
        {prueba.marcaje && (
          <p className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[1px]">
            <span aria-hidden="true" className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
            Marcaje {prueba.marcaje}
          </p>
        )}
      </header>

      <div className="mt-7 grid grid-cols-2 gap-5 lg:grid-cols-4">
        {prueba.distanciaTexto && <Cifra valor={prueba.distanciaTexto} etiqueta="distancia" />}
        {prueba.desnivelPos != null && <Cifra valor={`+${prueba.desnivelPos} m`} etiqueta="desnivel positivo" />}
        {prueba.altMax != null && <Cifra valor={`${prueba.altMax} m`} etiqueta="altitud máx." />}
        {prueba.limite && <Cifra valor={prueba.limite} etiqueta="tiempo límite" />}
        {prueba.precio != null && <Cifra valor={formatoPrecio(prueba.precio)} etiqueta="inscripción" />}
      </div>

      {(prueba.salida || prueba.municipios || prueba.altMin != null || prueba.lugarSalida) && (
        <p className="mt-6 text-[15px]">
          {[
            prueba.municipios,
            prueba.salida ? `Salida ${prueba.salida} h` : null,
            prueba.lugarSalida ? `desde ${prueba.lugarSalida}` : null,
            prueba.altMin != null ? `Altitud mínima ${prueba.altMin} m` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      {prueba.descripcion && <p className="mt-3 text-[15px]">{prueba.descripcion}</p>}

      <div className="mt-7">
        <PerfilAltimetria prueba={prueba} />
      </div>

      {prueba.terreno && prueba.terreno.length > 0 && (
        <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-3">
          {prueba.terreno.map(([tipo, dist]) => (
            <p key={tipo} className="rounded-md px-3 py-2 text-[13px]" style={{ background: "var(--wp-cream)" }}>
              {tipo} · <span className="font-semibold" style={{ color: "var(--wp-ink)" }}>{dist}</span>
            </p>
          ))}
        </div>
      )}

      {prueba.avituallamientos && prueba.avituallamientos.length > 0 && (
        <div className="mt-8 border-t pt-7" style={{ borderColor: "var(--wp-border)" }}>
          <p className="wp-label">Avituallamientos y controles</p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {prueba.avituallamientos.map((a, i) => {
              const esMeta = a.tipo === "finish" || i === prueba.avituallamientos!.length - 1;
              return (
                <div
                  key={`${a.nombre}-${a.km}`}
                  className="rounded-[14px] border p-4"
                  style={{
                    background: esMeta ? "var(--wp-dark)" : "var(--wp-cream)",
                    color: esMeta ? "#fff" : "var(--wp-ink)",
                    borderColor: esMeta ? "var(--wp-dark)" : "var(--wp-border)",
                    borderTop: `4px solid ${esMeta ? "var(--wp-accion)" : a.tipo === "liquido" || a.tipo === "standard" ? "var(--wp-secundario)" : "var(--wp-accion)"}`,
                  }}
                >
                  <p className="wp-display text-[20px]" style={{ color: "inherit" }}>
                    km {String(a.km).replace(".", ",")}
                  </p>
                  <p className="mt-1 text-sm" style={{ opacity: 0.85 }}>
                    {a.nombre}
                    {a.lugar && a.lugar !== a.nombre ? ` · ${a.lugar}` : ""}
                  </p>
                  {a.corte && (
                    <p className="mt-1 text-sm font-semibold" style={{ color: esMeta ? "var(--wp-accion)" : "var(--wp-red)" }}>
                      corte {a.corte}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          {cortes.length > 0 && (
            <p className="mt-3 text-sm">Los cortes son horas de paso máximas: quien llegue después queda fuera de carrera.</p>
          )}
        </div>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-3">
        {estado === "celebrada" && evento.clasificaciones?.url ? (
          <a href={evento.clasificaciones.url} className="wp-btn">Ver resultados</a>
        ) : (
          <button type="button" className="wp-btn" disabled={!abierta} onClick={() => onInscribirse(prueba.id)}>
            {ESTADO_BOTON[estado] ?? "Inscribirme"}
          </button>
        )}
        {(prueba.track?.gpx || prueba.track?.mapa || prueba.track?.wikiloc) && (
          <a href={rutas.a(`/recorrido/${prueba.id}`)} className="inline-flex items-center gap-2 text-[15px] font-semibold no-underline" style={{ color }}>
            <MapPin size={18} strokeWidth={2} aria-hidden="true" />
            Ver recorrido
          </a>
        )}
        {prueba.track?.gpx && (
          <a href={prueba.track.gpx} download className="inline-flex items-center gap-2 text-[15px] font-semibold no-underline" style={{ color }}>
            <Download size={18} strokeWidth={2} aria-hidden="true" />
            GPX
          </a>
        )}
        {prueba.plazasLibres != null && evento.inscripcion.mostrarPlazas && (
          <span className="text-sm">{prueba.plazasLibres} plazas libres</span>
        )}
      </div>
    </article>
  );
}

export function Recorridos({ evento, rutas, onInscribirse }: Props) {
  if (evento.pruebas.length === 0) return null;
  return (
    <section id="recorridos" className="px-5 py-12 lg:px-[72px] lg:py-24">
      <div className="mx-auto max-w-[1296px]">
        <p className="wp-label">{evento.pruebas.length > 1 ? "Recorridos y modalidades" : "Recorrido"}</p>
        <h2 className="mt-4" style={{ fontSize: "clamp(40px, 5vw, 60px)" }}>
          {evento.pruebas.length > 1 ? "Elige tu distancia" : evento.pruebas[0].nombre}
        </h2>
        <div className="mt-10 grid grid-cols-1 gap-4 lg:mt-14 lg:gap-8">
          {evento.pruebas.map((p) => (
            <TarjetaPrueba key={p.id} prueba={p} evento={evento} rutas={rutas} onInscribirse={onInscribirse} />
          ))}
        </div>
      </div>
    </section>
  );
}
