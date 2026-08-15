/**
 * Cartel de ruta para redes sociales — dos piezas en 4:5 (1080×1350):
 * PERFIL con los puertos marcados y MAPA del recorrido.
 *
 * Referencia estética: los carteles de La Flamme Rouge que publican las
 * tiendas (perfil relleno + banderines con nombre, altura y categoría),
 * pero con la paleta Camberas y la imagen del evento de fondo.
 *
 * Se dibuja a tamaño real en un contenedor oculto y se exporta con
 * html2canvas: lo que se ve en pantalla es una miniatura escalada.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { parseGpxFile, getAllTrackPoints } from '@/lib/gpxParser';
import { construirPerfil, type PerfilRuta } from '@/lib/perfilRuta';
import { Button } from '@/components/ui/button';
import { Loader2, Download, Image as ImageIcon } from 'lucide-react';

// ── Paleta Camberas (docs/paleta-camberas.md) ──────────────────────
const TINTA = '#0E2419';
const VERDE = '#235940';
const NARANJA = '#EC7C2B';
const CREMA = '#FAF6EC';
const LIMA = '#C8E85C';

const W = 1080;
const H = 1350;

interface CartelRutaProps {
  nombre: string;
  fecha: string;          // ISO (YYYY-MM-DD)
  hora?: string | null;
  lugar?: string | null;
  gpxUrl: string;
  imagenUrl?: string | null;
}

const formatoFecha = (iso: string): string => {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
};

/** Ruta SVG del perfil (área rellena) */
const pathPerfil = (perfil: PerfilRuta, ancho: number, alto: number): string => {
  const { puntos, km, altMin, altMax } = perfil;
  const rango = Math.max(1, altMax - altMin);
  const x = (v: number) => (v / Math.max(km, 0.1)) * ancho;
  const y = (v: number) => alto - ((v - altMin) / rango) * alto * 0.86 - alto * 0.07;
  let d = `M 0 ${alto} L ${x(puntos[0].km)} ${y(puntos[0].ele)}`;
  for (const p of puntos) d += ` L ${x(p.km)} ${y(p.ele)}`;
  d += ` L ${ancho} ${alto} Z`;
  return d;
};

/** Traza del recorrido normalizada a una caja (mapa sin fondo, estilo cartel) */
const pathMapa = (
  pts: { lat: number; lon: number }[],
  ancho: number,
  alto: number,
  margen = 60,
): string => {
  if (pts.length === 0) return '';
  const lats = pts.map((p) => p.lat);
  const lons = pts.map((p) => p.lon);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);
  // Mercator simple: a esta escala la distorsión es despreciable, pero sin
  // corregir por latitud el recorrido sale achatado en el norte
  const kx = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
  const anchoGeo = (maxLon - minLon) * kx || 1e-6;
  const altoGeo = (maxLat - minLat) || 1e-6;
  const escala = Math.min((ancho - margen * 2) / anchoGeo, (alto - margen * 2) / altoGeo);
  const offX = (ancho - anchoGeo * escala) / 2;
  const offY = (alto - altoGeo * escala) / 2;
  return pts
    .map((p, i) => {
      const px = offX + (p.lon - minLon) * kx * escala;
      const py = alto - offY - (p.lat - minLat) * escala;
      return `${i === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`;
    })
    .join(' ');
};

