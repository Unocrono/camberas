import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { EventoPublico } from "@/eventos/tipos";
import { formatoPrecio } from "@/eventos/useEventoPublico";

/**
 * «¿En qué recorrido te inscribes?»: lo abren los botones generales de
 * inscripción (cabecera, portada, sección de inscripción) cuando hay más de
 * un recorrido abierto. Con uno solo, esos botones van directos a su
 * formulario y esto no aparece. Escape o clic fuera cierran.
 */
export function ElegirRecorrido({ evento, onElegir, onCerrar }: { evento: EventoPublico; onElegir: (pruebaId: string) => void; onCerrar: () => void }) {
  const abiertas = evento.pruebas.filter((p) => p.estado === "abierta");
  const primero = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    document.addEventListener("keydown", tecla);
    primero.current?.focus();
    const scroll = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", tecla);
      document.body.style.overflow = scroll;
    };
  }, [onCerrar]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="elegir-recorrido-titulo" className="wp-card max-h-[90vh] w-full max-w-[560px] overflow-y-auto p-6 sm:p-8" style={{ color: "var(--wp-body)" }}>
        <div className="flex items-start justify-between gap-4">
          <h2 id="elegir-recorrido-titulo" className="text-[28px] leading-tight" style={{ color: "var(--wp-ink)" }}>
            ¿En qué recorrido te inscribes?
          </h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--wp-cream)", color: "var(--wp-ink)" }}>
            <X size={20} strokeWidth={2} />
          </button>
        </div>
        <ul className="mt-6 flex flex-col gap-3 list-none p-0 m-0">
          {abiertas.map((p, i) => (
            <li key={p.id} className="rounded-[var(--wp-radio)] border p-4" style={{ borderColor: "var(--wp-border)", borderLeft: `6px solid ${p.color ?? "var(--wp-marca)"}` }}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="wp-display text-[26px] leading-none" style={{ color: p.color ?? "var(--wp-marca)" }}>{p.nombre}</p>
                  <p className="mt-2 text-sm">
                    {[
                      p.distanciaTexto,
                      p.desnivelPos != null ? `+${p.desnivelPos} m` : null,
                      p.salida ? `salida prevista ${p.salida}` : null,
                      p.plazasLibres != null ? `${p.plazasLibres} plazas libres` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {p.precio != null && <span className="wp-num text-[26px]" style={{ color: "var(--wp-ink)" }}>{formatoPrecio(p.precio)}</span>}
                  <button type="button" ref={i === 0 ? primero : undefined} className="wp-btn" onClick={() => onElegir(p.id)}>
                    Inscribirme
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
