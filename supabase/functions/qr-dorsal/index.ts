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
// Y lleva el logo de Camberas en el centro, como todos los QR de la casa
// (norma del 28-oct-2026; en la web lo hace qrConLogo). Si por lo que sea el
// logo falla, sale el QR pelado: sin logo antes que sin QR.
//
// Pública a propósito (verify_jwt = false): la pide el cliente de correo, que
// no manda credenciales. No toca la base de datos ni revela nada: solo
// dibuja la URL del token que ya trae quien la pide, y solo esa forma de URL
// (no sirve como generador de QR para cualquier texto).

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import qrcode from "https://esm.sh/qrcode@1.5.4/lib/core/qrcode.js";
import { pngDeQr, pngDeQrConLogo, type MatrizQr } from "./png.ts";
import { logoCamberas } from "./logo.ts";

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
    // Corrección H, como qrConLogo en la web: el logo tapa módulos y el QR
    // tiene que seguir leyéndose en una pantalla con brillo bajo o algo rayada
    const { modules } = crearQr(`${sitio}/mi-dorsal/${token}`, { errorCorrectionLevel: "H" });
    // Margen de 1 módulo, como qrConLogo en la web: la tarjeta blanca del
    // correo ya pone la zona de silencio, y así el QR llena los 260 px de la
    // imagen (con H el QR tiene 49 módulos; cada píxel cuenta en la mesa)
    let png: Uint8Array;
    let conLogo = true;
    try {
      png = await pngDeQrConLogo(modules, await logoCamberas(), 8, 1);
    } catch (e) {
      console.error("qr-dorsal: sin logo —", e);
      conLogo = false;
      png = await pngDeQr(modules, 8, 1);
    }
    // El buffer entero es el PNG (se crea a su medida): como ArrayBuffer vale
    // de cuerpo con cualquier versión de los tipos de TypeScript de Deno
    return new Response(req.method === "HEAD" ? null : (png.buffer as ArrayBuffer), {
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(png.length),
        // El mismo token da siempre la misma imagen: que la guarden los
        // proxies de imágenes de los correos (Gmail) y el propio móvil. Si
        // cambia el dibujo (como al meter el logo), cambia la URL (&v=) en
        // quien monta el correo, no esta cabecera. El QR pelado del fallback
        // NO se guarda: si el logo fallara, que no quede un año cacheado
        "Cache-Control": conLogo ? "public, max-age=31536000, immutable" : "no-store",
        // Para comprobarlo desde fuera (curl -I): 1 = con logo
        "X-Camberas-Logo": conLogo ? "1" : "0",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    console.error("qr-dorsal:", e);
    return new Response("No se pudo generar el QR", { status: 500 });
  }
});
