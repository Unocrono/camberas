/**
 * Cartel de resultados para redes — una pieza 4:5 (1080×1350) por recorrido,
 * con el podio masculino y el femenino. Se dibuja a mano sobre canvas, como
 * CartelRuta (que explica por qué no html2canvas), y con la misma cabecera.
 *
 * Fuente: race_results con estado FIN, por tiempo. El sexo es el de la
 * inscripción (gender_id, y si falta el texto), el mismo que enseña
 * LiveResults; NO el gender_position de race_results, que process_event_results
 * calcula con otro origen (get_registration_gender) y puede no coincidir.
 * Los recorridos no competitivos (marchas) no tienen podio y no salen.
 *
 * Lo ve quien gestiona la carrera (descargar); publicar en el Instagram de
 * Camberas, solo el admin (prop instagram).
 */

import { useEffect, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PublicarInstagram } from "@/components/instagram/PublicarInstagram";
import { getGenderIdFromText } from "@/lib/genderUtils";
import { fechaLarga, lienzoAJpeg, MAX_CARRUSEL } from "@/lib/instagram";

// ── Paleta Camberas (docs/paleta-camberas.md) ──────────────────────
const TINTA = "#0E2419";
const VERDE = "#235940";
const NARANJA = "#EC7C2B";
const CREMA = "#FAF6EC";
const LIMA = "#C8E85C";
const MELOCOTON = "#F6C89A";

const W = 1080;
const H = 1350;
const M = 70;
const FUENTE = "Archivo, Inter, system-ui, sans-serif";

// La mosca (logo arriba a la derecha): la primera línea del título se corta antes
const LOGO_LADO = 104;
const LOGO_X0 = W - M - LOGO_LADO;
const LOGO_Y0 = 46;

// Oro, plata y bronce, con colores de la paleta
const COLOR_PUESTO = [NARANJA, CREMA, MELOCOTON];
const TITULO_SEXO: Record<number, string> = { 1: "MASCULINA", 2: "FEMENINA", 3: "MIXTA" };

interface Carrera {
  name: string;
  date: string;
  location: string | null;
  slug: string | null;
  image_url: string | null;
  cover_image_url: string | null;
  race_type: string | null;
}

interface Puesto {
  nombre: string;
  club: string | null;
  tiempo: string;
}

interface Pieza {
  distanciaId: string;
  distancia: string;
  km: number | null;
  desnivel: number | null;
  /** Como mucho dos bloques (no caben más): masculina y femenina, o mixta si no hay otra */
  bloques: { titulo: string; podio: Puesto[] }[];
}

interface FilaResultado {
  finish_time: string;
  registration: {
    bib_number: number | null;
    first_name: string | null;
    last_name: string | null;
    gender: string | null;
    gender_id: number | null;
    club: string | null;
    team: string | null;
    profiles: { first_name: string | null; last_name: string | null; gender: string | null; gender_id: number | null } | null;
  } | null;
}

interface CartelResultadosProps {
  raceId: string;
  /** Solo el admin: añade «Publicar en Instagram» (cuenta de Camberas) */
  instagram?: boolean;
}

/** Intervalo de Postgres ('01:23:45', '1 day 02:00:00', '00:41:07.5') → '1:23:45' */
const tiempoCorto = (intervalo: string): string => {
  const m = intervalo.match(/(?:(\d+) days? )?(\d+):(\d{2}):(\d{2})/);
  if (!m) return intervalo;
  const horas = (m[1] ? +m[1] * 24 : 0) + +m[2];
  return horas > 0 ? `${horas}:${m[3]}:${m[4]}` : `${+m[3]}:${m[4]}`;
};

