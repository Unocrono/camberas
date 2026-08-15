/**
 * Cartel de ruta para redes sociales — dos piezas en 4:5 (1080×1350):
 * PERFIL con los puertos marcados y MAPA del recorrido.
 *
 * Se dibuja DIRECTAMENTE sobre canvas, no con html2canvas: la primera
 * versión (15-ago) pasaba de HTML a imagen y salía destrozada — todos los
 * textos amontonados en una esquina y los SVG sin pintar. Dibujando a
 * mano hay más código, pero lo que se ve es exactamente lo que sale.
 */

import { useEffect, useRef, useState } from 'react';
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
const M = 70;               // margen lateral
const FUENTE = 'Archivo, Inter, system-ui, sans-serif';

interface CartelRutaProps {
  nombre: string;
  fecha: string;
  hora?: string | null;
  lugar?: string | null;
  gpxUrl: string;
  imagenUrl?: string | null;
}

const formatoFecha = (iso: string): string => {
  const d = new Date(iso + 'T00:00:00');
  const t = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** Texto que se corta con puntos suspensivos si no cabe */
const ajustar = (ctx: CanvasRenderingContext2D, texto: string, max: number): string => {
  if (ctx.measureText(texto).width <= max) return texto;
  let t = texto;
  while (t.length > 3 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t + '…';
};

const cargarImagen = (url: string): Promise<HTMLImageElement | null> =>
  new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });

