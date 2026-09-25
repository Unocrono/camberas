# Web propia de la carrera

`camberas.com/{slug}` deja de ser una ficha con el marco de Camberas y pasa a ser **la web de la carrera**: una plantilla de diseño propio (la de Gurriana), configurable por carrera con un libro de diseño, servida también bajo el dominio del club (`www.desafio-sarrio.com` → CNAME a Camberas) y con las inscripciones cobradas en el **TPV Redsys del organizador**. "Hacer la web" es configurar en el panel.

Plan y decisiones: `~/.claude/plans/algo-asi-hace-lovable-crystalline-jellyfish.md` (sept 2026). Esquema de datos de la plantilla: `docs/eventos/`.

## Qué hay que aplicar antes de que funcione (a mano)

1. **Migraciones**, en este orden, en el editor SQL de Supabase (sentencias sueltas; los cuerpos van con `$fn$`):
   - `supabase/migrations/20260924170000_evento_publico_y_web.sql` — `races.race_type` ampliado, `race_distances.kind/competitive/chip/...`, tablas `race_web` y `race_sponsors`.
   - `supabase/migrations/20260924180000_web_propia_dominios_y_tpv.sql` — `race_domains`, `race_tpv` (clave en Vault), `payment_intents.merchant_code/secret_ref`, RPCs `evento_publico`, `carrera_por_dominio`, `estado_inscripcion_publica`, `tpv_guardar`, `tpv_de_carrera`, `clave_tpv`, menú `web-propia`.
   - Ejecutar las **comprobaciones** del final de cada fichero.
2. **Regenerar `src/integrations/supabase/types.ts`** y, después, quitar los `rpcSinTipos` / `tablaSinTipos` de `src/eventos/rpc.ts` donde ya no hagan falta.
3. **Desplegar las edge functions**: `_shared/redsys.ts`, `redsys-init-payment`, `team-init-payment`, `redsys-webhook`, `verificar-dominio` (esta última con `verify_jwt = true`, ya en `supabase/config.toml`).
4. Secretos: no hay ninguno nuevo. `REDSYS_MERCHANT_CODE`, `REDSYS_TERMINAL`, `REDSYS_SECRET_KEY` siguen siendo el TPV de UNO, que es el respaldo cuando una carrera no tiene TPV propio. `SITE_URL` sigue siendo `https://camberas.com`.

## Cómo se da de alta una web (panel del organizador → «Web propia»)

| Pestaña | Qué hace |
|---|---|
| **Diseño** | Libro de diseño: color de marca, de acción y secundario (con aviso de contraste), fuente de titulares y de texto (lista cerrada de Google Fonts), radio, portada (foto / color / textura), cinta de meta, y qué secciones se muestran y en qué orden. Vista previa en vivo y «Abrir en pestaña» (`/{slug}?previa=1`). Se guarda en `race_web.tema`. |
| **Contenido** | Textos de cada sección (portada, presentación, recorridos, día de carrera, servicios, medio ambiente, beneficiario, contacto…), datos del organizador para lo legal (razón social, CIF, dirección) y el GA4 del organizador. Se guarda en `race_web.contenido` (validado con `src/eventos/contenidoSchema.ts`). |
| **Patrocinadores** | Logos por nivel (organiza, principal, institucional, beneficiario, colaborador), con orden. Tabla `race_sponsors`, logos en `race-images/{raceId}/patrocinadores/`. |
| **Dominio** | El dominio del club y las instrucciones DNS. Ver abajo. |
| **TPV** | Comercio Redsys del organizador. Ver abajo. |
| **Publicar** | Interruptor `race_web.activa`. Con él apagado, `camberas.com/{slug}` sigue enseñando la ficha clásica (`RaceDetail`); con él encendido, la plantilla. |

Todo lo que no se rellena se toma de la carrera (nombre, fecha, recorridos, precios, plazas, reglamento, FAQ, GPX, horarios de salida en `race_waves`) a través de la RPC `evento_publico(slug)`, que es la única fuente de datos de la plantilla.

## Dominio propio

En el panel se escribe el dominio sin `www` (`desafio-sarrio.com`). Camberas pide dos registros DNS al club:

```
www.desafio-sarrio.com.        CNAME  sitios.camberas.com.
_camberas.desafio-sarrio.com.  TXT    "camberas-verificacion=<race_id>"
```

El botón «Comprobar» llama a la edge function `verificar-dominio`, que consulta el DNS (DNS sobre HTTPS de Cloudflare) y marca `race_domains.verificado`. Solo los dominios verificados resuelven en público (`carrera_por_dominio`) y solo a ellos vuelve Redsys tras el pago.

El dominio raíz (`desafio-sarrio.com` sin `www`) se redirige a `www` desde el registrador del club (redirección web / ALIAS), o se añade también como dominio personalizado en Cloudflare Pages.

**Bajo el dominio propio no hay sesión de usuario**: la inscripción es como invitado y todo lo que necesita cuenta (retomar un pago, mi dorsal, equipos, panel) enlaza en absoluto a `camberas.com`. Tampoco se registra el service worker de Camberas ni se carga su Google Analytics.

## TPV del organizador