export function CartelRuta({ nombre, fecha, hora, lugar, gpxUrl, imagenUrl }: CartelRutaProps) {
  const [perfil, setPerfil] = useState<PerfilRuta | null>(null);
  const [traza, setTraza] = useState<{ lat: number; lon: number }[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportando, setExportando] = useState<string | null>(null);

  const refPerfil = useRef<HTMLDivElement>(null);
  const refMapa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch(gpxUrl);
        const texto = await res.text();
        const gpx = parseGpxFile(texto);
        const pts = getAllTrackPoints(gpx);
        if (cancelado) return;
        if (pts.length < 2) throw new Error('El GPX no tiene recorrido');
        setPerfil(construirPerfil(pts, gpx.waypoints));
        setTraza(pts.map((p) => ({ lat: p.lat, lon: p.lon })));
      } catch (e: any) {
        if (!cancelado) setError(e.message ?? 'No se pudo leer el GPX');
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => { cancelado = true; };
  }, [gpxUrl]);

  const descargar = async (ref: React.RefObject<HTMLDivElement>, sufijo: string) => {
    if (!ref.current) return;
    setExportando(sufijo);
    try {
      const lienzo = await html2canvas(ref.current, {
        width: W, height: H, scale: 1, backgroundColor: TINTA, useCORS: true, logging: false,
      });
      const enlace = document.createElement('a');
      enlace.download = `${nombre.toLowerCase().replace(/[^a-z0-9]+/gi, '-')}-${sufijo}.png`;
      enlace.href = lienzo.toDataURL('image/png');
      enlace.click();
    } finally {
      setExportando(null);
    }
  };

  const fechaTexto = useMemo(() => formatoFecha(fecha), [fecha]);

  if (cargando) {
    return <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (error || !perfil) {
    return <p className="text-sm text-destructive py-4">{error ?? 'Sin recorrido'}</p>;
  }

  const anchoPerfil = W - 120;
  const altoPerfil = 420;

  // ── Cabecera común de las dos piezas ─────────────────────────────
  const Cabecera = () => (
    <div style={{ padding: '64px 60px 0' }}>
      <div style={{ color: NARANJA, fontSize: 26, letterSpacing: 6, fontWeight: 800 }}>
        CAMBERAS · GRUPETTA
      </div>
      <div style={{
        color: CREMA, fontSize: 76, lineHeight: 1.02, fontWeight: 900,
        textTransform: 'uppercase', marginTop: 14,
      }}>
        {nombre}
      </div>
      <div style={{ color: LIMA, fontSize: 32, marginTop: 16, textTransform: 'capitalize' }}>
        {fechaTexto}{hora ? ` · ${hora.slice(0, 5)} h` : ''}{lugar ? ` · ${lugar}` : ''}
      </div>
    </div>
  );

  // ── Cifras de pie ────────────────────────────────────────────────
  const Cifras = () => (
    <div style={{ display: 'flex', gap: 48, padding: '0 60px 56px' }}>
      {[
        { v: `${perfil.km.toFixed(1)}`, u: 'KM' },
        { v: `+${perfil.desnivel}`, u: 'M DESNIVEL' },
        { v: `${perfil.altMax}`, u: 'M ALTURA MÁX.' },
      ].map((c) => (
        <div key={c.u}>
          <div style={{ color: NARANJA, fontSize: 64, fontWeight: 900, lineHeight: 1 }}>{c.v}</div>
          <div style={{ color: CREMA, opacity: 0.7, fontSize: 20, letterSpacing: 2, marginTop: 6 }}>{c.u}</div>
        </div>
      ))}
    </div>
  );

  const fondo: React.CSSProperties = imagenUrl
    ? {
        backgroundImage: `linear-gradient(180deg, rgba(14,36,25,0.92) 0%, rgba(14,36,25,0.97) 60%, ${TINTA} 100%), url(${imagenUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : { background: `linear-gradient(180deg, ${VERDE} 0%, ${TINTA} 70%)` };

  // El marco recorta y encoge; dentro, la pieza va a 1080×1350 reales
  const ESCALA = 0.235;
  const marco: React.CSSProperties = {
    width: W * ESCALA, height: H * ESCALA, maxWidth: '100%',
  };
  const escalador: React.CSSProperties = {
    transform: `scale(${ESCALA})`, transformOrigin: 'top left',
    width: W, height: H,
  };
  const lienzoBase: React.CSSProperties = {
    width: W, height: H, ...fondo,
    display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    fontFamily: 'Archivo, Inter, system-ui, sans-serif',
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => descargar(refPerfil, 'perfil')} disabled={!!exportando}>
          {exportando === 'perfil'
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <><Download className="h-4 w-4 mr-1" /> Perfil</>}
        </Button>
        <Button className="flex-1" variant="secondary" onClick={() => descargar(refMapa, 'mapa')} disabled={!!exportando}>
          {exportando === 'mapa'
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <><ImageIcon className="h-4 w-4 mr-1" /> Mapa</>}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        1080×1350 (4:5), el formato que más ocupa en Instagram.
        {perfil.puertos.length > 0 && ` ${perfil.puertos.length} puerto(s) detectado(s) en el recorrido.`}
      </p>

      {/* ── Las piezas, a tamaño real dentro de un marco escalado ─ */}
      <div className="grid grid-cols-2 gap-3">
        {/* PERFIL */}
        <div className="rounded-lg overflow-hidden border" style={marco}>
        <div style={escalador}>
        <div ref={refPerfil} style={lienzoBase}>
          <Cabecera />

          <div style={{ padding: '0 60px' }}>
            <svg width={anchoPerfil} height={altoPerfil + 150} style={{ overflow: 'visible' }}>
              {/* Banderines de los puertos */}
              {perfil.puertos.map((p, i) => {
                const x = (p.km / Math.max(perfil.km, 0.1)) * anchoPerfil;
                const rango = Math.max(1, perfil.altMax - perfil.altMin);
                const y = altoPerfil - ((p.cima - perfil.altMin) / rango) * altoPerfil * 0.86 - altoPerfil * 0.07;
                const alto = i % 2 === 0 ? 118 : 74;   // alternar para que no se pisen
                return (
                  <g key={i} transform={`translate(${x + 60}, 0)`}>
                    <line x1={0} y1={y} x2={0} y2={y - alto} stroke={CREMA} strokeWidth={2} opacity={0.85} />
                    <rect x={-4} y={y - alto - 34} width={34} height={30} fill={NARANJA} rx={3} />
                    <text x={13} y={y - alto - 13} fill={TINTA} fontSize={20} fontWeight={900} textAnchor="middle">
                      {p.categoria}
                    </text>
                    <text x={-4} y={y - alto - 44} fill={CREMA} fontSize={19} fontWeight={700}>
                      {p.cima} m
                    </text>
                    {p.nombre && (
                      <text x={-4} y={y - alto - 68} fill={LIMA} fontSize={21} fontWeight={800}>
                        {p.nombre.slice(0, 22)}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Hitos del capo: avituallamientos y puntos de interés */}
              {perfil.hitos.map((h, i) => {
                const x = (h.km / Math.max(perfil.km, 0.1)) * anchoPerfil + 60;
                const esAvit = h.tipo === 'avituallamiento';
                const color = esAvit ? LIMA : CREMA;
                return (
                  <g key={`h${i}`} transform={`translate(${x}, ${150 + altoPerfil})`}>
                    <line x1={0} y1={0} x2={0} y2={26} stroke={color} strokeWidth={2} opacity={0.9} />
                    <circle cx={0} cy={38} r={13} fill={color} />
                    <text x={0} y={45} fontSize={17} fontWeight={900} fill={TINTA} textAnchor="middle">
                      {esAvit ? 'A' : '•'}
                    </text>
                    <text
                      x={0} y={78} fontSize={19} fontWeight={700} fill={color}
                      textAnchor={i === 0 ? 'start' : i === perfil.hitos.length - 1 ? 'end' : 'middle'}
                    >
                      {h.nombre.slice(0, 18)}
                    </text>
                    <text
                      x={0} y={100} fontSize={17} fill={CREMA} opacity={0.65}
                      textAnchor={i === 0 ? 'start' : i === perfil.hitos.length - 1 ? 'end' : 'middle'}
                    >
                      km {h.km}
                    </text>
                  </g>
                );
              })}

              {/* El perfil */}
              <g transform="translate(60, 150)">
                <path d={pathPerfil(perfil, anchoPerfil, altoPerfil)} fill={NARANJA} opacity={0.92} />
                <path
                  d={pathPerfil(perfil, anchoPerfil, altoPerfil)}
                  fill="none" stroke={CREMA} strokeWidth={3} strokeLinejoin="round"
                />
                <line x1={0} y1={altoPerfil} x2={anchoPerfil} y2={altoPerfil} stroke={CREMA} strokeWidth={4} />
                <text x={0} y={altoPerfil + 38} fill={CREMA} fontSize={22} opacity={0.8}>0</text>
                <text x={anchoPerfil} y={altoPerfil + 38} fill={CREMA} fontSize={22} opacity={0.8} textAnchor="end">
                  {perfil.km.toFixed(1)} km
                </text>
              </g>
            </svg>
          </div>

          <Cifras />
        </div>
        </div>
        </div>

        {/* MAPA */}
        <div className="rounded-lg overflow-hidden border" style={marco}>
        <div style={escalador}>
        <div ref={refMapa} style={lienzoBase}>
          <Cabecera />

          <div style={{ padding: '0 60px', display: 'flex', justifyContent: 'center' }}>
            <svg width={W - 120} height={640}>
              <path
                d={pathMapa(traza, W - 120, 640)}
                fill="none" stroke={TINTA} strokeWidth={16}
                strokeLinejoin="round" strokeLinecap="round" opacity={0.45}
              />
              <path
                d={pathMapa(traza, W - 120, 640)}
                fill="none" stroke={NARANJA} strokeWidth={9}
                strokeLinejoin="round" strokeLinecap="round"
              />
              {(() => {
                const d = pathMapa(traza, W - 120, 640);
                const primero = d.match(/M ([\d.]+) ([\d.]+)/);
                const trozos = d.trim().split('L');
                const ultimo = trozos[trozos.length - 1]?.trim().split(' ');
                return (
                  <>
                    {primero && (
                      <circle cx={+primero[1]} cy={+primero[2]} r={16} fill={LIMA} stroke={TINTA} strokeWidth={5} />
                    )}
                    {ultimo?.length === 2 && (
                      <circle cx={+ultimo[0]} cy={+ultimo[1]} r={16} fill={CREMA} stroke={TINTA} strokeWidth={5} />
                    )}
                  </>
                );
              })()}
            </svg>
          </div>

          <Cifras />
        </div>
        </div>
        </div>
      </div>
    </div>
  );
}
