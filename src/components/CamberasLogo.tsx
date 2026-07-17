/**
 * Logo de Camberas — "C" de doble arco (naranja arriba, verde abajo)
 * sobre círculo azul noche. Recreado como SVG vectorial: nítido a
 * cualquier tamaño y sin peticiones de imagen.
 */

interface CamberasLogoProps {
  /** Tamaño en píxeles (ancho = alto) */
  size?: number;
  className?: string;
}

export function CamberasLogo({ size = 36, className }: CamberasLogoProps) {
  // Arcos de la C: abiertos por la derecha (~55°) y con un corte
  // horizontal a la izquierda que separa la mitad naranja de la verde
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="Camberas"
    >
      <circle cx="50" cy="50" r="50" fill="#1E2A3A" />
      {/* Mitad superior — naranja */}
      <g stroke="#E8892E" strokeWidth="7" fill="none" strokeLinecap="butt">
        <path d="M 71.6 25.2 A 33 33 0 0 0 17 47" />
        <path d="M 64.7 34.6 A 21.5 21.5 0 0 0 28.6 47" />
      </g>
      {/* Mitad inferior — verde */}
      <g stroke="#2E8B4A" strokeWidth="7" fill="none" strokeLinecap="butt">
        <path d="M 17 53 A 33 33 0 0 0 71.6 74.8" />
        <path d="M 28.6 53 A 21.5 21.5 0 0 0 64.7 65.4" />
      </g>
    </svg>
  );
}

export default CamberasLogo;
