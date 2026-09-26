import { Check, Lock } from "lucide-react";
import type { EventoPublico } from "@/eventos/tipos";
import { fechaLarga, formatoPrecio, precioVigente } from "@/eventos/useEventoPublico";
import { useTenant } from "@/tenant/TenantContext";

interface Props {
  evento: EventoPublico;
  onInscribirse: (pruebaId: string) => void;
}

function fechaCorta(iso?: string): string {
  if (!iso) return "";
  // Solo el día, tal cual: los plazos son hora local y no se convierten
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("es-ES", { day: "numeric", month: "short" }).replace(".", "");
}

/**
 * Precios y plazos: una fila por tarifa (recorrido) con el precio vigente y,
 * si hay tramos, la tabla de periodos con el vigente resaltado. Debajo: qué
 * incluye, devoluciones y equipos si existen.
 */
export function Inscripcion({ evento, onInscribirse }: Props) {
  const { urlCamberas } = useTenant();
  const ins = evento.inscripcion;
  const abierta = evento.estado === "abierta";
  const hayTramos = ins.tarifas.some((t) => t.periodos.length > 1);
  const devolucion = ins.devolucion;
  const devolucionTramos = Array.isArray(devolucion) ? devolucion : null;
  const devolucionTexto = !Array.isArray(devolucion) ? devolucion : null;
  const equipo = Array.isArray(ins.equipo) ? ins.equipo : null;

  return (
    <section id="inscripcion" className="px-5 py-12 lg:px-[72px] lg:py-24">
      <div className="mx-auto max-w-[1296px]">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <p className="wp-label">Inscripción</p>
            <h2 className="mt-4" style={{ fontSize: "clamp(40px, 5vw, 60px)" }}>Precios y plazos</h2>
            <p className="mt-5 text-base lg:text-lg">
              {ins.apertura && `Apertura el ${fechaLarga(ins.apertura.slice(0, 10)).toLowerCase()}. `}
              {ins.cierreTexto
                ? `Cierre: ${ins.cierreTexto}.`
                : ins.cierre
                  ? `Cierre el ${fechaLarga(ins.cierre.slice(0, 10)).toLowerCase()}${ins.limiteDorsales ? ` o al completar los ${ins.limiteDorsales} dorsales` : ""}.`
                  : ""}
            </p>
            <ul className="mt-7 flex flex-col gap-4 list-none p-0 m-0">
              {ins.edadMinima && <Punto texto={`Edad mínima ${ins.edadMinima} años cumplidos el día de la prueba.`} />}
              {evento.camiseta?.hasta && <Punto texto={`Camiseta garantizada para inscritos antes del ${fechaLarga(evento.camiseta.hasta).toLowerCase()}.`} />}
              {ins.nota && <Punto texto={ins.nota} />}
              {ins.cupones && <Punto texto="Si tienes un código de descuento, lo aplicas al inscribirte." />}
            </ul>
          </div>

          <div className="rounded-[20px] p-[22px] lg:p-10" style={{ background: "var(--wp-dark)", color: "#fff" }}>
            <p className="wp-label" style={{ color: "var(--wp-accion)" }}>Cuotas</p>
            <div className="mt-6">
              {ins.tarifas.map((t) => {
                const vigente = precioVigente(t);
                const prueba = evento.pruebas.find((p) => p.id === t.pruebas[0] || p.id === t.id);
                return (
                  <div key={t.id} className="border-b py-4" style={{ borderColor: "var(--wp-border-dark)" }}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="wp-display text-[26px]" style={{ color: prueba?.color ?? "var(--wp-accion)" }}>{t.nombre}</p>
                      <p className="wp-num" style={{ fontSize: "36px", color: "#fff" }}>{formatoPrecio(vigente)}</p>
                    </div>
                    {t.periodos.length > 1 && (
                      <ul className="mt-3 grid grid-cols-1 gap-1 text-sm list-none p-0 m-0 sm:grid-cols-2" style={{ color: "var(--wp-muted-dark)" }}>
                        {t.periodos.map((p, i) => (
                          <li key={i} className="flex justify-between rounded-md px-3 py-1.5" style={p.vigente ? { background: "rgba(255,255,255,0.1)", color: "#fff", fontWeight: 600 } : undefined}>
                            <span>{p.etiqueta ?? [p.desde && fechaCorta(p.desde), p.hasta && fechaCorta(p.hasta)].filter(Boolean).join(" – ")}</span>
                            <span className="tabular-nums">{formatoPrecio(p.precio)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>

            {abierta ? (
              <button type="button" className="wp-btn mt-7 w-full" style={{ fontSize: "24px" }} onClick={() => onInscribirse(ins.tarifas[0]?.pruebas[0] ?? evento.pruebas[0]?.id)}>
                Inscríbete ahora
              </button>
            ) : (
              <p className="mt-7 text-center text-sm" style={{ color: "var(--wp-muted-dark)" }}>
                {evento.estado === "proximamente" ? "Las inscripciones abrirán próximamente." : evento.estado === "agotada" ? "No quedan dorsales." : "Las inscripciones están cerradas."}
              </p>
            )}
            <p className="mt-4 flex items-center justify-center gap-2 text-[13px]" style={{ color: "var(--wp-muted-dark)" }}>
              <Lock size={14} strokeWidth={2} aria-hidden="true" />
              Pago seguro con tarjeta{evento.web?.tpvPropio ? " en el TPV del organizador" : ""} · Confirmación inmediata
            </p>
          </div>
        </div>

        {(ins.incluye?.length || devolucion || equipo?.length) && (
          <div className="mt-4 grid grid-cols-1 gap-4 lg:mt-8 lg:grid-cols-3 lg:gap-8">
            {ins.incluye && ins.incluye.length > 0 && (
              <article id="inscripcion-incluye" className="wp-card p-[22px] lg:p-8">
                <h3 className="text-[24px] lg:text-[28px]">Qué incluye</h3>
                <ul className="mt-6 flex flex-col gap-3 list-none p-0 m-0">
                  {ins.incluye.map((i) => (
                    <li key={i} className="flex items-start gap-2 text-[15px]">
                      <Check size={18} strokeWidth={2} className="mt-0.5 shrink-0" style={{ color: "var(--wp-marca)" }} aria-hidden="true" />
                      <span>{i}</span>
                    </li>
                  ))}
                </ul>
              </article>
            )}
            {devolucion && (
              <article id="inscripcion-devoluciones" className="wp-card p-[22px] lg:p-8">
                <h3 className="text-[24px] lg:text-[28px]">Bajas y devoluciones</h3>
                {devolucionTramos && devolucionTramos.length > 0 && (
                  <ul className="mt-6 flex flex-col gap-2 list-none p-0 m-0">
                    {devolucionTramos.map((d) => (
                      <li key={d.diasAntes} className="flex justify-between rounded-lg px-4 py-3 text-[15px]" style={{ background: "var(--wp-cream)" }}>
                        <span>Hasta {d.diasAntes} días antes</span>
                        <span className="font-semibold" style={{ color: "var(--wp-ink)" }}>{d.porcentaje} % de devolución</span>
                      </li>
                    ))}
                  </ul>
                )}
                {devolucionTexto && (
                  <>
                    {devolucionTexto.texto && <p className="mt-6 text-[15px]">{devolucionTexto.texto}</p>}
                    {devolucionTexto.gastos != null && (
                      <div className="mt-6 rounded-lg p-4" style={{ background: "var(--wp-cream)" }}>
                        <p className="wp-num text-[28px]">−{devolucionTexto.gastos} €</p>
                        <p className="mt-1 text-sm">gastos de gestión por devolución</p>
                      </div>
                    )}
                  </>
                )}
              </article>
            )}
            {equipo && equipo.length > 0 && (
              <article id="inscripcion-equipos" className="wp-card p-[22px] lg:p-8">
                <h3 className="text-[24px] lg:text-[28px]">Equipos</h3>
                <ul className="mt-6 flex flex-col gap-2 list-none p-0 m-0">
                  {equipo.map((e) => (
                    <li key={e.minMiembros} className="flex justify-between rounded-lg px-4 py-3 text-[15px]" style={{ background: "var(--wp-cream)" }}>
                      <span>Desde {e.minMiembros} miembros</span>
                      <span className="font-semibold" style={{ color: "var(--wp-ink)" }}>{e.tipo === "percent" ? `${e.valor} % de descuento` : `−${e.valor} € por persona`}</span>
                    </li>
                  ))}
                </ul>
                <a href={urlCamberas(`/${evento.slug}`)} className="mt-6 inline-block text-[15px] font-semibold" style={{ color: "var(--wp-marca)" }}>
                  Inscribir un equipo en Camberas →
                </a>
              </article>
            )}
          </div>
        )}
      </div>
    </section>
  );

  function Punto({ texto }: { texto: string }) {
    return (
      <li className="flex gap-3 text-[15px] lg:text-base">
        <span aria-hidden="true" className="mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full" style={{ background: "var(--wp-accion)" }}>
          <Check size={14} strokeWidth={2} style={{ color: "var(--wp-accion-texto)" }} />
        </span>
        <span>{texto}</span>
      </li>
    );
  }
}
