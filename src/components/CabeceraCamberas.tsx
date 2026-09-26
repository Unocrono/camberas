/**
 * Cabecera con la imagen de Camberas: la misma que los correos a los
 * corredores (supabase/functions/reenviar-comprobantes, envoltorio): franja
 * arena con el nombre, el lema y la ilustración de las colinas
 * (public/email/cabecera-colinas.png). Para las pantallas que ve gente de
 * fuera del panel —la mesa de recogida, "mi dorsal"— y que así se reconozcan
 * como de Camberas a la primera.
 */

// Paleta Camberas (docs/paleta-camberas.md), la misma que los correos
export const PALETA = {
  verde: "#235940",
  naranja: "#EC7C2B",
  crema: "#FAF6EC",
  arena: "#FCEBD6",
  tinta: "#0E2419",
  colinaOscura: "#1E5B38",
} as const;

interface Props {
  /** Más baja (para pantallas de trabajo donde cada píxel cuenta) */
  compacta?: boolean;
}

export function CabeceraCamberas({ compacta = false }: Props) {
  return (
    <div style={{ background: PALETA.arena }}>
      <div className={`text-center ${compacta ? "pt-3" : "pt-6"}`}>
        <p
          className={`font-bold leading-none ${compacta ? "text-2xl" : "text-3xl"}`}
          style={{ color: PALETA.tinta, letterSpacing: "0.5px" }}
        >
          Camberas
        </p>
        <p className="mt-1.5 text-[13px]" style={{ color: PALETA.colinaOscura }}>
          Carreras de trail y montaña
        </p>
      </div>
      <img
        src="/email/cabecera-colinas.png"
        alt=""
        className={`block w-full object-cover object-bottom ${compacta ? "h-12 sm:h-16" : "h-16 sm:h-24"}`}
      />
    </div>
  );
}