En la pestaña TPV se guardan: código de comercio (FUC, 6-15 dígitos), terminal (normalmente `1`), clave SHA-256 del comercio, entorno (`test` / `prod`), titular y el interruptor `activo`. La clave va al Vault de Supabase (`redsys_<race_id>`), nunca a una tabla ni al navegador (`tpv_guardar` → `race_tpv.secret_ref`).

Con TPV activo:

- `redsys-init-payment` y `team-init-payment` firman con ese comercio (`resolverTpv`) y guardan en `payment_intents` qué comercio firmó (`merchant_code`, `secret_ref`).
- `redsys-webhook` busca primero el intent por `Ds_Order` y verifica la firma con la clave de **ese** comercio (`claveDeIntent`). Cambiar de TPV con pagos en curso no rompe nada.
- El dinero entra en la cuenta bancaria del organizador. **Las devoluciones se hacen desde el módulo de administración de Redsys del organizador**; Camberas solo manda el email de anulación (no hay devolución automática).

Sin fila en `race_tpv` (o `activo = false`) se sigue cobrando en el TPV de UNO, como hasta ahora.

Requisitos que debe pedir el organizador a su banco: comercio Redsys con **firma HMAC SHA-256** y **notificación online** (Camberas manda la URL de notificación en cada operación, `DS_MERCHANT_MERCHANTURL`). Primero se prueba en `entorno = test` con las tarjetas de prueba de Redsys y después se pasa a `prod`.

La URL de vuelta la decide siempre el servidor (`resolverRetorno`): el dominio verificado de la carrera, o `camberas.com/{slug}`, y ahí `/inscripcion/ok?ref=<inscripción>` sondea `estado_inscripcion_publica` hasta que el webhook confirma el pago.

## Hosting

**Hoy**: `camberas.com` se sirve desde Lovable. La plantilla ya funciona ahí en `camberas.com/{slug}`; los dominios propios necesitan un hosting que admita muchos dominios personalizados sobre el mismo `dist`.

**Objetivo: Cloudflare Pages** (proyecto conectado al repo; 100 dominios personalizados gratis, después Cloudflare for SaaS):

1. Proyecto Pages: build `npm run build`, salida `dist`, variables `SUPABASE_URL` y `SUPABASE_ANON_KEY` (las mismas públicas del cliente).
2. Dominio personalizado `sitios.camberas.com` (destino de los CNAME de los clubes).
3. Cada dominio de club se añade como dominio personalizado del proyecto (Cloudflare emite el certificado).
4. `public/_redirects` deja la SPA en manos de React Router.
5. `functions/_middleware.ts` (Pages Functions) corre en cada navegación HTML:
   - resuelve el tenant por hostname (`carrera_por_dominio`) o por `/{slug}` en `camberas.com` (`evento_publico`), con caché de 5 minutos;
   - inyecta `window.__TENANT__` para que el cliente no repita la RPC al arrancar;
   - reescribe `<title>`, description, Open Graph, canonical y añade el JSON-LD `SportsEvent`, que es lo que leen WhatsApp, Twitter y Facebook (no ejecutan JS);
   - en `camberas.com/{slug}`, si la carrera tiene dominio verificado y la web activa, responde **301** al dominio propio conservando `?inscribir=` y `?cupon=` (canonical único);
   - sirve un `robots.txt` propio bajo el dominio del club.
6. Cuando `camberas.com` también se sirva desde Pages, Lovable queda solo como editor.

Primer dominio real previsto: Desafío Sarrio o Gurriana Trail.

## Cifras del bundle (24 sept 2026, `npm run build`)

Portada bajo dominio propio (estático, sin lo perezoso):

| Trozo | KB | gzip KB |
|---|---:|---:|
| `index` (arranque + resolverTenant) | 12 | 5 |
| `react` (react, react-dom, router, clsx…) | 182 | 60 |
| `supabase` | 170 | 44 |
| `query` (TanStack Query) | 31 | 9 |
| compartido (`PaginaLegal-*`: páginas web, inscripción, formulario, Redsys) | 268 | 80 |
| `PlantillaGurriana` | 26 | 6 |
| **Total** | **693** | **207** |

Mapbox (1,6 MB) y recharts (0,4 MB) solo se descargan en `/recorrido/:id`, `/gps` y `/live`. Antes del cambio de `manualChunks` (forma de función en `vite.config.ts`) cualquier página, también las de Camberas, arrastraba mapbox y recharts porque rollup metía los ayudantes commonjs y React en esos trozos. El comprobador está en el scratchpad de la sesión (`grafo.py`); reproducirlo es recorrer los `from"./x.js"` desde `index-*.js` y `AppWebPropia-*.js`.

## Pruebas en local

- `npm run dev` (8080).
- `/{slug}?fixture={slug}` pinta la plantilla con `docs/eventos/eventos/{slug}.json` sin tocar Supabase (solo en DEV).
- `/{slug}?previa=1` fuerza la plantilla aunque `activa = false` (necesita la RPC `evento_publico`).
- `/?host=desafio-sarrio.com` simula el dominio propio (se guarda en `sessionStorage`; necesita `carrera_por_dominio` y acepta dominios sin verificar).
- Pagos: siempre `entorno = test` hasta el primer dominio real.
