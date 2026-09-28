import { lazy, Suspense } from "react";
import { Navigation } from "lucide-react";
import type { EventoPublico, Patrocinador } from "@/eventos/tipos";
import { lugaresDeAcceso, urlComoLlegar, type LugarAcceso } from "@/eventos/normalizar";
import { iconoRutometro } from "@/lib/iconosRutometro";

// Mapbox solo se descarga si la carrera tiene sitios con coordenadas
const MapaLugares = lazy(() => import("@/components/MapaLugares").then((m) => ({ default: m.MapaLugares })));

const NOMBRE_TIPO: Record<LugarAcceso["tipo"], string> = {
  "salida-meta": "Salida y meta",
  salida: "Salida",
  meta: "Meta",
  parking: "Aparcamiento",
};
const TIPO_ICONO: Record<LugarAcceso["tipo"], string> = { "salida-meta": "start", salida: "start", meta: "finish", parking: "parking" };

/**
 * Cómo llegar: mapa con la salida, la meta y los aparcamientos del rutómetro,
 * y un botón de ruta en Google Maps por sitio. El texto de la web (si lo hay)
 * va encima como complemento.
 */
function ComoLlegar({ evento, texto }: { evento: EventoPublico; texto?: string }) {
  const lugares = lugaresDeAcceso(evento);
  const variasPruebas = evento.pruebas.length > 1;
  return (
    <article id="como-llegar" className="wp-card overflow-hidden lg:col-span-2" style={{ scrollMarginTop: 90 }}>
      <div className="p-[22px] lg:p-8">
        <h3 className="text-[24px] lg:text-[28px]">Cómo llegar</h3>
        {texto && <p className="mt-4 whitespace-pre-line text-[15px]">{texto}</p>}
      </div>
      <Suspense fallback={<div className="h-[360px] lg:h-[420px]" style={{ background: "var(--wp-cream)" }} />}>
        <MapaLugares
          lugares={lugares.map((l) => ({ lat: l.lat, lon: l.lon, nombre: l.tipo === "parking" ? l.nombre : NOMBRE_TIPO[l.tipo], tipo: TIPO_ICONO[l.tipo], detalle: l.detalle }))}
          color="var(--wp-marca)"
        />
      </Suspense>
      <ul className="grid grid-cols-1 gap-3 p-[22px] list-none m-0 sm:grid-cols-2 lg:grid-cols-3 lg:p-8">
        {lugares.map((l) => {
          const Icono = iconoRutometro(undefined, TIPO_ICONO[l.tipo]);
          return (
            <li key={`${l.lat},${l.lon}`} className="flex flex-col gap-3 rounded-lg p-4" style={{ background: "var(--wp-cream)" }}>
              <p className="flex items-start gap-2 text-[15px]">
                <Icono size={18} strokeWidth={2} aria-hidden="true" className="mt-0.5 shrink-0" style={{ color: "var(--wp-marca)" }} />
                <span>
                  <strong style={{ color: "var(--wp-ink)" }}>{l.tipo === "parking" ? l.nombre : NOMBRE_TIPO[l.tipo]}</strong>
                  {variasPruebas && l.tipo !== "parking" && <span className="block text-sm">{l.pruebas.join(" y ")}</span>}
                  {l.detalle && <span className="block text-sm">{l.detalle}</span>}
                </span>
              </p>
              <a href={urlComoLlegar(l)} target="_blank" rel="noopener noreferrer" className="wp-btn-outline mt-auto self-start text-sm" style={{ color: "var(--wp-ink)", minHeight: 40 }}>
                <Navigation size={16} strokeWidth={2} aria-hidden="true" />
                Cómo llegar
              </a>
            </li>
          );
        })}
      </ul>
    </article>
  );
}

