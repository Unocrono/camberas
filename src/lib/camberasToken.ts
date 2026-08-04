/**
 * Lectura unificada de tokens Camberas.
 *
 * Un token identifica a un PUESTO o DISPOSITIVO (dorsal, moto, punto de
 * cronometraje), nunca a una persona. Este módulo es la única puerta de
 * entrada: da igual que el código llegue de un QR, de un enlace, de un deep
 * link o pegado a mano.
 *
 * Formatos aceptados (todos equivalentes):
 *   1273f649-65ae-46aa-839a-55c0b58331a0
 *   https://camberas.com/activar.html?t=1273f649-…
 *   https://camberas.com/timing?t=1273f649-…
 *   https://camberas.com/a/1273f649-…
 *   camberas://activate/1273f649-…
 *   exp://192.168.1.10:8081/--/activate/1273f649-…      (desarrollo)
 *
 * Preparado para tokens firmados (v2): si el código trae `<uuid>.<firma>` o
 * parámetros extra (`v` versión, `e` caducidad, `s` firma), viajan en el
 * resultado para que el servidor los valide. Hoy se ignoran sin romper nada.
 *
 * Copia idéntica en camberas-track/src/lib y camberas-motos/src/utils:
 * si tocas uno, toca los tres (docs/tokens-camberas.md).
 */

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export interface CamberasToken {
  /** UUID normalizado en minúsculas — la credencial que espera el servidor */
  token: string;
  /** Firma opcional que acompaña al UUID (`<uuid>.<firma>`), para tokens v2 */
  firma?: string;
  /** Parámetros extra del enlace (v, e, s…) por si el servidor los necesita */
  params: Record<string, string>;
  /** De dónde salió, útil para diagnóstico */
  origen: 'uuid' | 'url' | 'deeplink';
}

/**
 * Extrae el token de cualquier formato aceptado.
 * Devuelve null si el código no contiene un token válido.
 */
export function parseCamberasToken(raw: string): CamberasToken | null {
  if (!raw) return null;
  const texto = raw.trim();

  const m = texto.match(UUID_RE);
  if (!m) return null;

  const token = m[0].toLowerCase();

  // Firma pegada al UUID: <uuid>.<firma>
  let firma: string | undefined;
  const resto = texto.slice((m.index ?? 0) + m[0].length);
  const firmaMatch = resto.match(/^\.([A-Za-z0-9_-]+)/);
  if (firmaMatch) firma = firmaMatch[1];

  // Parámetros del enlace, si los hay
  const params: Record<string, string> = {};
  const q = texto.indexOf('?');
  if (q >= 0) {
    for (const par of texto.slice(q + 1).split('&')) {
      const [k, v] = par.split('=');
      if (k && v && k !== 't' && k !== 'token') {
        params[decodeURIComponent(k)] = decodeURIComponent(v);
      }
    }
  }

  const esUrl = /^https?:\/\//i.test(texto);
  const esDeepLink = /^[a-z][a-z0-9+.-]*:\/\//i.test(texto) && !esUrl;

  return {
    token,
    firma,
    params,
    origen: esUrl ? 'url' : esDeepLink ? 'deeplink' : 'uuid',
  };
}

/** Igual que parseCamberasToken pero lanza con un mensaje para la interfaz. */
export function requireCamberasToken(raw: string): CamberasToken {
  const parsed = parseCamberasToken(raw);
  if (!parsed) {
    throw new Error('Código no válido — escanea el QR de Camberas o pega su token');
  }
  return parsed;
}

/** Destino canónico de un QR de activación. */
export type DestinoToken = 'dorsal' | 'moto' | 'cronometraje';

const RUTAS: Record<DestinoToken, string> = {
  dorsal: '/activar.html',
  moto: '/activar.html',
  cronometraje: '/timing',
};

/**
 * Construye el enlace que debe llevar un QR. Se usa URL y no el UUID pelado
 * para que, si alguien lo escanea con la cámara del sistema, llegue a una
 * página que le explique qué hacer en vez de a un texto sin sentido.
 */
export function camberasTokenUrl(
  token: string,
  destino: DestinoToken = 'dorsal',
  base = 'https://camberas.com'
): string {
  return `${base}${RUTAS[destino]}?t=${token}`;
}
