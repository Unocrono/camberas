// Redsys compartido por redsys-init-payment, team-init-payment y redsys-webhook.
//
// Comercio por carrera: si la carrera tiene fila activa en race_tpv, se cobra
// con el TPV del organizador (el dinero va a su cuenta); si no, con el de UNO
// (secretos REDSYS_* de la función). La clave del comercio vive en el Vault y
// solo la leen estas funciones (service_role) a través de tpv_de_carrera() y
// clave_tpv(). El intent guarda con qué comercio se firmó (secret_ref) para
// que el webhook verifique con esa clave aunque el organizador cambie de TPV.
import CryptoJS from "https://esm.sh/crypto-js@4.2.0";

export type Entorno = "test" | "prod";

export const REDSYS_URLS: Record<Entorno, { rest: string; insite: string; redirect: string }> = {
  test: {
    rest: "https://sis-t.redsys.es:25443/sis/rest/trataPeticionREST",
    insite: "https://sis-t.redsys.es:25443/sis/NC/sandbox/redsysV3.js",
    redirect: "https://sis-t.redsys.es:25443/sis/realizarPago",
  },
  prod: {
    rest: "https://sis.redsys.es/sis/rest/trataPeticionREST",
    insite: "https://sis.redsys.es/sis/NC/redsysV3.js",
    redirect: "https://sis.redsys.es/sis/realizarPago",
  },
};

// Firma Redsys HMAC_SHA256_V1:
// 1. Derivar clave de operación cifrando el nº de pedido con 3DES-CBC
//    (clave = secreto del comercio en base64, IV = ceros, padding = ceros)
// 2. HMAC-SHA256 de Ds_MerchantParameters con la clave derivada
// 3. Codificar en Base64 estándar
export function generateSignature(merchantParams: string, orderNumber: string, secretKey: string): string {
  const key = CryptoJS.enc.Base64.parse(secretKey);
  const iv = CryptoJS.enc.Hex.parse("0000000000000000");
  const derivedKey = CryptoJS.TripleDES.encrypt(orderNumber, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.ZeroPadding,
  }).ciphertext;
  const hmac = CryptoJS.HmacSHA256(merchantParams, derivedKey);
  return CryptoJS.enc.Base64.stringify(hmac);
}

// Normaliza base64/base64url sin padding para comparar firmas
export function normalizeB64(sig: string): string {
  return sig.replace(/-/g, "+").replace(/_/g, "/").replace(/=/g, "");
}

export interface Tpv {
  merchantCode: string;
  terminal: string;
  secretKey: string;
  /** Nombre del secreto en el Vault; null = TPV de UNO (secretos de la función) */
  secretRef: string | null;
  entorno: Entorno | null;
  /** true si el cobro va al comercio del organizador */
  propio: boolean;
}

// deno-lint-ignore no-explicit-any
type Cliente = any;

/** TPV de UNO, de los secretos de la función. null si no están configurados. */
export function tpvUno(): Tpv | null {
  const merchantCode = Deno.env.get("REDSYS_MERCHANT_CODE");
  const terminal = Deno.env.get("REDSYS_TERMINAL");
  const secretKey = Deno.env.get("REDSYS_SECRET_KEY");
  if (!merchantCode || !terminal || !secretKey) return null;
  return { merchantCode, terminal, secretKey, secretRef: null, entorno: null, propio: false };
}

/**
 * Comercio con el que se cobra una carrera: el suyo si lo tiene activo, si no
 * el de UNO. Lanza error si no hay ninguno (nunca se inicia un pago sin
 * comercio).
 */
export async function resolverTpv(supabase: Cliente, raceId: string | null | undefined): Promise<Tpv> {
  if (raceId) {
    const { data, error } = await supabase.rpc("tpv_de_carrera", { p_race_id: raceId });
    if (error) console.error("tpv_de_carrera:", error.message);
    if (data && data.merchant_code && data.secret_key) {
      return {
        merchantCode: String(data.merchant_code),
        terminal: String(data.terminal || "1"),
        secretKey: String(data.secret_key),
        secretRef: String(data.secret_ref),
        entorno: data.entorno === "prod" ? "prod" : "test",
        propio: true,
      };
    }
  }
  const uno = tpvUno();
  if (!uno) throw new Error("Redsys credentials not configured");
  return uno;
}

