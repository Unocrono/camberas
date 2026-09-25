import type { EventoPublico } from "@/eventos/tipos";
import { fechaLarga } from "@/eventos/useEventoPublico";

function TarjetaOscura({ id, titulo, children }: { id: string; titulo: string; children: React.ReactNode }) {
  return (
    <article id={id} className="flex h-full flex-col rounded-[16px] border p-5 lg:p-7" style={{ background: "var(--wp-dark-2)", borderColor: "var(--wp-border-dark)" }}>
      <h3 className="text-[24px] lg:text-[28px]" style={{ color: "#fff" }}>{titulo}</h3>
      <div className="mt-5">{children}</div>
    </article>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-4 py-3" style={{ background: "var(--wp-dark)" }}>
      <p className="text-[15px]" style={{ color: "var(--wp-muted-dark)" }}>{etiqueta}</p>
      <p className="wp-num text-[20px]" style={{ color: "#fff" }}>{valor}</p>
    </div>
  );
}

/**
 * Bloque oscuro del día de carrera: programa (de race_web o generado de las
 * salidas), recogida de dorsales, salida y meta, sanitario. Solo lo que haya.
 */
export function DiaCarrera({ evento }: { evento: EventoPublico }) {
  const programa = evento.programa?.length
    ? evento.programa
    : evento.pruebas.filter((p) => p.salida).map((p) => ({ hora: p.salida, titulo: `Salida ${p.nombre}`, lugar: p.lugarSalida }));
  const conLugar = evento.pruebas.filter((p) => p.lugarSalida || p.lugarMeta);
  const hayAlgo = programa.length > 0 || evento.dorsales || conLugar.length > 0 || evento.sanitario || evento.entregaPremios;
  if (!hayAlgo) return null;

  return (
    <section id="dia" className="px-5 py-12 lg:px-[72px] lg:py-24" style={{ background: "var(--wp-dark)" }}>
      <div className="mx-auto max-w-[1296px]">
        <p className="wp-label" style={{ color: "var(--wp-accion)" }}>El día de la carrera</p>
        <h2 className="mt-4" style={{ fontSize: "clamp(40px, 5vw, 60px)", color: "#fff" }}>{evento.fechaTexto ?? fechaLarga(evento.fecha)}</h2>

        <div className="mt-10 grid grid-cols-1 gap-3 lg:mt-14 lg:grid-cols-2 lg:gap-6">
          {programa.length > 0 && (
            <TarjetaOscura id="programa" titulo="Programa y horarios">
              <div className="flex flex-col gap-3">
                {programa.map((it, i) => (
                  <Fila
                    key={`${it.titulo}-${i}`}
                    etiqueta={[it.fecha && it.fecha !== evento.fecha ? fechaLarga(it.fecha).split(",")[0] : null, it.titulo, it.lugar].filter(Boolean).join(" · ")}
                    valor={it.hora ? `${it.hora}${it.horaFin ? `–${it.horaFin}` : ""}` : ""}
                  />
                ))}
                {evento.entregaPremios && <Fila etiqueta="Entrega de premios" valor={evento.entregaPremios} />}
              </div>
            </TarjetaOscura>
          )}

          {evento.dorsales && (
            <TarjetaOscura id="dorsales" titulo="Recogida de dorsales">
              {evento.dorsales.lugar && <p className="text-[15px]" style={{ color: "var(--wp-muted-dark)" }}>{evento.dorsales.lugar}</p>}
              {evento.dorsales.horarios && (
                <div className="mt-4 flex flex-col gap-3">
                  {evento.dorsales.horarios.map(([dia, horas]) => (
                    <Fila key={dia} etiqueta={dia} valor={horas} />
                  ))}
                </div>
              )}
              {evento.dorsales.nota && <p className="mt-4 text-sm" style={{ color: "var(--wp-muted-dark)" }}>{evento.dorsales.nota}</p>}
            </TarjetaOscura>
          )}

          {conLugar.length > 0 && (
            <TarjetaOscura id="salida-meta" titulo="Salida y meta">
              <div className="flex flex-col gap-3">
                {conLugar.map((p) => (
                  <div key={p.id} className="rounded-lg px-4 py-3" style={{ background: "var(--wp-dark)" }}>
                    <p className="wp-display text-[20px]" style={{ color: p.color ?? "var(--wp-accion)" }}>{p.nombre}</p>
                    <p className="mt-1 text-[15px]" style={{ color: "var(--wp-muted-dark)" }}>
                      {p.lugarSalida && `Salida: ${p.lugarSalida}`}
                      {p.lugarSalida && p.lugarMeta && " · "}
                      {p.lugarMeta && `Meta: ${p.lugarMeta}`}
                      {p.salida && ` · ${p.salida} h`}
                    </p>
                  </div>
                ))}
              </div>
            </TarjetaOscura>
          )}

          {evento.sanitario && (
            <TarjetaOscura id="sanitario" titulo="Servicio sanitario">
              {evento.sanitario.medios && (
                <div className="grid grid-cols-2 gap-3">
                  {evento.sanitario.medios.map(([cifra, etiqueta]) => (
                    <div key={etiqueta} className="rounded-lg p-4" style={{ background: "var(--wp-dark)" }}>
                      <p className="wp-num text-[28px]" style={{ color: "#fff" }}>{cifra}</p>
                      <p className="mt-1 text-sm" style={{ color: "var(--wp-muted-dark)" }}>{etiqueta}</p>
                    </div>
                  ))}
                </div>
              )}
              {evento.sanitario.nota && <p className="mt-4 text-sm" style={{ color: "var(--wp-muted-dark)" }}>{evento.sanitario.nota}</p>}
            </TarjetaOscura>
          )}
        </div>
      </div>
    </section>
  );
}

