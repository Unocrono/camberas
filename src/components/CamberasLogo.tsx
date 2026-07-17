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
      <g stroke="#E8892E" strokeWidth="6" fill="none" strokeLinecap="butt">
        <path d="M 67.2 27.9 A 28 28 0 0 0 22.1 47.6" />
        <path d="M 59.8 34.3 A 18.5 18.5 0 0 0 31.6 48.4" />
      </g>
      {/* Mitad inferior — verde */}
      <g stroke="#2E8B4A" strokeWidth="6" fill="none" strokeLinecap="butt">
        <path d="M 22.1 52.4 A 28 28 0 0 0 67.2 72.1" />
        <path d="M 31.6 51.6 A 18.5 18.5 0 0 0 59.8 65.7" />
      </g>
    </svg>
  );
}

export default CamberasLogo;
