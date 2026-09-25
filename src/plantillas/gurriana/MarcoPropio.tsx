import { useEffect, useMemo } from "react";
import { useEventoPublico } from "@/eventos/useEventoPublico";
import { plantillaDe } from "@/plantillas/registro";
import { cargarFuentes, resolverTokens, variablesCss } from "@/plantillas/libroDiseno";
import { rutasDeWeb, useTenant } from "@/tenant/TenantContext";
import { Cabecera } from "./Cabecera";
import { Pie } from "./Pie";
import "./estilos.css";

/**
 * Cabecera y pie de la carrera para las páginas de Camberas que se sirven
 * bajo el dominio propio sin ser de la plantilla (clasificaciones en vivo,
 * GPS…). Navbar.tsx y Footer.tsx las devuelven en modo "propia", así esas
 * páginas salen con la marca de la carrera sin tocarlas una a una. Cada
 * una lleva su propio wrapper .wp con las variables del libro de diseño.
 */
function useMarco() {
  const { modo, tenant } = useTenant();
  const { data: evento } = useEventoPublico(tenant?.slug);
  const plantilla = plantillaDe(evento?.web?.plantilla ?? tenant?.plantilla);
  const tokens = useMemo(() => resolverTokens(plantilla.tokensPorDefecto, evento?.marca ?? tenant?.tema), [plantilla, evento?.marca, tenant?.tema]);
  const rutas = useMemo(() => rutasDeWeb(modo, tenant?.slug ?? "", false), [modo, tenant?.slug]);
  useEffect(() => {
    cargarFuentes(tokens);
  }, [tokens]);
  return { evento, tokens, rutas };
}

export function CabeceraPropia() {
  const { evento, tokens, rutas } = useMarco();
  if (!evento) return null;
  return (
    <div className="wp" style={{ ...variablesCss(tokens), background: "transparent" }}>
      <Cabecera evento={evento} rutas={rutas} compacta />
    </div>
  );
}

export function PiePropio() {
  const { evento, tokens, rutas } = useMarco();
  if (!evento) return null;
  return (
    <div className="wp" style={{ ...variablesCss(tokens), background: "transparent" }}>
      <Pie evento={evento} rutas={rutas} />
    </div>
  );
}
