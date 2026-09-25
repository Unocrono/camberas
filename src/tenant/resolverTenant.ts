import { rpcSinTipos } from "@/eventos/rpc";
import type { CarreraPorDominio } from "@/eventos/tipos";
import type { Tenant } from "./TenantContext";

/**
 * Decide, ANTES de montar React, bajo qué casa se sirve la app:
 *  - null: es Camberas (camberas.com, previas de Lovable, localhost). Se monta
 *    la app de siempre.
 *  - Tenant: un dominio propio de carrera (desafio-sarrio.com). Se monta la
 *    web de esa carrera y nada más.
 *  - "desconocido": un dominio que llega aquí pero no está dado de alta (o no
 *    verificado). Se enseña una página de aviso, no la app de Camberas (para
 *    no servir contenido duplicado bajo un dominio ajeno).
 *
 * En desarrollo, ?host=desafio-sarrio.com simula ese dominio (se recuerda en
 * sessionStorage para sobrevivir a la navegación) y admite dominios sin
 * verificar, para probar antes de tocar el DNS.
 *
 * Si el middleware del hosting ya inyectó window.__TENANT__ (fase 6), se usa
 * sin llamar a la base de datos.
 */
declare global {
  interface Window {
    __TENANT__?: CarreraPorDominio | null;
  }
}

const CLAVE_HOST_SIMULADO = "camberas:host-simulado";
const CACHE_TTL_MS = 10 * 60 * 1000;

export function esHostCamberas(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === "camberas.com" ||
    h === "www.camberas.com" ||
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "[::1]" ||
    h.endsWith(".camberas.com") ||
    h.endsWith(".lovable.app") ||
    h.endsWith(".lovableproject.com") ||
    h.endsWith(".pages.dev") ||
    h.endsWith(".vercel.app") ||
    h.endsWith(".workers.dev")
  );
}

function aTenant(c: CarreraPorDominio): Tenant {
  return {
    raceId: c.race_id,
    slug: c.slug,
    hostname: c.hostname,
    nombre: c.nombre,
    logo: c.logo ?? null,
    plantilla: c.plantilla ?? "gurriana",
    tema: c.tema ?? {},
  };
}

function hostSimulado(): string | null {
  if (!import.meta.env.DEV) return null;
  try {
    const url = new URL(window.location.href);
    const h = url.searchParams.get("host");
    if (h === "") {
      sessionStorage.removeItem(CLAVE_HOST_SIMULADO);
      return null;
    }
    if (h) {
      sessionStorage.setItem(CLAVE_HOST_SIMULADO, h);
      return h;
    }
    return sessionStorage.getItem(CLAVE_HOST_SIMULADO);
  } catch {
    return null;
  }
}

export async function resolverTenant(): Promise<Tenant | null | "desconocido"> {
  if (typeof window === "undefined") return null;

  if (window.__TENANT__ !== undefined) {
    return window.__TENANT__ ? aTenant(window.__TENANT__) : null;
  }

  const simulado = hostSimulado();
  const hostname = simulado ?? window.location.hostname;
  if (!simulado && esHostCamberas(hostname)) return null;

  const claveCache = `camberas:tenant:${hostname}`;
  let cacheado: { t: number; v: CarreraPorDominio | null } | null = null;
  try {
    const raw = localStorage.getItem(claveCache);
    if (raw) cacheado = JSON.parse(raw);
  } catch {
    /* sin almacenamiento */
  }

  const pedir = async (): Promise<CarreraPorDominio | null> => {
    const v = await rpcSinTipos<CarreraPorDominio | null>("carrera_por_dominio", { p_hostname: hostname, p_solo_verificados: !simulado });
    try {
      localStorage.setItem(claveCache, JSON.stringify({ t: Date.now(), v }));
    } catch {
      /* sin almacenamiento */
    }
    return v;
  };

  try {
    if (cacheado && Date.now() - cacheado.t < CACHE_TTL_MS) {
      // stale-while-revalidate: se usa la copia y se refresca por detrás
      pedir().catch(() => undefined);
      return cacheado.v ? aTenant(cacheado.v) : "desconocido";
    }
    const v = await pedir();
    return v ? aTenant(v) : "desconocido";
  } catch (e) {
    console.error("[tenant] No se pudo resolver el dominio:", e);
    if (cacheado?.v) return aTenant(cacheado.v);
    return "desconocido";
  }
}