/** 'JUAN PÉREZ DE LA FUENTE' → 'Juan Pérez de la Fuente'; lo que ya viene mezclado se respeta */
const PARTICULAS = new Set(["de", "del", "la", "las", "los", "y", "i", "da", "do", "dos"]);
const nombrePropio = (s: string): string =>
  s !== s.toUpperCase()
    ? s
    : s
        .toLowerCase()
        .split(/(\s+|-)/)
        .map((p, i) => (i > 0 && PARTICULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
        .join("");

const nombreDe = (r: NonNullable<FilaResultado["registration"]>): string => {
  const n = [r.first_name, r.last_name].filter(Boolean).join(" ").trim()
    || [r.profiles?.first_name, r.profiles?.last_name].filter(Boolean).join(" ").trim();
  return n ? nombrePropio(n) : `Dorsal ${r.bib_number ?? "?"}`;
};

const sexoDe = (r: NonNullable<FilaResultado["registration"]>): number | null =>
  r.gender_id ?? r.profiles?.gender_id ?? getGenderIdFromText(r.gender ?? r.profiles?.gender) ?? null;

async function cargar(raceId: string): Promise<{ carrera: Carrera; piezas: Pieza[] }> {
  const { data: carrera, error: e1 } = await supabase
    .from("races")
    .select("name, date, location, slug, image_url, cover_image_url, race_type")
    .eq("id", raceId)
    .single();
  if (e1 || !carrera) throw new Error(e1?.message ?? "Carrera no encontrada");

  const { data: distancias, error: e2 } = await supabase
    .from("race_distances")
    .select("id, name, distance_km, elevation_gain, competitive")
    .eq("race_id", raceId)
    .order("display_order", { ascending: true });
  if (e2) throw new Error(e2.message);

  const piezas: Pieza[] = [];
  for (const d of distancias ?? []) {
    if (d.competitive === false) continue;
    // Basta el principio de la clasificación; 1.000 es además el tope de PostgREST
    const { data, error } = await supabase
      .from("race_results")
      .select(`finish_time, registration:registrations (
        bib_number, first_name, last_name, gender, gender_id, club, team,
        profiles (first_name, last_name, gender, gender_id)
      )`)
      .eq("race_distance_id", d.id)
      .eq("status", "FIN")
      .order("finish_time", { ascending: true })
      .limit(1000);
    if (error) throw new Error(error.message);

    const porSexo = new Map<number, Puesto[]>();
    for (const f of (data ?? []) as unknown as FilaResultado[]) {
      if (!f.registration || !f.finish_time) continue;
      const sexo = sexoDe(f.registration);
      if (!sexo || !TITULO_SEXO[sexo]) continue;
      const podio = porSexo.get(sexo) ?? [];
      if (podio.length < 3) {
        podio.push({
          nombre: nombreDe(f.registration),
          club: f.registration.club || f.registration.team || null,
          tiempo: tiempoCorto(f.finish_time),
        });
        porSexo.set(sexo, podio);
      }
    }
    const bloques = [1, 2, 3]
      .flatMap((s) => {
        const podio = porSexo.get(s);
        return podio ? [{ titulo: TITULO_SEXO[s], podio }] : [];
      })
      .slice(0, 2);
    if (bloques.length > 0) {
      piezas.push({
        distanciaId: d.id,
        distancia: d.name,
        km: d.distance_km,
        desnivel: d.elevation_gain,
        bloques,
      });
    }
  }
  return { carrera: carrera as Carrera, piezas: piezas.slice(0, MAX_CARRUSEL) };
}

const HASHTAGS: Record<string, string> = {
  trail: "#trail #trailrunning",
  mtb: "#mtb",
  both: "#trail #mtb",
  popular: "#running",
  ciclismo: "#ciclismo",
  triatlon: "#triatlon",
  natacion: "#natacion",
};

function pieResultados(c: Carrera, piezas: Pieza[]): string {
  const ganadores = piezas.map((p) => {
    const primeros = p.bloques.map((b) => `🥇 ${b.podio[0].nombre} (${b.podio[0].tiempo})`).join(" · ");
    return `${p.distancia}: ${primeros}`;
  });
  return [
    `🏁 Resultados · ${c.name}`,
    `📅 ${fechaLarga(c.date)}${c.location ? ` · 📍 ${c.location}` : ""}`,
    "",
    ...ganadores,
    "",
    c.slug ? `Clasificación completa en camberas.com/${c.slug}` : null,
    c.slug ? "" : null,
    `#camberas ${HASHTAGS[c.race_type ?? ""] ?? ""}`.trim(),
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
}

const cargarImagen = (url: string): Promise<HTMLImageElement | null> =>
  new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });

/** Encoge el texto hasta que quepa; si ni al mínimo, lo corta con puntos suspensivos */
const encajar = (
  ctx: CanvasRenderingContext2D, texto: string, max: number, peso: number, tam: number, minimo: number,
): string => {
  let t = tam;
  ctx.font = `${peso} ${t}px ${FUENTE}`;
  while (ctx.measureText(texto).width > max && t > minimo) {
    t -= 2;
    ctx.font = `${peso} ${t}px ${FUENTE}`;
  }
  if (ctx.measureText(texto).width <= max) return texto;
  let s = texto;
  while (s.length > 3 && ctx.measureText(s + "…").width > max) s = s.slice(0, -1);
  return s + "…";
};

function dibujar(
  ctx: CanvasRenderingContext2D, c: Carrera, p: Pieza,
  imagen: HTMLImageElement | null, logo: HTMLImageElement | null,
) {
  // Fondo: la foto de la carrera bajo un velo, o el degradado de la casa
  ctx.fillStyle = TINTA;
  ctx.fillRect(0, 0, W, H);
  if (imagen) {
    const esc = Math.max(W / imagen.width, H / imagen.height);
    ctx.drawImage(imagen, (W - imagen.width * esc) / 2, (H - imagen.height * esc) / 2, imagen.width * esc, imagen.height * esc);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, VERDE);
    g.addColorStop(1, TINTA);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  const velo = ctx.createLinearGradient(0, 0, 0, H);
  velo.addColorStop(0, "rgba(14,36,25,0.90)");
  velo.addColorStop(0.5, "rgba(14,36,25,0.95)");
  velo.addColorStop(1, "rgba(14,36,25,0.99)");
  ctx.fillStyle = velo;
  ctx.fillRect(0, 0, W, H);

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = NARANJA;
  ctx.font = `800 26px ${FUENTE}`;
  ctx.fillText("CAMBERAS · RESULTADOS", M, 100);

  // Título a una o dos líneas, que no pase por debajo de la mosca
  const anchoLinea = (i: number) => (i === 0 ? LOGO_X0 - M - 24 : W - M * 2);
  let tam = 76;
  let lineas: string[] = [];
  for (;;) {
    ctx.font = `900 ${tam}px ${FUENTE}`;
    lineas = [];
    let l = "";
    for (const pal of c.name.toUpperCase().split(" ")) {
      const prueba = l ? `${l} ${pal}` : pal;
      if (ctx.measureText(prueba).width > anchoLinea(lineas.length) && l) {
        lineas.push(l);
        l = pal;
      } else l = prueba;
    }
    if (l) lineas.push(l);
    const cabe = lineas.length <= 2 && lineas.every((x, i) => ctx.measureText(x).width <= anchoLinea(i));
    if (cabe || tam <= 40) break;
    tam -= 6;
  }
  lineas = lineas.slice(0, 2);
  ctx.fillStyle = CREMA;
  lineas.forEach((x, i) => ctx.fillText(x, M, 186 + i * tam * 1.04));
  const yTit = 186 + (lineas.length - 1) * tam * 1.04;

  ctx.fillStyle = LIMA;
  ctx.font = `600 30px ${FUENTE}`;
  const sub = [fechaLarga(c.date), c.location].filter(Boolean).join(" · ");
  ctx.fillText(encajar(ctx, sub, W - M * 2, 600, 30, 22), M, yTit + 50);

  // Banda del recorrido
  const yBanda = yTit + 84;
  ctx.fillStyle = NARANJA;
  ctx.fillRect(M, yBanda, W - M * 2, 62);
  const datos = [
    p.distancia.toUpperCase(),
    p.km ? `${String(p.km).replace(".", ",")} KM` : null,
    p.desnivel ? `+${p.desnivel} M` : null,
  ].filter(Boolean).join(" · ");
  ctx.fillStyle = TINTA;
  ctx.fillText(encajar(ctx, datos, W - M * 2 - 40, 900, 30, 20), M + 20, yBanda + 42);

  // Podios: bloques de 3 filas, encajados en lo que queda hasta el pie
  const yPie = H - 64;
  let y = yBanda + 62 + 64;
  // Cada bloque: rótulo (34) + tres filas + separación (50) hasta el siguiente
  const fila = Math.min(104, (yPie - 40 - y - p.bloques.length * 84) / (p.bloques.length * 3));
  for (const b of p.bloques) {
    ctx.textAlign = "left";
    ctx.fillStyle = LIMA;
    ctx.font = `800 26px ${FUENTE}`;
    ctx.fillText(b.titulo, M, y);
    y += 34;
    b.podio.forEach((pu, i) => {
      const cy = y + fila / 2;
      ctx.beginPath();
      ctx.arc(M + 30, cy, 28, 0, Math.PI * 2);
      ctx.fillStyle = COLOR_PUESTO[i];
      ctx.fill();
      ctx.fillStyle = TINTA;
      ctx.font = `900 30px ${FUENTE}`;
      ctx.textAlign = "center";
      ctx.fillText(String(i + 1), M + 30, cy + 11);

      const xNombre = M + 80;
      const anchoTiempo = 210;
      const anchoNombre = W - M - anchoTiempo - xNombre - 20;
      ctx.textAlign = "left";
      ctx.fillStyle = CREMA;
      const nombre = encajar(ctx, pu.nombre.toUpperCase(), anchoNombre, 800, 36, 26);
      ctx.fillText(nombre, xNombre, pu.club ? cy - 2 : cy + 12);
      if (pu.club) {
        ctx.fillStyle = "rgba(250,246,236,0.65)";
        ctx.fillText(encajar(ctx, pu.club, anchoNombre, 600, 22, 18), xNombre, cy + 28);
      }
      ctx.textAlign = "right";
      ctx.fillStyle = i === 0 ? NARANJA : CREMA;
      ctx.font = `900 38px ${FUENTE}`;
      ctx.fillText(pu.tiempo, W - M, cy + 13);
      y += fila;
    });
    y += 50;
  }

  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(250,246,236,0.72)";
  ctx.font = `600 24px ${FUENTE}`;
  if (c.slug) ctx.fillText(`Clasificación completa en camberas.com/${c.slug}`, M, yPie);

  if (logo) {
    ctx.globalAlpha = 0.95;
    ctx.drawImage(logo, LOGO_X0, LOGO_Y0, LOGO_LADO, LOGO_LADO);
    ctx.globalAlpha = 1;
  }
}

export function CartelResultados({ raceId, instagram }: CartelResultadosProps) {
  const [datos, setDatos] = useState<{ carrera: Carrera; piezas: Pieza[] } | null>(null);
  const [imagen, setImagen] = useState<HTMLImageElement | null>(null);
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const lienzos = useRef<(HTMLCanvasElement | null)[]>([]);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(null);
    (async () => {
      try {
        const d = await cargar(raceId);
        const foto = d.carrera.cover_image_url || d.carrera.image_url;
        const [img, marca] = await Promise.all([
          foto ? cargarImagen(foto) : Promise.resolve(null),
          cargarImagen("/camberas-logo-512.png"),
        ]);
        if (cancelado) return;
        setDatos(d);
        setImagen(img);
        setLogo(marca);
      } catch (e) {
        if (!cancelado) setError((e as Error).message);
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [raceId]);

  useEffect(() => {
    if (!datos) return;
    datos.piezas.forEach((p, i) => {
      const ctx = lienzos.current[i]?.getContext("2d");
      if (ctx) dibujar(ctx, datos.carrera, p, imagen, logo);
    });
  }, [datos, imagen, logo]);

  const descargar = async (i: number) => {
    const lienzo = lienzos.current[i];
    if (!lienzo || !datos) return;
    const p = datos.piezas[i];
    const url = URL.createObjectURL(await lienzoAJpeg(lienzo));
    const a = document.createElement("a");
    a.download = `resultados-${datos.carrera.slug ?? "carrera"}-${p.distancia.toLowerCase().replace(/[^a-z0-9]+/gi, "-")}.jpg`;
    a.href = url;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (cargando) {
    return <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (error || !datos) {
    return <p className="text-sm text-destructive py-4">{error ?? "Sin datos"}</p>;
  }
  if (datos.piezas.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        Esta carrera aún no tiene llegadas (estado FIN) en Camberas: procesa los tiempos y resultados
        primero. Si se cronometró con otro sistema (RaceTec…), sus resultados no están aquí.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {datos.piezas.map((p, i) => (
          <div key={p.distanciaId} className="space-y-1">
            <canvas
              ref={(el) => {
                lienzos.current[i] = el;
              }}
              width={W}
              height={H}
              className="w-full h-auto rounded-lg border"
            />
            <Button size="sm" variant="outline" className="w-full" onClick={() => descargar(i)}>
              <Download className="h-4 w-4 mr-1" /> {p.distancia}
            </Button>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        1080×1350 (4:5), JPEG. Podio por sexo de cada recorrido competitivo, con los tiempos de
        Resultados: si cambias algo allí, vuelve a abrir el cartel.
      </p>

      {instagram && (
        <PublicarInstagram
          tipo="resultados"
          raceId={raceId}
          pieInicial={pieResultados(datos.carrera, datos.piezas)}
          lienzos={() => lienzos.current.slice(0, datos.piezas.length)}
        />
      )}
    </div>
  );
}
