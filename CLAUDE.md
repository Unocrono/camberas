# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Camberas es una plataforma de gestión de carreras de montaña (MTB y trail): inscripciones,
cronometraje, seguimiento GPS en vivo, resultados y grafismo para retransmisión.

**El proyecto está en español**: interfaz, comentarios, mensajes de commit, migraciones y
documentación. Escribe en español salvo que el fichero que tocas esté en inglés.

## Comandos

```sh
npm run dev        # servidor de desarrollo (Vite) en el puerto 8080
npm run build      # build de producción → dist/
npm run build:dev  # build en modo desarrollo, sin minificar (para depurar el bundle)
npm run lint       # ESLint sobre todo el repo
npm run preview    # sirve el dist/ ya construido
```

**No hay tests.** No existe vitest, jest ni playwright en el repo: no inventes comandos de test
ni añadas suites sin pedirlo. La verificación es `npm run lint` + `npm run build` + probar la ruta
afectada en `npm run dev`.

El repo tiene `bun.lock` y `package-lock.json`. Usa npm salvo que el entorno ya tenga bun.

## Base de datos: Supabase alojado

No hay Supabase local. El proyecto (`rsahtxjpisnldxnsmupk`) está en la nube y las migraciones de
`supabase/migrations/` (más de 220) **se aplican a mano desde el panel de Supabase**. Escribir el
`.sql` no lo despliega: si una migración queda pendiente, dilo explícitamente al terminar.

- `src/integrations/supabase/types.ts` es **generado** — no editarlo a mano. Cuando una migración
  añade RPCs, quedan casteadas en el cliente hasta que se regenera.
- `supabase/functions/` — ~30 Edge Functions (pagos Redsys, emails, webhooks GPS, push, WhatsApp).
  Cada una necesita su entrada en `supabase/config.toml` con `verify_jwt` (false para lo que
  llaman invitados o webhooks externos, true para lo administrativo).
- Nombres de migración: `AAAAMMDDHHMMSS_descripcion_en_espanol.sql`.

### Convenciones de SQL que no se negocian

- **Toda RPC nueva lleva `GRANT EXECUTE ... TO authenticated`** (y `anon` si la usan invitados).
  `REVOKE ... FROM PUBLIC` rompe a `authenticated` sin GRANT explícito — ya pasó.
- Las RPCs son `SECURITY DEFINER SET search_path = public` y validan el token dentro: superficie
  más estrecha que abrir tablas a `anon`.
- **PostgREST corta en 1.000 filas.** Cualquier RPC que devuelva series largas (tracks GPS,
  lecturas) debe muestrear o paginar dentro de la función, no confiar en el límite del cliente
  (ver `20260809100000_replay_ruta_completa.sql`).
- Upserts de datos que llegan por reintento offline: `onConflict: 'token_id,timestamp',
  ignoreDuplicates: true`.
- **Antes de tocar una tabla, busca todos sus lectores.** Hay pipelines paralelos legítimos que
  parecen duplicados y no lo son (ver GPS más abajo).

## Arquitectura

### Una SPA que sirve varias PWAs instalables

Un solo bundle de Vite + React Router, pero según la ruta se instala como una app distinta con su
icono y su pantalla de inicio:

| Ruta | App | Manifest |
|---|---|---|
| `/timing` | Camberas Timing (puesto de cronometraje) | `manifest-timing.json` |
| `/org` | Camberas Org (panel del organizador en móvil) | `manifest-organizer.json` |
| resto | web pública | sin manifest |

El reparto lo hace `public/manifest-selector.js` (inyecta el `<link rel=manifest>` según
`location.pathname`) y `vite.config.ts` lo refleja en `workbox.navigateFallbackAllowlist`.
**Si añades una PWA nueva hay que tocar los dos sitios**, más los iconos en `includeAssets`.
`public/push-sw.js` se inyecta en el service worker con `importScripts`.

### Rutas (`src/App.tsx`)

Todas las rutas están declaradas en un único fichero, sin lazy loading. El orden importa:
las rutas concretas van primero y el comodín de slug de carrera (`/:slug`, `/:slug/live`,
`/:slug/gps`) **debe quedar al final**, justo antes del catch-all de 404. Añadir una ruta
estática después del slug la deja inalcanzable.

Ojo: `/race/:id/live` y `/:slug/live` están declaradas dos veces cada una (a `LiveResults` y a
`CamberasTrackLive`); gana la primera, así que `CamberasTrackLive` no se alcanza por ahí.

### Roles y acceso

`src/hooks/useAuth.tsx` resuelve sesión y roles con la RPC `has_role`: **admin**, **organizer**,
**capo** (jefe de grupetta). Expone `rolesLoaded` — no decidas redirecciones antes de que sea
`true` o expulsarás a usuarios legítimos. El rol **timer** está retirado: el cronometraje ya no
entra por login (ver tokens).

### El patrón TOKEN: la identidad es el puesto, no la persona

Es la decisión de diseño central del producto. En vez de crear usuarios y asignarlos, el panel
genera un **token por puesto** (dorsal, dispositivo GPS de organización, punto de cronometraje),
se reparte como QR, y el dispositivo que lo escanea *es* ese puesto. Sin altas ni contraseñas.

