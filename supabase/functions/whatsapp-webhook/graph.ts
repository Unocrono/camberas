/**
 * Cloud API de Meta: firma del webhook y envío de mensajes.
 */

import { GRAPH_VERSION } from "../_shared/meta.ts";

// La firma es la misma para WhatsApp e Instagram (una sola app de Meta)
export { verifySignature } from "../_shared/meta.ts";

/**
 * Mensaje de texto dentro de la ventana de 24h (service message, no se factura).
 * Fuera de la ventana Meta lo rechaza: hay que usar plantilla, y eso es la F3.
 */
export async function sendText(to: string, body: string): Promise<void> {
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const token = Deno.env.get("WHATSAPP_TOKEN");

  if (!phoneNumberId || !token) {
    throw new Error("WHATSAPP_PHONE_NUMBER_ID o WHATSAPP_TOKEN sin configurar");
  }

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        // preview_url false: los enlaces van limpios, sin tarjeta de previsualización
        text: { preview_url: false, body },
      }),
    },
  );

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Graph API ${res.status}: ${detail}`);
  }
}

/** Estructura mínima del webhook que nos interesa. */
export interface IncomingMessage {
  wamId: string;
  from: string;
  text: string;
  type: string;
}

/**
 * Extrae los mensajes entrantes del payload. Ignora los eventos de estado
 * (sent/delivered/read), que llegan por el mismo webhook y no hay que contestar.
 */
export function extractMessages(payload: unknown): IncomingMessage[] {
  const out: IncomingMessage[] = [];
  const entries = (payload as { entry?: unknown[] })?.entry ?? [];

  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] })?.changes ?? [];
    for (const change of changes) {
      const value = (change as { value?: Record<string, unknown> })?.value;
      const messages = (value?.messages as unknown[]) ?? [];
      for (const m of messages) {
        const msg = m as Record<string, unknown>;
        out.push({
          wamId: String(msg.id ?? ""),
          from: String(msg.from ?? ""),
          type: String(msg.type ?? ""),
          text: String((msg.text as { body?: string })?.body ?? "").trim(),
        });
      }
    }
  }

  return out.filter((m) => m.wamId && m.from);
}
