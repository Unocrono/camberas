/**
 * Instagram de Camberas desde la web: pasar los lienzos de un cartel a JPEG,
 * subirlos al bucket público «instagram» y llamar a la función
 * instagram-publicar. El lado del servidor está en
 * supabase/functions/_shared/instagram.ts; el alta en Meta, en
 * docs/instagram-alta-meta.md.
 */

import { supabase } from "@/integrations/supabase/client";
import { hoyLocal } from "@/lib/timezoneUtils";

export type TipoPublicacion = "cartel_grupetta" | "resultados" | "otro";

/** Lo que admite Instagram en un pie */
export const MAX_PIE = 2200;
export const MAX_CARRUSEL = 10;

export interface EstadoCuenta {
  id: string;
  username: string;
  name?: string;
  profile_picture_url?: string;
  followers_count?: number;
  media_count?: number;
  cupo: { usadas: number; total: number | null } | null;
}

/** Fila de instagram_publicaciones (aún no está en los tipos generados) */
export interface Publicacion {
  id: string;
  tipo: TipoPublicacion | "historia";
  formato: "feed" | "historia";
  race_id: string | null;
  imagenes: string[];
  pie: string | null;
  estado: "pendiente" | "publicada" | "error";
  permalink: string | null;
  error: string | null;
  created_at: string;
  publicada_at: string | null;
}

/**
 * Instagram solo admite JPEG. Calidad alta: Instagram vuelve a comprimir y
 * mejor que no le llegue ya castigada.
 */
export const lienzoAJpeg = (lienzo: HTMLCanvasElement): Promise<Blob> =>
  new Promise((ok, mal) =>
    lienzo.toBlob(
      (b) => (b ? ok(b) : mal(new Error("No se pudo convertir el cartel a JPEG"))),
      "image/jpeg",
      0.92,
    ),
  );

/** Sube las imágenes al bucket público y devuelve sus URLs (Meta las descarga de ahí) */
export async function subirImagenes(imagenes: Blob[], tipo: TipoPublicacion): Promise<string[]> {
  const urls: string[] = [];
  for (const img of imagenes) {
    const ruta = `${tipo}/${hoyLocal()}/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage
      .from("instagram")
      .upload(ruta, img, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
    if (error) throw new Error(`No se pudo subir la imagen: ${error.message}`);
    urls.push(supabase.storage.from("instagram").getPublicUrl(ruta).data.publicUrl);
  }
  return urls;
}

/**
 * Llama a instagram-publicar. La función contesta {error} con el motivo (de
 * Meta o suyo); supabase-js lo esconde en error.context cuando el estado no
 * es 2xx, así que se saca de ahí.
 */
export async function llamarInstagram<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("instagram-publicar", { body });
  if (error) {
    let mensaje = error.message;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cuerpo = await (error as any).context?.json?.();
      if (cuerpo?.error) mensaje = cuerpo.error;
    } catch {
      // sin cuerpo JSON: vale el mensaje genérico
    }
    throw new Error(mensaje);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export const estadoInstagram = () =>
  llamarInstagram<{ ok: true; cuenta: EstadoCuenta }>({ accion: "estado" }).then((r) => r.cuenta);

/** Pasa los lienzos a JPEG, los sube y los publica: uno = foto, varios = carrusel */
export async function publicarLienzos(
  lienzos: HTMLCanvasElement[],
  tipo: TipoPublicacion,
  pie: string,
  raceId?: string | null,
): Promise<{ permalink: string | null }> {
  if (lienzos.length === 0) throw new Error("No hay nada que publicar");
  if (lienzos.length > MAX_CARRUSEL) throw new Error(`Un carrusel admite como mucho ${MAX_CARRUSEL} imágenes`);
  const jpegs = await Promise.all(lienzos.map(lienzoAJpeg));
  const imagenes = await subirImagenes(jpegs, tipo);
  return llamarInstagram<{ ok: true; permalink: string | null }>({
    accion: "publicar",
    tipo,
    imagenes,
    pie,
    race_id: raceId ?? null,
  });
}

// ── Pies ─────────────────────────────────────────────────────────────

/** 'YYYY-MM-DD' → «Domingo, 12 de octubre» (fecha de calendario, sin zonas) */
export const fechaLarga = (iso: string): string => {
  const t = new Date(`${iso}T00:00:00`).toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/**
 * Pie del cartel de una grupetta. El enlace para unirse solo va si la grupetta
 * está publicada (con las uniones abiertas): si no, llevaría a una puerta
 * cerrada. Los enlaces de un pie no se pueden pulsar, pero se pueden copiar.
 */
export function pieGrupetta(g: {
  nombre: string;
  fecha: string;
  hora?: string | null;
  lugar?: string | null;
  joinCode?: string | null;
  publicada?: boolean;
}): string {
  return [
    `🚴 ${g.nombre}`,
    `📅 ${fechaLarga(g.fecha)}${g.hora ? ` · ${g.hora.slice(0, 5)} h` : ""}`,
    g.lugar ? `📍 ${g.lugar}` : null,
    "",
    g.publicada && g.joinCode ? `Para unirte: camberas.com/grupetta?c=${g.joinCode}` : null,
    g.publicada && g.joinCode ? "" : null,
    "#camberas #grupetta #ciclismo",
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
}
