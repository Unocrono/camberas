import type { EventoPublico, Patrocinador } from "@/eventos/tipos";

/** Info práctica: cómo llegar, alojamiento, espectadores, FAQ. Solo lo que haya. */
export function InfoPractica({ evento }: { evento: EventoPublico }) {
  const ip = evento.infoPractica;
  if (!ip || (!ip.comoLlegar && !ip.parking && !ip.alojamiento && !ip.espectadores && !ip.transporte && !ip.faq?.length)) return null;
  const bloques: { id: string; titulo: string; texto?: string }[] = [
    { id: "como-llegar", titulo: "Cómo llegar", texto: ip.comoLlegar },
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
            <ul className="mt-6 flex flex-wrap items-center justify-center gap-3 list-none p-0 m-0">
              {g.items.map((p: Patrocinador) => (
                <li key={p.nombre}>
                  {p.logo ? (
                    <a href={p.web} target="_blank" rel="noopener noreferrer" className="block rounded-lg border bg-white p-3" style={{ borderColor: "var(--wp-border)" }} title={p.nombre}>
                      <img src={p.logo} alt={p.nombre} className={`${g.nivel === "organiza" || g.nivel === "principal" ? "h-20" : "h-12"} w-auto object-contain`} loading="lazy" />
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
