import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { RutasWeb } from "@/eventos/menu";

/**
 * Bajo qué "casa" se sirve la app:
 *  - "camberas": camberas.com (y previas, localhost). La web de una carrera
 *    vive en /{slug}; el resto de la plataforma alrededor.
 *  - "propia": el dominio del organizador (desafio-sarrio.com). Solo existe la
 *    web de esa carrera, en la raíz; sin sesión de usuario; todo lo que exige
 *    cuenta enlaza en absoluto a camberas.com.
 *
 * El tenant se resuelve antes de montar React (src/tenant/resolverTenant.ts,
 * fase 4). Sin proveedor, el hook devuelve el modo "camberas": así la
 * plantilla funciona hoy en camberas.com/{slug} sin tocar main.tsx.
 */
export interface Tenant {
  raceId: string;
  slug: string;
  hostname: string;
  nombre: string;
  logo?: string | null;
  plantilla: string;
  tema: unknown;
}

export interface TenantContextValue {
  modo: "camberas" | "propia";
  tenant: Tenant | null;
  /** URL absoluta a camberas.com en modo propia; relativa en modo camberas */
  urlCamberas: (path: string) => string;
}

const SITIO_CAMBERAS = "https://camberas.com";

const porDefecto: TenantContextValue = {
  modo: "camberas",
  tenant: null,
  urlCamberas: (path) => path,
};

const TenantContext = createContext<TenantContextValue>(porDefecto);

export function TenantProvider({ tenant, children }: { tenant: Tenant | null; children: ReactNode }) {
  const value = useMemo<TenantContextValue>(() => {
    if (!tenant) return porDefecto;
    return {
      modo: "propia",
      tenant,
      urlCamberas: (path) => `${SITIO_CAMBERAS}${path.startsWith("/") ? path : `/${path}`}`,
    };
  }, [tenant]);
  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantContextValue {
  return useContext(TenantContext);
}

/**
 * Rutas de la web de una carrera según dónde se sirve. `enPortada` indica si
 * la página actual es la portada (las anclas van sin prefijo de ruta).
 */
export function rutasDeWeb(modo: "camberas" | "propia", slug: string, enPortada: boolean): RutasWeb {
  const base = modo === "propia" ? "" : `/${slug}`;
  return {
    base,
    a: (path) => `${base}${path}` || "/",
    ancla: (id) => (enPortada ? `#${id}` : `${base || "/"}#${id}`),
  };
}