/** Info práctica: cómo llegar, alojamiento, espectadores, FAQ. Solo lo que haya. */
export function InfoPractica({ evento }: { evento: EventoPublico }) {
  const ip = evento.infoPractica ?? {};
  const hayLugares = lugaresDeAcceso(evento).length > 0;
  if (!hayLugares && !ip.comoLlegar && !ip.parking && !ip.alojamiento && !ip.espectadores && !ip.transporte && !ip.faq?.length) return null;
  const bloques: { id: string; titulo: string; texto?: string }[] = [
    // Con sitios en el rutómetro, «Cómo llegar» va aparte con su mapa
    { id: "como-llegar", titulo: "Cómo llegar", texto: hayLugares ? undefined : ip.comoLlegar },
    { id: "parking", titulo: "Aparcamiento", texto: ip.parking },
    { id: "transporte", titulo: "Transporte", texto: ip.transporte },
    { id: "alojamiento", titulo: "Alojamiento", texto: ip.alojamiento },
    { id: "espectadores", titulo: "Espectadores", texto: ip.espectadores },
  ].filter((b) => b.texto);

  return (
    <section id="info" className="px-5 py-12 lg:px-[72px] lg:py-24" style={{ background: "var(--wp-cream)" }}>
      <div className="mx-auto max-w-[1296px]">
        <p className="wp-label">Info práctica</p>
        <h2 className="mt-4" style={{ fontSize: "clamp(40px, 5vw, 60px)" }}>Antes de salir de casa</h2>
        <div className="mt-10 grid grid-cols-1 gap-4 lg:mt-14 lg:grid-cols-2 lg:gap-8">
          {hayLugares && <ComoLlegar evento={evento} texto={ip.comoLlegar} />}
          {bloques.map((b) => (
            <article key={b.id} id={b.id} className="wp-card p-[22px] lg:p-8">
              <h3 className="text-[24px] lg:text-[28px]">{b.titulo}</h3>
              <p className="mt-4 whitespace-pre-line text-[15px]">{b.texto}</p>
            </article>
          ))}
          {ip.faq && ip.faq.length > 0 && (
            <article id="faq" className="wp-card p-[22px] lg:col-span-2 lg:p-8">
              <h3 className="text-[24px] lg:text-[28px]">Preguntas frecuentes</h3>
              <div className="mt-4 flex flex-col">
                {ip.faq.map((f) => (
                  <details key={f.p} className="border-b py-3 last:border-b-0" style={{ borderColor: "var(--wp-border)" }}>
                    <summary className="cursor-pointer text-[16px] font-semibold" style={{ color: "var(--wp-ink)" }}>{f.p}</summary>
                    <p className="mt-2 whitespace-pre-line text-[15px]">{f.r}</p>
                  </details>
                ))}
              </div>
            </article>
          )}
        </div>
      </div>
    </section>
  );
}

/** Medioambiente: bloque oscuro con la imagen si la hay */
export function Medioambiente({ evento }: { evento: EventoPublico }) {
  const ma = evento.medioAmbiente;
  if (!ma) return null;
  return (
    <section id="medioambiente" className="px-5 py-12 lg:px-[72px] lg:py-24">
      <div className="mx-auto grid max-w-[1296px] grid-cols-1 overflow-hidden rounded-[20px] lg:grid-cols-2">
        <div className="h-[240px] lg:h-auto" style={{ background: "var(--wp-dark-2)" }}>
          {evento.imagenes?.bosque && <img src={evento.imagenes.bosque} alt="" className="h-full w-full object-cover" />}
        </div>
        <div className="p-7 lg:p-14" style={{ background: "var(--wp-dark-2)" }}>
          <p className="wp-label" style={{ color: "var(--wp-accion)" }}>Medio ambiente</p>
          <h2 className="mt-4" style={{ fontSize: "clamp(32px, 3.6vw, 48px)", color: "#fff" }}>
            {ma.espacio ? `Corremos por ${ma.espacio}.` : "Cuidamos el monte por el que corremos."}
          </h2>
          {(ma.habitats || ma.especies) && (
            <p className="mt-6 text-[17px]" style={{ color: "var(--wp-muted-dark)" }}>
              {[ma.habitats, ma.especies].filter(Boolean).join("; ")}.
            </p>
          )}
          {ma.normas && <p className="mt-4 text-[17px]" style={{ color: "var(--wp-muted-dark)" }}>{ma.normas}</p>}
          {ma.adhesion && <p className="mt-6 text-sm" style={{ color: "var(--wp-muted-dark)" }}>Adheridos al {ma.adhesion}.</p>}
        </div>
      </div>
    </section>
  );
}