/** Premios, servicios y camiseta: tarjetas claras, solo lo que exista */
export function PremiosServiciosCamiseta({ evento }: { evento: EventoPublico }) {
  const { premios, servicios, camiseta } = evento;
  if (!premios?.length && !servicios?.length && !camiseta) return null;
  return (
    <section id="servicios" className="px-5 py-12 lg:px-[72px] lg:py-24">
      <div className="mx-auto max-w-[1296px] grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-8">
        {premios && premios.length > 0 && (
          <article id="premios" className="wp-card p-[22px] lg:p-8">
            <p className="wp-label">Premios</p>
            <ul className="mt-5 flex flex-col gap-3 list-none p-0 m-0">
              {premios.map((p, i) => (
                <li key={i} className="rounded-lg px-4 py-3" style={{ background: "var(--wp-cream)" }}>
                  <p className="wp-display text-[20px]">{p.premio}</p>
                  <p className="mt-1 text-sm">{[p.categoria, p.texto].filter(Boolean).join(" · ")}</p>
                </li>
              ))}
            </ul>
          </article>
        )}
        {servicios && servicios.length > 0 && (
          <article className="wp-card p-[22px] lg:p-8">
            <p className="wp-label">Servicios al corredor</p>
            <ul className="mt-5 flex flex-col gap-3 list-none p-0 m-0">
              {servicios.map((s) => (
                <li key={s.nombre} className="text-[15px]">
                  <span className="font-semibold" style={{ color: "var(--wp-ink)" }}>{s.nombre}</span>
                  {s.texto && <span> — {s.texto}</span>}
                </li>
              ))}
            </ul>
          </article>
        )}
        {camiseta && (
          <article id="camiseta" className="wp-card p-[22px] lg:p-8">
            <p className="wp-label">Camiseta</p>
            {camiseta.imagen && <img src={camiseta.imagen} alt="Camiseta oficial" className="mt-4 w-full rounded-lg object-cover" />}
            <p className="mt-4 text-[15px]">
              {camiseta.texto ?? (camiseta.incluida ? "Camiseta técnica incluida en la inscripción." : camiseta.precio != null ? `Camiseta técnica opcional: ${camiseta.precio} €.` : "")}
            </p>
            {camiseta.limite && <p className="mt-2 text-sm font-semibold" style={{ color: "var(--wp-ink)" }}>Para los primeros {camiseta.limite} inscritos.</p>}
            {camiseta.tallas && <p className="mt-2 text-sm">Tallas: {camiseta.tallas.join(", ")}</p>}
          </article>
        )}
      </div>
    </section>
  );
}
