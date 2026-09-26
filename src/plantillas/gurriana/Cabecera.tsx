import { useEffect, useRef, useState } from "react";
import { ChevronDown, Menu, X } from "lucide-react";
import type { EventoPublico } from "@/eventos/tipos";
import { construirMenu, esExterno, type GrupoMenu } from "@/eventos/menu";
import type { RutasWeb } from "@/eventos/menu";

interface Props {
  evento: EventoPublico;
  rutas: RutasWeb;
  /** true fuera de la portada: cabecera más baja, solo logo + nombre + CTA */
  compacta?: boolean;
  onInscribirse?: () => void;
}

/**
 * Cabecera de la web: logo + nombre, menú con desplegables bajo cada opción
 * (hover, click y teclado; Escape y click fuera cierran) y CTA "Inscríbete"
 * si hay alguna prueba abierta. En móvil, acordeón dentro del menú
 * hamburguesa. Referencia: Navbar.tsx de la web de Gurriana.
 */
export function Cabecera({ evento, rutas, compacta = false, onInscribirse }: Props) {
  const grupos = construirMenu(evento, rutas);
  const abierta = evento.estado === "abierta";
  const [movilAbierto, setMovilAbierto] = useState(false);
  const [grupoMovil, setGrupoMovil] = useState<string | null>(null);
  const [grupoEscritorio, setGrupoEscritorio] = useState<string | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelarCierre = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };
  const abrir = (id: string) => {
    cancelarCierre();
    setGrupoEscritorio(id);
  };
  const cerrarConRetardo = () => {
    cancelarCierre();
    timerRef.current = setTimeout(() => setGrupoEscritorio(null), 120);
  };

  useEffect(() => {
    const clickFuera = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setGrupoEscritorio(null);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setGrupoEscritorio(null);
        setMovilAbierto(false);
      }
    };
    document.addEventListener("mousedown", clickFuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", clickFuera);
      document.removeEventListener("keydown", tecla);
      cancelarCierre();
    };
  }, []);

  const Enlace = ({ href, texto, className, onClick }: { href: string; texto: string; className: string; onClick?: () => void }) => (
    <a href={href} className={className} onClick={onClick} {...(esExterno(href) ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      {texto}
    </a>
  );

  // En la portada abre el formulario; en las páginas interiores (sin
  // onInscribirse) lleva a la inscripción de la portada
  const cta = abierta && (onInscribirse ? (
    <button type="button" onClick={onInscribirse} className="wp-btn text-base" style={{ minHeight: 44 }}>
      Inscríbete
    </button>
  ) : (
    <a href={rutas.ancla("inscripcion")} className="wp-btn text-base no-underline" style={{ minHeight: 44 }}>
      Inscríbete
    </a>
  ));

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b bg-white" style={{ borderColor: "var(--wp-border)" }}>
      <div className="mx-auto flex h-[72px] max-w-[1296px] items-center justify-between px-5 lg:px-[72px]">
        <a href={rutas.a("/") || "/"} className="flex items-center gap-3 no-underline">
          {evento.imagenes?.logo && <img src={evento.imagenes.logo} alt="" className="h-9 w-auto lg:h-11" />}
          <span className="wp-display text-xl sm:text-2xl" style={{ color: "var(--wp-ink)" }}>
            {evento.nombreCorto ?? evento.nombre}
          </span>
        </a>

        {!compacta && (
          <div className="hidden items-center gap-4 lg:flex">
            <nav ref={navRef} className="flex items-center" aria-label="Secciones">
              {grupos.map((g: GrupoMenu, indice) => {
                const activo = grupoEscritorio === g.id;
                const ultimo = indice === grupos.length - 1;
                if (g.items.length === 1) {
                  return (
                    <Enlace key={g.id} href={g.items[0].href} texto={g.texto} className="px-3 text-[15px] font-medium no-underline hover:opacity-80" />
                  );
                }
                return (
                  <div key={g.id} className="relative" onMouseEnter={() => abrir(g.id)} onMouseLeave={cerrarConRetardo}>
                    <button
                      type="button"
                      aria-expanded={activo}
                      aria-controls={`menu-${g.id}`}
                      onClick={() => (activo ? setGrupoEscritorio(null) : abrir(g.id))}
                      onFocus={() => abrir(g.id)}
                      className="flex h-10 items-center gap-1 px-3 text-[15px] font-medium transition-colors"
                      style={{ color: activo ? "var(--wp-marca)" : "var(--wp-body)", background: "none", border: 0, cursor: "pointer" }}
                    >
                      {g.texto}
                      <ChevronDown size={16} strokeWidth={2} aria-hidden="true" className={`shrink-0 transition-transform ${activo ? "rotate-180" : ""}`} />
                    </button>
                    {activo && (
                      <div id={`menu-${g.id}`} className={`absolute top-full z-50 pt-2 ${ultimo ? "right-0" : "left-0"}`}>
                        <ul className="wp-card w-[260px] p-2 list-none m-0">
                          {g.items.map((i) => (
                            <li key={i.href}>
                              <Enlace
                                href={i.href}
                                texto={i.texto}
                                onClick={() => setGrupoEscritorio(null)}
                                className="block rounded-lg px-3 py-2.5 text-[15px] font-medium no-underline hover:bg-[var(--wp-cream)]"
                              />
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
            {cta}
          </div>
        )}
        {compacta && <div className="hidden lg:flex">{cta}</div>}

        <div className="flex items-center gap-2 lg:hidden">
          {cta}
          {!compacta && (
            <button
              type="button"
              aria-label={movilAbierto ? "Cerrar menú" : "Menú"}
              aria-expanded={movilAbierto}
              onClick={() => {
                setMovilAbierto((v) => !v);
                setGrupoMovil(null);
              }}
              className="flex h-11 w-11 items-center justify-center rounded-[10px] border bg-white"
              style={{ borderColor: "var(--wp-border)", color: "var(--wp-ink)" }}
            >
              {movilAbierto ? <X size={22} strokeWidth={2} /> : <Menu size={22} strokeWidth={2} />}
            </button>
          )}
        </div>
      </div>

      {movilAbierto && !compacta && (
        <div className="max-h-[calc(100vh-72px)] overflow-y-auto border-t bg-white lg:hidden" style={{ borderColor: "var(--wp-border)" }}>
          <nav className="mx-auto flex max-w-[1296px] flex-col px-5 py-2" aria-label="Secciones">
            {grupos.map((g) => {
              const expandido = grupoMovil === g.id;
              if (g.items.length === 1) {
                return (
                  <Enlace
                    key={g.id}
                    href={g.items[0].href}
                    texto={g.texto}
                    onClick={() => setMovilAbierto(false)}
                    className="wp-display block border-b py-4 text-xl no-underline last:border-b-0"
                  />
                );
              }
              return (
                <div key={g.id} className="border-b last:border-b-0" style={{ borderColor: "var(--wp-border)" }}>
                  <button
                    type="button"
                    aria-expanded={expandido}
                    onClick={() => setGrupoMovil(expandido ? null : g.id)}
                    className="wp-display flex min-h-[56px] w-full items-center justify-between gap-3 py-4 text-left text-xl"
                    style={{ background: "none", border: 0, cursor: "pointer" }}
                  >
                    {g.texto}
                    <ChevronDown size={20} strokeWidth={2} aria-hidden="true" className={`shrink-0 transition-transform ${expandido ? "rotate-180" : ""}`} style={{ color: "var(--wp-marca)" }} />
                  </button>
                  {expandido && (
                    <ul className="pb-3 list-none m-0 p-0">
                      {g.items.map((i) => (
                        <li key={i.href}>
                          <Enlace href={i.href} texto={i.texto} onClick={() => setMovilAbierto(false)} className="flex min-h-[44px] items-center text-[15px] font-medium no-underline" />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </nav>
        </div>
      )}
    </header>
  );
}