export function CartelRuta({ nombre, fecha, hora, lugar, gpxUrl, imagenUrl }: CartelRutaProps) {
  const [perfil, setPerfil] = useState<PerfilRuta | null>(null);
  const [traza, setTraza] = useState<{ lat: number; lon: number }[]>([]);
  const [imagen, setImagen] = useState<HTMLImageElement | null>(null);
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canvasPerfil = useRef<HTMLCanvasElement>(null);
  const canvasMapa = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const [res, img, marca] = await Promise.all([
          fetch(gpxUrl),
          imagenUrl ? cargarImagen(imagenUrl) : Promise.resolve(null),
          cargarImagen('/camberas-logo-512.png'),
        ]);
        const gpx = parseGpxFile(await res.text());
        const pts = getAllTrackPoints(gpx);
        if (cancelado) return;
        if (pts.length < 2) throw new Error('El GPX no tiene recorrido');
        setPerfil(construirPerfil(pts, gpx.waypoints));
        setTraza(pts.map((p) => ({ lat: p.lat, lon: p.lon })));
        setImagen(img);
        setLogo(marca);
      } catch (e: any) {
        if (!cancelado) setError(e.message ?? 'No se pudo leer el GPX');
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => { cancelado = true; };
  }, [gpxUrl, imagenUrl]);

  useEffect(() => {
    if (!perfil || traza.length === 0) return;

    /** Título a una o dos líneas, encogiendo hasta que quepa */
    const titulo = (ctx: CanvasRenderingContext2D, texto: string, y: number): number => {
      const ancho = W - M * 2;
      let tam = 84;
      const partir = (t: number): string[] => {
        ctx.font = `900 ${t}px ${FUENTE}`;
        const out: string[] = [];
        let linea = '';
        for (const p of texto.toUpperCase().split(' ')) {
          const prueba = linea ? `${linea} ${p}` : p;
          if (ctx.measureText(prueba).width > ancho && linea) { out.push(linea); linea = p; }
          else linea = prueba;
        }
        if (linea) out.push(linea);
        return out;
      };
      let ls = partir(tam);
      while ((ls.length > 2 || ls.some((l) => ctx.measureText(l).width > ancho)) && tam > 40) {
        tam -= 6;
        ls = partir(tam);
      }
      ctx.fillStyle = CREMA;
      ctx.textAlign = 'left';
      ls.forEach((l, i) => ctx.fillText(l, M, y + i * tam * 1.04));
      return y + (ls.length - 1) * tam * 1.04;
    };

    const fondoYCabecera = (ctx: CanvasRenderingContext2D): number => {
      ctx.fillStyle = TINTA;
      ctx.fillRect(0, 0, W, H);

      if (imagen) {
        // "cover": la imagen del evento llena el lienzo sin deformarse
        const esc = Math.max(W / imagen.width, H / imagen.height);
        const iw = imagen.width * esc;
        const ih = imagen.height * esc;
        ctx.drawImage(imagen, (W - iw) / 2, (H - ih) / 2, iw, ih);
      } else {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, VERDE);
        g.addColorStop(1, TINTA);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
      // Velo: el texto se lee siempre, sea cual sea la foto del evento
      const velo = ctx.createLinearGradient(0, 0, 0, H);
      velo.addColorStop(0, 'rgba(14,36,25,0.90)');
      velo.addColorStop(0.55, 'rgba(14,36,25,0.94)');
      velo.addColorStop(1, 'rgba(14,36,25,0.99)');
      ctx.fillStyle = velo;
      ctx.fillRect(0, 0, W, H);

      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      ctx.fillStyle = NARANJA;
      ctx.font = `800 26px ${FUENTE}`;
      ctx.fillText('CAMBERAS · GRUPETTA', M, 100);

      const yTit = titulo(ctx, nombre, 190);

      ctx.fillStyle = LIMA;
      ctx.font = `600 32px ${FUENTE}`;
      const sub = [formatoFecha(fecha), hora ? `${hora.slice(0, 5)} h` : null, lugar]
        .filter(Boolean).join(' · ');
      ctx.fillText(ajustar(ctx, sub, W - M * 2), M, yTit + 54);

      // La mosca: el logo de la casa arriba a la derecha, como en un
      // canal de televisión — presente pero sin robar protagonismo
      if (logo) {
        const lado = 104;
        ctx.globalAlpha = 0.95;
        ctx.drawImage(logo, W - M - lado, 46, lado, lado);
        ctx.globalAlpha = 1;
      }
      return yTit + 54;
    };

    const cifras = (ctx: CanvasRenderingContext2D, p: PerfilRuta) => {
      const datos = p.sinAltitud
        ? [{ v: p.km.toFixed(1), u: 'KM' }]
        : [
            { v: p.km.toFixed(1), u: 'KM' },
            { v: `+${p.desnivel}`, u: 'M DESNIVEL' },
            { v: `${p.altMax}`, u: 'M ALT. MÁX.' },
          ];
      const y = H - 108;
      const paso = (W - M * 2) / 3;
      datos.forEach((d, i) => {
        const x = M + paso * i;
        ctx.textAlign = 'left';
        ctx.fillStyle = NARANJA;
        ctx.font = `900 62px ${FUENTE}`;
        ctx.fillText(d.v, x, y);
        ctx.fillStyle = 'rgba(250,246,236,0.72)';
        ctx.font = `600 21px ${FUENTE}`;
        ctx.fillText(d.u, x, y + 34);
      });
    };

    // ── Pieza 1: el perfil ─────────────────────────────────────────
    const dibujarPerfil = (ctx: CanvasRenderingContext2D, p: PerfilRuta) => {
      const yCabecera = fondoYCabecera(ctx);

      const x0 = M;
      const ancho = W - M * 2;
      const alto = 380;
      const suelo = Math.max(yCabecera + 420, 900);
      const y0 = suelo - alto;

      // Escala vertical: con rutas casi llanas (Santander→Lasarte: 300 m de
      // rango en 200 km) una escala fiel deja una línea plana ilegible. Se
      // exagera el relieve — como en todo cartel ciclista — pero se rotulan
      // las alturas reales para no engañar a nadie.
      const rango = Math.max(60, p.altMax - p.altMin);
      const yDe = (ele: number) => suelo - ((ele - p.altMin) / rango) * alto * 0.8;
      const xDe = (km: number) => x0 + (km / Math.max(p.km, 0.1)) * ancho;

      ctx.beginPath();
      ctx.moveTo(x0, suelo);
      for (const pt of p.puntos) ctx.lineTo(xDe(pt.km), yDe(pt.ele));
      ctx.lineTo(x0 + ancho, suelo);
      ctx.closePath();
      ctx.fillStyle = NARANJA;
      ctx.fill();

      ctx.beginPath();
      p.puntos.forEach((pt, i) =>
        i === 0 ? ctx.moveTo(xDe(pt.km), yDe(pt.ele)) : ctx.lineTo(xDe(pt.km), yDe(pt.ele)));
      ctx.strokeStyle = CREMA;
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x0, suelo);
      ctx.lineTo(x0 + ancho, suelo);
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.font = `600 22px ${FUENTE}`;
      ctx.fillStyle = 'rgba(250,246,236,0.8)';
      ctx.textAlign = 'left';
      ctx.fillText(`${p.altMin} m`, x0, suelo + 34);
      ctx.textAlign = 'right';
      ctx.fillText(`${p.km.toFixed(1)} km`, x0 + ancho, suelo + 34);

      p.puertos.forEach((pu, i) => {
        const x = xDe(pu.km);
        const y = yDe(pu.cima);
        const h = i % 2 === 0 ? 118 : 62;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y - h);
        ctx.strokeStyle = CREMA;
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = NARANJA;
        ctx.fillRect(x - 3, y - h - 34, 36, 30);
        ctx.fillStyle = TINTA;
        ctx.font = `900 20px ${FUENTE}`;
        ctx.textAlign = 'center';
        ctx.fillText(pu.categoria, x + 15, y - h - 12);

        ctx.textAlign = 'left';
        ctx.fillStyle = CREMA;
        ctx.font = `700 20px ${FUENTE}`;
        ctx.fillText(`${pu.cima} m`, x - 3, y - h - 44);
        if (pu.nombre) {
          ctx.fillStyle = LIMA;
          ctx.font = `800 22px ${FUENTE}`;
          ctx.fillText(ajustar(ctx, pu.nombre, 250), x - 3, y - h - 70);
        }
      });

      // Sin puertos, lo que hay que contar es el punto más alto
      if (p.puertos.length === 0) {
        const cima = p.puntos.reduce((a, b) => (b.ele > a.ele ? b : a), p.puntos[0]);
        const x = xDe(cima.km);
        const y = yDe(cima.ele);
        ctx.beginPath();
        ctx.arc(x, y, 11, 0, Math.PI * 2);
        ctx.fillStyle = LIMA;
        ctx.fill();
        ctx.strokeStyle = TINTA;
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.fillStyle = LIMA;
        ctx.font = `800 24px ${FUENTE}`;
        const derecha = x > W / 2;
        ctx.textAlign = derecha ? 'right' : 'left';
        ctx.fillText(`${Math.round(cima.ele)} m · km ${cima.km.toFixed(0)}`,
          x + (derecha ? -22 : 22), y - 14);
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(250,246,236,0.7)';
        ctx.font = `600 24px ${FUENTE}`;
        ctx.fillText('Recorrido sin puertos catalogados', M, y0 - 26);
      }

      p.hitos.forEach((h, i) => {
        const x = xDe(h.km);
        const esAvit = h.tipo === 'avituallamiento';
        const color = esAvit ? LIMA : CREMA;
        ctx.beginPath();
        ctx.moveTo(x, suelo);
        ctx.lineTo(x, suelo + 52);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, suelo + 66, 13, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.fillStyle = TINTA;
        ctx.font = `900 16px ${FUENTE}`;
        ctx.textAlign = 'center';
        ctx.fillText(esAvit ? 'A' : '•', x, suelo + 72);
        ctx.fillStyle = color;
        ctx.font = `700 20px ${FUENTE}`;
        ctx.textAlign = i === 0 ? 'left' : i === p.hitos.length - 1 ? 'right' : 'center';
        ctx.fillText(ajustar(ctx, h.nombre, 230), x, suelo + 104);
      });

      cifras(ctx, p);
    };

    // ── Pieza 2: el mapa ───────────────────────────────────────────
    const dibujarMapa = (ctx: CanvasRenderingContext2D, p: PerfilRuta) => {
      const yCabecera = fondoYCabecera(ctx);

      const caja = { x: M, y: yCabecera + 60, w: W - M * 2, h: H - yCabecera - 260 };
      const lats = traza.map((t) => t.lat);
      const lons = traza.map((t) => t.lon);
      const minLat = Math.min(...lats), maxLat = Math.max(...lats);
      const minLon = Math.min(...lons), maxLon = Math.max(...lons);
      const kx = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
      const anchoGeo = Math.max((maxLon - minLon) * kx, 1e-6);
      const altoGeo = Math.max(maxLat - minLat, 1e-6);
      const esc = Math.min(caja.w / anchoGeo, caja.h / altoGeo) * 0.9;
      const dx = caja.x + (caja.w - anchoGeo * esc) / 2;
      const dy = caja.y + (caja.h - altoGeo * esc) / 2;
      const px = (t: { lat: number; lon: number }) => dx + (t.lon - minLon) * kx * esc;
      const py = (t: { lat: number; lon: number }) => dy + altoGeo * esc - (t.lat - minLat) * esc;

      const trazar = () => {
        ctx.beginPath();
        traza.forEach((t, i) => (i === 0 ? ctx.moveTo(px(t), py(t)) : ctx.lineTo(px(t), py(t))));
      };
      trazar();
      ctx.strokeStyle = 'rgba(14,36,25,0.85)';   // sombra: cuerpo sobre cualquier fondo
      ctx.lineWidth = 18;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
      trazar();
      ctx.strokeStyle = NARANJA;
      ctx.lineWidth = 9;
      ctx.stroke();

      const marca = (t: { lat: number; lon: number }, color: string, etiqueta: string) => {
        const x = px(t), y = py(t);
        ctx.beginPath();
        ctx.arc(x, y, 17, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = TINTA;
        ctx.lineWidth = 5;
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.font = `800 22px ${FUENTE}`;
        ctx.textAlign = 'center';
        ctx.fillText(etiqueta, x, y - 30);
      };
      marca(traza[0], LIMA, 'SALIDA');
      marca(traza[traza.length - 1], CREMA, 'LLEGADA');

      cifras(ctx, p);
    };

    const c1 = canvasPerfil.current?.getContext('2d');
    const c2 = canvasMapa.current?.getContext('2d');
    if (c1 && !perfil.sinAltitud) dibujarPerfil(c1, perfil);
    if (c2) dibujarMapa(c2, perfil);
  }, [perfil, traza, imagen, logo, nombre, fecha, hora, lugar]);

  const descargar = (ref: React.RefObject<HTMLCanvasElement>, sufijo: string) => {
    if (!ref.current) return;
    const a = document.createElement('a');
    a.download = `${nombre.toLowerCase().replace(/[^a-z0-9]+/gi, '-')}-${sufijo}.png`;
    a.href = ref.current.toDataURL('image/png');
    a.click();
  };

  if (cargando) {
    return <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (error || !perfil) {
    return <p className="text-sm text-destructive py-4">{error ?? 'Sin recorrido'}</p>;
  }

  return (
    <div className="space-y-4">
      <div className={perfil.sinAltitud ? 'flex justify-center' : 'grid grid-cols-2 gap-3'}>
        <canvas
          ref={canvasPerfil} width={W} height={H}
          className={`w-full h-auto rounded-lg border ${perfil.sinAltitud ? 'hidden' : ''}`}
        />
        <canvas ref={canvasMapa} width={W} height={H}
          className={`h-auto rounded-lg border ${perfil.sinAltitud ? 'w-1/2' : 'w-full'}`} />
      </div>

      <div className="flex gap-2">
        {!perfil.sinAltitud && (
          <Button className="flex-1" onClick={() => descargar(canvasPerfil, 'perfil')}>
            <Download className="h-4 w-4 mr-1" /> Perfil
          </Button>
        )}
        <Button className="flex-1" variant="outline" onClick={() => descargar(canvasMapa, 'mapa')}>
          <ImageIcon className="h-4 w-4 mr-1" /> Mapa
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        1080×1350 (4:5).{' '}
        {perfil.sinAltitud
          ? 'Este GPX no incluye altitudes, así que no hay perfil que dibujar: vuelve a exportar la ruta con elevación desde tu planificador y podrás generarlo.'
          : perfil.puertos.length > 0
            ? `${perfil.puertos.length} puerto(s) detectado(s).`
            : 'Sin puertos: se marca el punto más alto.'}
      </p>
    </div>
  );
}
