import { useEffect, useState } from "react";
import type { Prueba } from "@/eventos/tipos";

/**
 * Perfil de altimetría real a partir del GPX del recorrido, dibujado en SVG
 * propio (sin recharts: la plantilla no carga librerías de gráficos). El GPX
 * se descarga una vez por URL y se muestrea a ~240 puntos por distancia.
 * El parser de GPX de Camberas se importa perezosamente para no meterlo en
 * el trozo de la portada cuando no hay tracks.
 */
export interface PerfilGpx {
  /** [km, altitud] muestreados a lo largo del recorrido */
  puntos: [number, number][];
  km: number;
  altMin: number;
  altMax: number;
}

const cache = new Map<string, Promise<PerfilGpx | null>>();

async function cargarPerfil(url: string): Promise<PerfilGpx | null> {
  const [{ parseGpxFile, getAllTrackPoints, calculateHaversineDistance }, xml] = await Promise.all([
    import("@/lib/gpxParser"),
    fetch(url).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`GPX ${r.status}`)))),
  ]);
  const pts = getAllTrackPoints(parseGpxFile(xml)).filter((p) => typeof p.ele === "number" && !isNaN(p.ele));
  if (pts.length < 2) return null;

  // Distancia acumulada
  const acum: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    acum.push(acum[i - 1] + calculateHaversineDistance(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon));
  }
  const total = acum[acum.length - 1]; // calculateHaversineDistance devuelve km
  if (total <= 0) return null;
  const enKm = 1;
  const km = total;

  // Muestreo uniforme por distancia (media de los puntos de cada tramo)
  const N = 240;
  const puntos: [number, number][] = [];
  let j = 0;
  for (let i = 0; i <= N; i++) {
    const objetivo = (i / N) * total;
    let suma = 0;
    let n = 0;
    while (j < pts.length && acum[j] <= objetivo) {
      suma += pts[j].ele as number;
      n++;
      j++;
    }
    const ele = n > 0 ? suma / n : (puntos.length ? puntos[puntos.length - 1][1] : (pts[Math.min(j, pts.length - 1)].ele as number));
    puntos.push([objetivo * enKm, ele]);
  }
  const eles = puntos.map((p) => p[1]);
  return { puntos, km, altMin: Math.min(...eles), altMax: Math.max(...eles) };
}

export function usePerfilGpx(url: string | undefined): PerfilGpx | null | undefined {
  const [perfil, setPerfil] = useState<PerfilGpx | null | undefined>(url ? undefined : null);
  useEffect(() => {
    if (!url) {
      setPerfil(null);
      return;
    }
    let vivo = true;
    if (!cache.has(url)) cache.set(url, cargarPerfil(url).catch(() => null));
    cache.get(url)!.then((p) => {
      if (vivo) setPerfil(p);
    });
    return () => {
      vivo = false;
    };
  }, [url]);
  return perfil;
}

/** Altitud interpolada en un km del perfil */
function altitudEn(perfil: PerfilGpx, km: number): number {
  const { puntos } = perfil;
  if (km <= puntos[0][0]) return puntos[0][1];
  for (let i = 1; i < puntos.length; i++) {
    if (puntos[i][0] >= km) {
      const [k0, e0] = puntos[i - 1];
      const [k1, e1] = puntos[i];
      const t = k1 === k0 ? 0 : (km - k0) / (k1 - k0);
      return e0 + (e1 - e0) * t;
    }
  }
  return puntos[puntos.length - 1][1];
}

const fmtKm = (km: number) => `km ${(Math.round(km * 10) / 10).toString().replace(".", ",")}`;

export function PerfilGpxSvg({ perfil, prueba }: { perfil: PerfilGpx; prueba: Prueba }) {
  const W = 600;
  const H = 170;
  const izq = 44;
  const der = 16;
  const arriba = 14;
  const abajo = 40;
  const color = prueba.color ?? "var(--wp-marca)";
  const idGrad = `perfil-${prueba.id}`;

  // Escala vertical con un poco de aire y mínimo de 100 m de rango
  const rango = Math.max(100, perfil.altMax - perfil.altMin);
  const yMin = perfil.altMin - rango * 0.08;
  const yMax = perfil.altMax + rango * 0.12;
  const x = (km: number) => izq + (km / perfil.km) * (W - izq - der);
  const y = (ele: number) => arriba + (1 - (ele - yMin) / (yMax - yMin)) * (H - arriba - abajo);

  const linea = perfil.puntos.map(([k, e], i) => `${i === 0 ? "M" : "L"}${x(k).toFixed(1)},${y(e).toFixed(1)}`).join(" ");
  const area = `${linea} L${x(perfil.km).toFixed(1)},${(H - abajo).toFixed(1)} L${x(0).toFixed(1)},${(H - abajo).toFixed(1)} Z`;

  const km = prueba.distancia ? prueba.distancia / 1000 : perfil.km;
  const marcadores = (prueba.avituallamientos ?? []).filter((a) => a.km <= Math.max(km, perfil.km) + 0.05);
  const ticks = [perfil.altMin, perfil.altMax].map((v) => Math.round(v));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Perfil de ${prueba.nombre}: de ${Math.round(perfil.altMin)} a ${Math.round(perfil.altMax)} m`}>
      <defs>
        <linearGradient id={idGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0.04} />
        </linearGradient>
      </defs>
      {/* Escala de altitud */}
      {ticks.map((v) => (
        <g key={v}>
          <line x1={izq} x2={W - der} y1={y(v)} y2={y(v)} stroke="var(--wp-border, #dfe3d6)" strokeDasharray="3 4" />
          <text x={izq - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--wp-body)">{v} m</text>
        </g>
      ))}
      <path d={area} fill={`url(#${idGrad})`} />
      <path d={linea} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {/* Avituallamientos y controles sobre el perfil */}
      {marcadores.map((p) => {
        const liquido = p.tipo === "liquido" || p.tipo === "standard";
        const meta = p.tipo === "finish" || p.km >= km - 0.05;
        const px = x(Math.min(p.km, perfil.km));
        const py = y(altitudEn(perfil, Math.min(p.km, perfil.km)));
        return (
          <g key={`${p.nombre}-${p.km}`}>
            <line x1={px} x2={px} y1={py} y2={H - abajo} stroke={color} strokeOpacity={0.35} />
            <circle cx={px} cy={py} r={meta ? 6 : 4.5} fill={meta ? "var(--wp-ink)" : liquido ? "var(--wp-secundario)" : "var(--wp-accion)"} stroke="#fff" strokeWidth={2} />
            <text x={px} y={H - abajo + 16} textAnchor={p.km <= 0.05 ? "start" : meta ? "end" : "middle"} fontSize={11} fill="var(--wp-body)">
              {fmtKm(p.km)}
            </text>
          </g>
        );
      })}
      {marcadores.length === 0 && (
        <>
          <text x={x(0)} y={H - abajo + 16} textAnchor="start" fontSize={11} fill="var(--wp-body)">km 0</text>
          <text x={x(perfil.km)} y={H - abajo + 16} textAnchor="end" fontSize={11} fill="var(--wp-body)">{fmtKm(perfil.km)}</text>
        </>
      )}
    </svg>
  );
}
