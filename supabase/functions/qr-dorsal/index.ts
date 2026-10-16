// El QR de la recogida de dorsales, como imagen PNG, para meterlo dentro de
// los correos (bloque [[qr_dorsal]] de reenviar-comprobantes): los correos
// no ejecutan JavaScript, así que no pueden dibujarlo como la página
// /mi-dorsal/<token>.
//
//   GET /functions/v1/qr-dorsal?t=<token_inscripcion>  →  image/png
//
// El QR lleva la MISMA URL que el de la página (SITE_URL/mi-dorsal/<token>):
// el escáner de la mesa de recogida (RecogidaDorsales.tsx) saca de ahí el
// token, y quien lo escanee con la cámara del móvil llega a su dorsal.
//
// Pública a propósito (verify_jwt = false): la pide el cliente de correo, que
// no manda credenciales. No toca la base de datos ni revela nada: solo
// dibuja la URL del token que ya trae quien la pide, y solo esa forma de URL
// (no sirve como generador de QR para cualquier texto).

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import qrcode from "https://esm.sh/qrcode@1.5.4/lib/core/qrcode.js";
import { pngDeQr, type MatrizQr } from "./png.ts";

// El núcleo de qrcode (sin canvas ni fs): create() da la matriz de módulos
const crearQr = (qrcode as unknown as {
  create: (texto: string, opciones: { errorCorrectionLevel: string }) => { modules: MatrizQr };
}).create;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req: Request): Promise<Response> => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Método no permitido", { status: 405 });
  }
  const token = (new URL(req.url).searchParams.get("t") ?? "").trim().toLowerCase();
  if (!UUID.test(token)) return new Response("Falta el código de la inscripción", { status: 400 });

  try {
    const sitio = (Deno.env.get("SITE_URL") ?? "https://camberas.com").replace(/\/+$/, "");
    // Corrección M: lee bien en una pantalla con brillo bajo o algo rayada
    const { modules } = crearQr(`${sitio}/mi-dorsal/${token}`, { errorCorrectionLevel: "M" });
    const png = await pngDeQr(modules);
    // El buffer entero es el PNG (se crea a su medida): como ArrayBuffer vale
    // de cuerpo con cualquier versión de los tipos de TypeScript de Deno
    return new Response(req.method === "HEAD" ? null : (png.buffer as ArrayBuffer), {
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(png.length),
        // El mismo token da siempre la misma imagen: que la guarden los
        // proxies de imágenes de los correos (Gmail) y el propio móvil
        "Cache-Control": "public, max-age=31536000, immutable",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    console.error("qr-dorsal:", e);
    return new Response("No se pudo generar el QR", { status: 500 });
  }
});
