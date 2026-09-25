/**
 * Google Analytics 4 bajo control:
 *  - En camberas.com se carga el de Camberas (G-1CYM3BCY09), como siempre.
 *  - Bajo el dominio propio de una carrera NO se carga el de Camberas. Solo
 *    el del organizador (race_web.contenido.analytics.ga4), y solo cuando el
 *    visitante lo acepta en el aviso de cookies (AvisoCookies.tsx).
 * Antes el gtag iba pegado en index.html y se disparaba en todos los orígenes.
 */
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export const GA4_CAMBERAS = "G-1CYM3BCY09";
const CLAVE_CONSENTIMIENTO = "camberas:cookies";

let cargado: string | null = null;

export function iniciarAnalytics(idMedicion: string): void {
  if (typeof window === "undefined" || !/^G-[A-Z0-9]+$/.test(idMedicion) || cargado === idMedicion) return;
  cargado = idMedicion;
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${idMedicion}`;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer!.push(args);
  };
  window.gtag("js", new Date());
  window.gtag("config", idMedicion);
}

export type Consentimiento = "aceptado" | "rechazado" | null;

export function consentimientoGuardado(): Consentimiento {
  try {
    const v = localStorage.getItem(CLAVE_CONSENTIMIENTO);
    return v === "aceptado" || v === "rechazado" ? v : null;
  } catch {
    return null;
  }
}

export function guardarConsentimiento(v: Exclude<Consentimiento, null>): void {
  try {
    localStorage.setItem(CLAVE_CONSENTIMIENTO, v);
  } catch {
    /* sin almacenamiento */
  }
}
