import type { PropsPlantilla } from "@/plantillas/registro";
import PlantillaGurriana from "@/plantillas/gurriana/PlantillaGurriana";
import "./estilos.css";

/**
 * Plantilla «Navidad Monte Tejas»: la estructura de Gurriana (mismas
 * secciones, mismo contenido, mismas reglas) vestida con el cartel del
 * II Trail Navideño Monte Tejas. Su libro de diseño por defecto son los
 * colores del cartel (registro.ts) y sus adornos, la cinta de bastón de
 * caramelo y los abetos al pie de la portada, van en estilos.css.
 */
export default function PlantillaNavidad(props: PropsPlantilla) {
  return <PlantillaGurriana {...props} idPlantilla="navidad-monte-tejas" />;
}