/** Causa solidaria (carreras benéficas) */
export function Beneficiario({ evento }: { evento: EventoPublico }) {
  const b = evento.beneficiario;
  if (!b) return null;
  return (
    <section id="beneficiario" className="px-5 py-12 lg:px-[72px] lg:py-24">
      <div className="mx-auto max-w-[1296px] wp-card grid grid-cols-1 gap-8 p-[22px] lg:grid-cols-[auto_1fr] lg:items-center lg:p-10">
        {b.logo && <img src={b.logo} alt={b.nombre} className="h-24 w-auto object-contain" />}
        <div>
          <p className="wp-label">Corremos a favor de</p>
          <h2 className="mt-3" style={{ fontSize: "clamp(32px, 4vw, 48px)" }}>{b.nombre}</h2>
          {b.texto && <p className="mt-4 text-[16px] lg:text-lg">{b.texto}</p>}
          {b.web && (
            <a href={b.web} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block text-[15px] font-semibold" style={{ color: "var(--wp-marca)" }}>
              Conoce su labor →
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

const NIVEL_TITULO: Record<string, string> = {
  organiza: "Organiza",
  principal: "Patrocinador principal",
  institucional: "Con el apoyo de",
  beneficiario: "A favor de",
  colaborador: "Colaboran",
};
const ORDEN_NIVEL = ["organiza", "principal", "institucional", "beneficiario", "colaborador"];

/** Patrocinadores por nivel: logos si los hay, chips de texto si no */
export function Patrocinadores({ evento }: { evento: EventoPublico }) {
  const lista = evento.patrocinadores ?? [];
  if (lista.length === 0) return null;
  const grupos = ORDEN_NIVEL.map((n) => ({ nivel: n, items: lista.filter((p) => (p.nivel ?? "colaborador") === n) })).filter((g) => g.items.length > 0);
  return (
    <section id="patrocinadores" className="px-5 pb-12 lg:px-[72px] lg:pb-24">
      <div className="mx-auto max-w-[1296px] text-center">
        {grupos.map((g) => (
          <div key={g.nivel} className="mt-10 first:mt-0">
            <p className="wp-label">{NIVEL_TITULO[g.nivel]}</p>
            <ul className="mt-6 flex flex-wrap items-center justify-center gap-4 list-none p-0 m-0">
              {g.items.map((p: Patrocinador) => (
                <li key={p.nombre}>
                  {p.logo ? (
                    // Tarjeta de tamaño fijo: escudos altos, logos cuadrados o apaisados
                    // ocupan la misma caja (object-contain) y quedan proporcionados
                    <a
                      href={p.web}
                      target={p.web ? "_blank" : undefined}
                      rel="noopener noreferrer"
                      className="flex w-[152px] flex-col items-center gap-2 rounded-[var(--wp-radio,16px)] border bg-white px-3 pb-3 pt-4 no-underline shadow-sm transition-shadow hover:shadow-md"
                      style={{ borderColor: "var(--wp-border)", color: "var(--wp-ink)" }}
                      title={p.nombre}
                    >
                      <span className={`flex w-full items-center justify-center ${g.nivel === "organiza" || g.nivel === "principal" ? "h-[112px]" : "h-[96px]"}`}>
                        <img src={p.logo} alt={p.nombre} className="max-h-full max-w-full object-contain" loading="lazy" />
                      </span>
                      <span className="text-center text-[12px] font-semibold leading-tight">{p.nombre}</span>
                    </a>
                  ) : (
                    <span className="inline-block rounded-lg border bg-white px-4 py-2 text-[15px] font-semibold" style={{ borderColor: "var(--wp-border)" }}>
                      {p.web ? <a href={p.web} target="_blank" rel="noopener noreferrer" className="no-underline" style={{ color: "inherit" }}>{p.nombre}</a> : p.nombre}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
