import { Check } from "lucide-react";
import type { EventoPublico } from "@/eventos/tipos";
import type { RutasWeb } from "@/eventos/menu";

interface Props {
  evento: EventoPublico;
  rutas: RutasWeb;
}

function Tarjeta({ id, titulo, children }: { id: string; titulo: string; children: React.ReactNode }) {
  return (
    <article id={id} className="wp-card p-[22px] lg:p-8" style={{ background: "var(--wp-cream)" }}>
      <h3 className="text-[24px] lg:text-[28px]">{titulo}</h3>
      {children}
    </article>
  );
}

function Lista({ items }: { items: string[] }) {
  return (
    <ul className="mt-6 flex flex-col gap-3 list-none p-0 m-0">
      {items.map((m) => (
        <li key={m} className="flex items-start gap-2 text-[15px]">
          <Check size={18} strokeWidth={2} className="mt-0.5 shrink-0" style={{ color: "var(--wp-marca)" }} aria-hidden="true" />
          <span>{m}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Reglamento en tarjetas: solo las claves que existan. El reglamento
 * completo (secciones de Camberas o PDF) tiene su propia página.
 */
export function Reglamento({ evento, rutas }: Props) {
  const reg = evento.reglamento;
  const categorias = evento.categorias?.length ? evento.categorias : null;
  const pruebasConCategorias = evento.pruebas.filter((p) => p.categorias?.length);
  const pruebasConCortes = evento.pruebas.filter((p) => p.avituallamientos?.some((a) => a.corte));
  const hayAlgo = reg?.materialObligatorio?.length || categorias || pruebasConCategorias.length || pruebasConCortes.length || reg?.marcaje?.length || reg?.normas?.length || reg?.reclamaciones || reg?.secciones?.length || reg?.url;
  if (!hayAlgo) return null;

  return (
    <section id="reglamento-resumen" className="border-y bg-white px-5 py-12 lg:px-[72px] lg:py-24" style={{ borderColor: "var(--wp-border)" }}>
      <div className="mx-auto max-w-[1296px]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="wp-label">Reglamento</p>
            <h2 className="mt-4" style={{ fontSize: "clamp(40px, 5vw, 60px)" }}>Las normas, en claro</h2>
          </div>
          {(reg?.secciones?.length || reg?.url) && (
            <a href={reg.secciones?.length ? rutas.a("/reglamento") : reg.url} className="wp-btn-outline" style={{ color: "var(--wp-ink)" }} {...(!reg.secciones?.length ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
              Reglamento completo
            </a>
          )}
        </div>

        <div className="mt-10 grid grid-cols-1 gap-4 lg:mt-14 lg:grid-cols-2 lg:gap-8">
          {reg?.materialObligatorio && reg.materialObligatorio.length > 0 && (
            <Tarjeta id="material" titulo="Material obligatorio">
              <Lista items={reg.materialObligatorio} />
              {reg.normasMaterial && <div className="mt-6 rounded-lg bg-white p-4 text-sm">{reg.normasMaterial}</div>}
            </Tarjeta>
          )}

          {(categorias || pruebasConCategorias.length > 0) && (
            <Tarjeta id="categorias" titulo="Categorías">
              {categorias && (
                <ul className="mt-6 flex flex-wrap gap-2 list-none p-0 m-0">
                  {categorias.map((c) => (
                    <li key={c.id} className="rounded-md border bg-white px-3 py-2 text-sm font-semibold" style={{ borderColor: "var(--wp-border)" }}>
                      {c.nombre}
                      {c.edadMin != null || c.edadMax != null ? ` (${c.edadMin ?? ""}${c.edadMin != null && c.edadMax != null ? "–" : c.edadMin != null ? "+" : "hasta "}${c.edadMax ?? ""})` : ""}
                    </li>
                  ))}
                </ul>
              )}
              {pruebasConCategorias.map((p) => (
                <div key={p.id} className="mt-6">
                  <p className="wp-display text-[22px]" style={{ color: p.color ?? "var(--wp-marca)" }}>{p.nombre}</p>
                  <ul className="mt-3 flex flex-wrap gap-2 list-none p-0 m-0">
                    {p.categorias!.map((c) => (
                      <li key={c.id} className="rounded-md border bg-white px-3 py-2 text-sm font-semibold" style={{ borderColor: "var(--wp-border)" }}>
                        {c.nombre}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </Tarjeta>
          )}

          {pruebasConCortes.length > 0 && (
            <Tarjeta id="cortes" titulo="Cortes y tiempos límite">
              <div className="mt-6 flex flex-col gap-6">
                {pruebasConCortes.map((p) => (
                  <div key={p.id}>
                    <div className="flex flex-wrap items-baseline gap-x-3">
                      <p className="wp-display text-[26px]" style={{ color: p.color ?? "var(--wp-marca)" }}>{p.nombre}</p>
                      <p className="text-sm">{[p.distanciaTexto, p.limite && `límite ${p.limite}`].filter(Boolean).join(" · ")}</p>
                    </div>
                    <ul className="mt-3 flex flex-col gap-2 list-none p-0 m-0">
                      {p.avituallamientos!.filter((a) => a.corte).map((a) => (
                        <li key={`${a.nombre}-${a.km}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-4 py-3 text-[15px]">
                          <span>km {String(a.km).replace(".", ",")} · {a.nombre}</span>
                          <span className="wp-num text-[20px]" style={{ color: "var(--wp-red)" }}>{a.corte}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Tarjeta>
          )}

          {reg?.marcaje && reg.marcaje.length > 0 && (
            <Tarjeta id="marcaje" titulo="Marcaje y seguridad en ruta">
              <Lista items={reg.marcaje} />
            </Tarjeta>
          )}

          {reg?.normas && reg.normas.length > 0 && (
            <Tarjeta id="normas" titulo="Normas">
              <Lista items={reg.normas} />
            </Tarjeta>
          )}

          {reg?.reclamaciones && (
            <Tarjeta id="reclamaciones" titulo="Reclamaciones">
              <p className="mt-6 text-[15px]">{reg.reclamaciones}</p>
            </Tarjeta>
          )}
        </div>
      </div>
    </section>
  );
}
