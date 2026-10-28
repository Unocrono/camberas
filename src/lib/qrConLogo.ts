/**
 * QR con el logo de Camberas en el centro (como los impresos).
 * Corrección de errores H para que el logo no rompa la lectura.
 *
 * NORMA DE LA CASA (28-oct-2026): todos los QR llevan el logo. En la web se
 * generan solo con esta función (ESLint no deja importar `qrcode` en otro
 * sitio); en los correos lo hace la edge function qr-dorsal, que compone el
 * mismo logo dentro del PNG con las mismas proporciones.
 */
import QRCode from "qrcode";

export async function qrConLogo(texto: string, size = 360): Promise<string> {
  const base = await QRCode.toDataURL(texto, {
    width: size, margin: 1, errorCorrectionLevel: "H",
  });
  try {
    const canvas = document.createElement("canvas");
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return base;
    const qr = new Image();
    await new Promise<void>((res, rej) => { qr.onload = () => res(); qr.onerror = rej; qr.src = base; });
    ctx.drawImage(qr, 0, 0, size, size);
    const logo = new Image();
    await new Promise<void>((res, rej) => { logo.onload = () => res(); logo.onerror = rej; logo.src = "/logo-track.png"; });
    const lado = size * 0.22;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, lado / 2 + 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.drawImage(logo, (size - lado) / 2, (size - lado) / 2, lado, lado);
    return canvas.toDataURL("image/png");
  } catch {
    return base; // sin logo antes que sin QR
  }
}