/**
 * Clave con la que verificar la notificación de un pago ya iniciado: la del
 * secreto que guardó el intent, o la de UNO si el intent no lleva ninguno.
 */
export async function claveDeIntent(supabase: Cliente, secretRef: string | null | undefined): Promise<string | null> {
  if (secretRef) {
    const { data, error } = await supabase.rpc("clave_tpv", { p_secret_ref: secretRef });
    if (error) console.error("clave_tpv:", error.message);
    if (data) return String(data);
    return null; // el secreto ya no existe: no caer al de UNO, la firma no sería suya
  }
  return Deno.env.get("REDSYS_SECRET_KEY") ?? null;
}

/** Orígenes propios de Camberas (web pública, previas de Lovable, desarrollo). */
export function esOrigenCamberas(origin: string | null | undefined): boolean {
  if (!origin) return false;
  try {
    const { hostname } = new URL(origin);
    return (
      hostname === "camberas.com" ||
      hostname === "www.camberas.com" ||
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.endsWith(".lovable.app") ||
      hostname.endsWith(".lovableproject.com") ||
      hostname.endsWith(".camberas.com")
    );
  } catch {
    return false;
  }
}

export interface Retorno {
  /** Origen al que vuelve Redsys (https://dominio-de-la-carrera o https://camberas.com) */
  base: string;
  /** "/{slug}" cuando la web se sirve en camberas.com; "" bajo dominio propio */
  prefijo: string;
  /** true si origin era un dominio propio verificado de la carrera */
  dominioPropio: boolean;
}

/**
 * A dónde vuelve el corredor tras pagar. Nunca una URL libre del cliente: el
 * origin de la petición solo se acepta si es de Camberas o un dominio propio
 * VERIFICADO de esa carrera; si no, se vuelve a camberas.com.
 */
export async function resolverRetorno(
  supabase: Cliente,
  origin: string | null | undefined,
  raceId: string | null | undefined,
  slug: string | null | undefined,
): Promise<Retorno> {
  const sitio = Deno.env.get("SITE_URL") ?? "https://camberas.com";
  const prefijoSlug = slug ? `/${slug}` : "";
  if (esOrigenCamberas(origin)) return { base: origin!, prefijo: prefijoSlug, dominioPropio: false };
  if (origin && raceId) {
    try {
      const hostname = new URL(origin).hostname.toLowerCase().replace(/^www\./, "");
      const { data } = await supabase
        .from("race_domains")
        .select("hostname")
        .eq("race_id", raceId)
        .eq("hostname", hostname)
        .eq("verificado", true)
        .maybeSingle();
      if (data) return { base: origin, prefijo: "", dominioPropio: true };
    } catch {
      // origin mal formado: se cae al sitio de Camberas
    }
  }
  return { base: sitio, prefijo: prefijoSlug, dominioPropio: false };
}

/** Base64 UTF-8 de los parámetros (btoa a secas es Latin-1 y rompe ñ/acentos). */
export function merchantParamsB64(merchantParams: Record<string, string>): string {
  const utf8Bytes = new TextEncoder().encode(JSON.stringify(merchantParams));
  let binary = "";
  for (const b of utf8Bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** Ds_MerchantParameters de una respuesta de Redsys (base64 o base64url) a texto UTF-8. */
export function decodificarParametros(b64: string): string {
  let base64 = b64.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) base64 += "=";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Nº de pedido Redsys: 12 dígitos, único por intento. */
export function nuevoOrderNumber(): string {
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.floor(Math.random() * 9999).toString().padStart(4, "0");
  return timestamp + random;
}

/** Lo que el cliente necesita para redirigir: URLs del entorno del comercio. */
export function urlsParaCliente(tpv: Tpv, isTestCliente: boolean) {
  // Con TPV propio manda su entorno; con el de UNO se respeta lo que pide el
  // cliente (comportamiento previo)
  const entorno: Entorno = tpv.entorno ?? (isTestCliente ? "test" : "prod");
  return {
    entorno,
    insiteUrl: REDSYS_URLS[entorno].insite,
    redsysUrl: REDSYS_URLS[entorno].rest,
    redirectUrl: REDSYS_URLS[entorno].redirect,
    merchantCode: tpv.merchantCode,
    terminal: tpv.terminal,
    tpvPropio: tpv.propio,
  };
}
