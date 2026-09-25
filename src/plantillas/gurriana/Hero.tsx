import type { EventoPublico } from "@/eventos/tipos";
import type { LibroDiseno } from "@/plantillas/libroDiseno";
import { diaMes, diaMesAbreviado, fechaLarga } from "@/eventos/useEventoPublico";

interface Props {
  evento: EventoPublico;
  tokens: LibroDiseno;
  onInscribirse: () => void;
  hrefRecorridos: string;
}

const ESTADO_TEXTO: Record<string, string> = {
  abierta: "Inscripciones abiertas",
  proximamente: "Inscripciones próximamente",
  cerrada: "Inscripciones cerradas",
  agotada: "Dorsales agotados",
  celebrada: "Carrera celebrada",
  borrador: "",
  suspendida: "Suspendida",
};

/**
 * Portada: fondo según el libro de diseño (foto de la carrera, color de marca
 * a secas, o color de marca con el logo como textura), titular, descripción,
 * botones y la tarjeta blanca con fecha, lugar y salidas.
 */
export function Hero({ evento, tokens, onInscribirse, hrefRecorridos }: Props) {
  const foto = tokens.hero === "foto" ? evento.imagenes?.hero ?? evento.imagenes?.imagen : undefined;
  const textura = tokens.hero === "textura" ? evento.imagenes?.logo : undefined;
  const { dia, mes } = diaMes(evento.fecha);
  const diaSemana = fechaLarga(evento.fecha).split(" ")[0];
  const abierta = evento.estado === "abierta";
  const pruebasConSalida = evento.pruebas.filter((p) => p.salida);

  return (
    <section id="top" className="pt-[72px]">
      <div className="relative w-full overflow-hidden" style={{ background: "var(--wp-marca)", color: "var(--wp-marca-texto)" }}>
        {foto && (
          <>
            <img src={foto} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: "center 35%" }} />
            <div className="absolute inset-0" style={{ backgroundColor: "rgba(15,26,8,0.52)" }} />
          </>
        )}
        {textura && !foto && (
          <img src={textura} alt="" aria-hidden="true" className="pointer-events-none absolute bottom-0 right-0 w-[140%] opacity-15 lg:w-[55%]" />
        )}

        <div className="relative mx-auto flex w-full max-w-[1296px] flex-col gap-8 px-5 py-16 lg:flex-row lg:items-end lg:justify-between lg:px-[72px] lg:py-24">
          <div className="max-w-2xl">
            <p className="wp-label" style={{ color: foto ? "#fff" : "var(--wp-marca-texto)", opacity: 0.85 }}>
              {[evento.deporte === "trail" ? "Carrera por montaña" : evento.deporte === "marcha" ? "Marcha popular" : "Carrera popular", evento.federacion]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <h1 className="mt-4" style={{ fontSize: "clamp(56px, 8vw, 104px)", lineHeight: 0.92, color: foto ? "#fff" : "var(--wp-marca-texto)" }}>
              {evento.nombre}
            </h1>
            {(evento.subtitulo || evento.descripcion) && (
              <p className="mt-5 max-w-xl text-base lg:text-lg" style={{ color: foto ? "#fff" : "var(--wp-marca-texto)", opacity: 0.9 }}>
                {evento.subtitulo ?? evento.descripcion}
              </p>
            )}
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              {abierta ? (
                <button type="button" onClick={onInscribirse} className="wp-btn" style={{ background: "#fff", color: "var(--wp-ink)" }}>
                  Inscríbete ahora
                </button>
              ) : (
                ESTADO_TEXTO[evento.estado] && (
                  <span className="wp-btn" style={{ background: "rgba(255,255,255,0.15)", color: "inherit", cursor: "default" }}>
                    {ESTADO_TEXTO[evento.estado]}
                  </span>
                )
              )}
              <a href={hrefRecorridos} className="wp-btn-outline" style={{ color: foto ? "#fff" : "var(--wp-marca-texto)" }}>
                Ver {evento.pruebas.length > 1 ? "recorridos" : "recorrido"}
              </a>
            </div>
          </div>

          <div className="wp-card w-full p-6 lg:w-[340px] lg:p-8" style={{ color: "var(--wp-body)" }}>
            <p className="wp-label">{diaSemana}</p>
            <p className="wp-num mt-2" style={{ fontSize: "56px", letterSpacing: "-0.5px" }}>
              {dia} {mes.toUpperCase()}
            </p>
            {evento.lugar?.nombre && <p className="mt-4 text-[15px] font-semibold" style={{ color: "var(--wp-ink)" }}>{evento.lugar.nombre}</p>}
            {(evento.lugar?.municipio || evento.lugar?.provincia) && (
              <p className="text-[15px]">{[evento.lugar.municipio, evento.lugar.provincia].filter(Boolean).join(", ")}</p>
            )}
            {pruebasConSalida.length > 0 && (
              <>
                <hr className="my-6" style={{ borderColor: "var(--wp-border)" }} />
                <div className="flex flex-wrap gap-x-8 gap-y-4">
                  {pruebasConSalida.slice(0, 4).map((p) => (
                    <div key={p.id}>
                      <p className="wp-display text-[24px]" style={{ color: p.color ?? "var(--wp-marca)" }}>{p.nombre}</p>
                      <p className="mt-1 text-sm tabular-nums">Salida {p.salida}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Franja oscura de cifras calculadas: nº de pruebas, dorsales, altitud máxima, cierre */
export function Cifras({ evento }: { evento: EventoPublico }) {
  const altMax = Math.max(0, ...evento.pruebas.map((p) => p.altMax ?? 0));
  const desnivelMax = Math.max(0, ...evento.pruebas.map((p) => p.desnivelPos ?? 0));
  const cifras: { valor: string; etiqueta: string; movil: boolean }[] = [
    { valor: String(evento.pruebas.length), etiqueta: evento.pruebas.length === 1 ? "recorrido" : `recorridos · ${evento.pruebas.map((p) => p.nombre).slice(0, 3).join(", ")}`, movil: false },
  ];
  if (evento.inscripcion.limiteDorsales) cifras.push({ valor: String(evento.inscripcion.limiteDorsales), etiqueta: "dorsales en total", movil: true });
  if (altMax > 0) cifras.push({ valor: `${altMax} m`, etiqueta: "altitud máxima", movil: true });
  else if (desnivelMax > 0) cifras.push({ valor: `+${desnivelMax} m`, etiqueta: "desnivel positivo", movil: true });
  if (evento.lugar?.zona) cifras.push({ valor: evento.lugar.zona.split(" ")[0], etiqueta: evento.lugar.zona, movil: false });
  // Fechas ISO, no el cierreTexto: de "Del 1 de noviembre al 7 de diciembre"
  // salía "1 NOV" como cierre. Antes de abrir, lo que interesa es la apertura.
  const { apertura, cierre } = evento.inscripcion;
  if (evento.estado === "proximamente" && apertura) cifras.push({ valor: diaMesAbreviado(apertura), etiqueta: "apertura de inscripciones", movil: true });
  else if (cierre) cifras.push({ valor: diaMesAbreviado(cierre), etiqueta: "cierre de inscripciones", movil: true });
  if (cifras.length < 2) return null;

  return (
    <div style={{ background: "var(--wp-dark)" }}>
      <div className="mx-auto grid max-w-[1296px] grid-cols-3 gap-6 px-5 py-10 lg:grid-cols-5 lg:px-[72px] lg:py-12">
        {cifras.map((c) => (
          <div key={c.etiqueta} className={c.movil ? "" : "hidden lg:block"}>
            <p className="wp-num" style={{ fontSize: "clamp(30px, 4vw, 44px)", color: "var(--wp-accion)" }}>{c.valor}</p>
            <p className="mt-2 text-[13px] lg:text-sm" style={{ color: "var(--wp-muted-dark)" }}>{c.etiqueta}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
