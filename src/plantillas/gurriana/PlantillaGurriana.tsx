import { useEffect, useState, type ReactNode } from "react";
import type { PropsPlantilla } from "@/plantillas/registro";
import { cargarFuentes, variablesCss, type SeccionId } from "@/plantillas/libroDiseno";
import { Cabecera } from "./Cabecera";
import { Hero, Cifras } from "./Hero";
import { Recorridos } from "./Recorridos";
import { Inscripcion } from "./Inscripcion";
import { Reglamento } from "./Reglamento";
import { DiaCarrera, PremiosServiciosCamiseta } from "./DiaCarrera";
import { InfoPractica, Medioambiente, Beneficiario, Patrocinadores } from "./InfoPractica";
import { Pie } from "./Pie";
import { ElegirRecorrido } from "./ElegirRecorrido";
import "./estilos.css";

/**
 * Plantilla "Gurriana": la web de la carrera hecha con el libro de diseño de
 * Gurriana Trail (titulares condensados, hero de color/foto/textura, franja
 * de cifras, cinta de meta, secciones en tarjetas). Pinta las secciones que
 * el libro de diseño tiene activas, en su orden, y cada una solo si el
 * evento trae datos para ella. Nunca inventa contenido.
 */
export default function PlantillaGurriana({ evento, tokens, rutas, modo, onInscribirse }: PropsPlantilla) {
  useEffect(() => {
    cargarFuentes(tokens);
  }, [tokens]);

  // Botones generales de inscripción: con un solo recorrido abierto, directo a
  // su formulario; con varios, se pregunta cuál (antes iban siempre al primero)
  const abiertas = evento.pruebas.filter((p) => p.estado === "abierta");
  const [eligiendo, setEligiendo] = useState(false);
  const inscribirse = () => {
    if (abiertas.length > 1) setEligiendo(true);
    else if (abiertas[0] ?? evento.pruebas[0]) onInscribirse((abiertas[0] ?? evento.pruebas[0]).id);
  };

  const secciones: Record<SeccionId, () => ReactNode> = {
    hero: () => <Hero evento={evento} tokens={tokens} onInscribirse={inscribirse} hrefRecorridos={rutas.ancla("recorridos")} />,
    cifras: () => <Cifras evento={evento} />,
    cinta: () => (tokens.cinta ? <div className="wp-cinta" aria-hidden="true" /> : null),
    beneficiario: () => <Beneficiario evento={evento} />,
    recorridos: () => <Recorridos evento={evento} rutas={rutas} onInscribirse={onInscribirse} />,
    // Su botón «Inscríbete ahora» es general: pregunta el recorrido si hay varios
    inscripcion: () => <Inscripcion evento={evento} onInscribirse={() => inscribirse()} />,
    reglamento: () => <Reglamento evento={evento} rutas={rutas} />,
    dia: () => <DiaCarrera evento={evento} />,
    premios: () => null, // premios, servicios y camiseta van juntos en "servicios"
    servicios: () => <PremiosServiciosCamiseta evento={evento} />,
    camiseta: () => null,
    info: () => <InfoPractica evento={evento} />,
    medioambiente: () => <Medioambiente evento={evento} />,
    patrocinadores: () => <Patrocinadores evento={evento} />,
  };

  return (
    <div className="wp min-h-screen" style={variablesCss(tokens)} data-plantilla="gurriana" data-modo={modo}>
      <Cabecera evento={evento} rutas={rutas} onInscribirse={inscribirse} />
      <main>
        {tokens.secciones.filter((s) => s.activa).map((s) => (
          <div key={s.id}>{secciones[s.id]?.()}</div>
        ))}
      </main>
      <Pie evento={evento} rutas={rutas} />
      {eligiendo && (
        <ElegirRecorrido
          evento={evento}
          onCerrar={() => setEligiendo(false)}
          onElegir={(id) => {
            setEligiendo(false);
            onInscribirse(id);
          }}
        />
      )}
    </div>
  );
}
