import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import type { EventoPublico } from "@/eventos/tipos";
import type { RutasWeb } from "@/eventos/menu";
import { SECCIONES_IDS, type LibroDiseno } from "./libroDiseno";

/**
 * Registro de plantillas de la web de la carrera. Una plantilla es la capa de
 * presentación: recibe el evento, los tokens del libro de diseño y las rutas,
 * y avisa cuando el corredor quiere inscribirse (el diálogo de inscripción
 * es común, no de la plantilla).
 *
 * Añadir una plantilla = una carpeta en src/plantillas/<id>/, una entrada
 * aquí y ampliar el CHECK de race_web.plantilla en una migración.
 */
export interface PropsPlantilla {
  evento: EventoPublico;
  tokens: LibroDiseno;
  rutas: RutasWeb;
  modo: "camberas" | "propia";
  /** Abre el diálogo de inscripción de esa prueba (race_distances.id) */
  onInscribirse: (pruebaId: string) => void;
}

export interface Plantilla {
  id: string;
  nombre: string;
  descripcion: string;
  componente: LazyExoticComponent<ComponentType<PropsPlantilla>>;
  tokensPorDefecto: LibroDiseno;
}

export const PLANTILLAS: Record<string, Plantilla> = {
  gurriana: {
    id: "gurriana",
    nombre: "Gurriana",
    descripcion: "Titulares condensados, hero de color o foto, franja de cifras, cinta de meta, secciones en tarjetas. Hecha para trail y populares.",
    componente: lazy(() => import("./gurriana/PlantillaGurriana")),
    tokensPorDefecto: {
      colorMarca: "#3F6A12",
      colorAccion: "#8BC34A",
      colorSecundario: "#1E6FB5",
      fuenteDisplay: "Barlow Condensed",
      fuenteTexto: "Barlow",
      radio: "16",
      hero: "textura",
      cinta: true,
      secciones: SECCIONES_IDS.map((id) => ({ id, activa: true })),
    },
  },
};

export function plantillaDe(id: string | undefined): Plantilla {
  return (id && PLANTILLAS[id]) || PLANTILLAS.gurriana;
}