- Lectura del token: **`src/lib/camberasToken.ts`**, copia idéntica en los repos `camberas`,
  `camberas-track` y `camberas-motos`. Si tocas uno, toca los tres. No vuelvas a escribir un
  regex de UUID suelto — antes había cuatro copias que aceptaban cosas distintas.
- Los QR llevan **URL, no el UUID pelado** (`/activar.html?t=`, `/timing?t=`), para que quien
  escanee con la cámara del sistema llegue a una página que le explica qué hacer.
- Vincular/desvincular: RPCs `link_gps_token` (devuelve `needs_transfer` si el token ya estaba en
  otro móvil) y `unlink_gps_token`.
- **Regenerar un QR revoca el anterior** y deja huérfano al dispositivo que lo tuviera. Los
  paneles deben casar por token **y** por identificador (dorsal/nombre) para sobrevivir a eso;
  `MotoMapViewer` es la referencia.

Detalle completo en `docs/tokens-camberas.md` y `docs/traspaso-tokens-cronometrador.md`.

### GPS: qué tabla es la buena

| Tabla | Estado |
|---|---|
| `gps_positions` | **La fuente.** Aquí escriben las apps de móvil (corredores y organización) |
| `moto_positions` | **Muerta para escritura.** Pendiente de retirar; quien la lea se queda sin datos |
| `moto_gps_tracking` | Viva, pero solo para **rastreadores de hardware** vía `gps-webhook` → `process-moto-gps` |
| `gps_tracking` | Tracker web |

Los dispositivos de organización (moto cámara, ambulancia, escoba) conservan la nomenclatura
`moto` en BD (`race_motos`, `generar_token_moto`) aunque en la interfaz se llamen "GPS
Organización" — **no renombrar en BD**. Se leen con `get_live_gps_positions(p_race_id)` filtrando
`source = 'moto'`, y se seleccionan por dorsal `M1`, `M2`…

Las escrituras GPS solo se aceptan dentro de la **ventana de captura** (de la salida −24 h al
cierre +2 h), que la manda `races.date` + la hora de la oleada. Los dispositivos de organización
están exentos. Contexto en `docs/gps-organizacion.md`.

### Dónde vive cada cosa en `src/`

- `pages/` — una página por ruta. Las gordas: `TimingApp.tsx` (app de cronometraje por token),
  `LiveResults.tsx`, `RaceDetail.tsx`, `OverlayManager.tsx`.
- `components/admin/` — 56 componentes del panel de administración, uno por pantalla de gestión
  (`RegistrationManagement`, `CheckpointsManagement`, `ResultsManagement`…). Son ficheros muy
  largos (1.000–2.500 líneas); ubica la sección antes de leerlos enteros.
- `components/org/` — panel del organizador en móvil (`/org`), distinto de
  `components/organizer/` que es el dashboard de escritorio (`/organizer`).
- `overlays/` — motor de grafismo para retransmisión (core, templates, componentes), separado de
  `pages/overlays/` que son las rutas que se cargan en OBS.
- `components/ui/` — shadcn/ui, generado. No editar salvo motivo concreto.
- `lib/` — utilidades de dominio: tokens, categorías, tarifas, GPX, husos horarios, PWA, push.

Alias `@` → `src/`. Estado de servidor con TanStack Query; formularios con react-hook-form + zod;
mapas con Mapbox (token vía Edge Function `get-mapbox-token`, no hardcodeado); Tailwind + shadcn.

## Documentación del repo

Consúltala antes de rehacer análisis:

- **`GUIA_CRONOMETRAJE.md`** (2.800 líneas) — glosario del dominio, esquema de tablas de
  cronometraje, categorías, integraciones RFID y SQL Server, flujos de carrera. Es la referencia
  de terminología: úsala para nombrar cosas igual que el resto del código.
- **`GUIA_ERRORES.md`** — errores conocidos con causa y solución (RLS, claves duplicadas, GPS,
  auth). Mira aquí antes de diagnosticar desde cero, y documenta los nuevos con su plantilla.
- **`GUIA_IMAGENES.md`** — tamaños y pesos exigidos para cada imagen de carrera.
- **`docs/paleta-camberas.md`** — paleta oficial. Verde Camberas `#235940`, naranja de acción
  `#EC7C2B`, crema `#FAF6EC`. **Ampliar ahí, no inventar colores sueltos**; una sola llamada a la
  acción por pantalla.
- `docs/voluntarios-diseno.md`, `docs/gps-organizacion.md`, `docs/tokens-camberas.md`,
  `docs/traspaso-tokens-cronometrador.md`.

## Repos hermanos

Este repo es la web y el panel. El ecosistema se reparte en:

- **camberas-track** — app de seguimiento del corredor.
- **camberas-motos** — app "GPS Organización" (Expo).
- **camberas-overlays** — grafismo de retransmisión.

`camberasToken.ts` está duplicado a propósito en los tres primeros. Cambios en el formato de token
o en las tablas GPS afectan a todos: comprueba los lectores antes de tocar.

## Lovable

El repo está sincronizado con Lovable (`lovable-tagger` se activa solo en modo desarrollo y el
README es su plantilla). Los cambios hechos allí se commitean solos, así que **haz `git pull`
antes de empezar**: la rama puede haber avanzado sin ti.
