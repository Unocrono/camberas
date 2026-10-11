/**
 * Lo común a todo lo de Meta (WhatsApp e Instagram, una sola app): la versión
 * de la Graph API y la firma de los webhooks.
 */

// Una sola versión para todo. Meta mantiene cada una unos dos años: al
// subirla, se sube aquí y lo notan WhatsApp e Instagram a la vez.
export const GRAPH_VERSION = "v26.0";

/**
 * Valida X-Hub-Signature-256 (HMAC-SHA256 del cuerpo con el App Secret). Sin
 * esto cualquiera puede disparar el bot (y gastar su cuota) haciendo POST a la
 * URL pública de la función.
 */
export async function verifySignature(
  rawBody: string,
  header: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!header || !header.startsWith("sha256=")) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const given = header.slice(7);

  // Comparación en tiempo constante
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  }
  return diff === 0;
}
