import { useEffect } from "react";

/**
 * Baja hasta el ancla de la dirección (#vuelo-3d, #inscripcion…) cuando la
 * página ya tiene contenido. El navegador lo intenta al cargar, pero la web de
 * la carrera pinta después de pedir el evento, y entonces el ancla aún no
 * existe. Reintenta un par de segundos por si la sección tarda en aparecer.
 */
export function useIrAlAncla(listo: boolean) {
  useEffect(() => {
    if (!listo || typeof window === "undefined") return;
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    let intentos = 0;
    const t = setInterval(() => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ block: "start" });
        clearInterval(t);
      } else if (++intentos > 20) {
        clearInterval(t);
      }
    }, 150);
    return () => clearInterval(t);
  }, [listo]);
}
