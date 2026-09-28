import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

/**
 * La consulta de inscripción vive en la URL (?consulta=1), como ?inscribir=ID:
 * se puede enlazar (widget.js, un WhatsApp del organizador) y sirve igual en
 * la ficha clásica, en la web con plantilla y bajo dominio propio.
 *
 * Abierta con un botón, se apila en el historial: el "atrás" del móvil la
 * cierra en vez de salir de la carrera, y cerrarla con la X vuelve atrás.
 * Llegada por enlace, cerrarla solo quita el parámetro.
 */
export function useConsultaInscripcion() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const abierta = searchParams.get("consulta") === "1";

  const destino = (poner: boolean) => {
    const p = new URLSearchParams(location.search);
    if (poner) {
      // Si quedaba ?inscribir=ID, al recargar se abrirían los dos diálogos
      p.delete("inscribir");
      p.set("consulta", "1");
    } else p.delete("consulta");
    const s = p.toString();
    return { pathname: location.pathname, search: s ? `?${s}` : "", hash: location.hash };
  };

  const abrir = () => {
    if (!abierta) navigate(destino(true), { state: { consultaAbierta: true } });
  };

  const onOpenChange = (abrirla: boolean) => {
    if (abrirla) return abrir();
    if (!abierta) return;
    if ((location.state as { consultaAbierta?: boolean } | null)?.consultaAbierta) navigate(-1);
    else navigate(destino(false), { replace: true });
  };

  return { abierta, abrir, onOpenChange };
}
