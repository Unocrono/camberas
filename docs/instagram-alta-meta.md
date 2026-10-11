# Instagram — alta en Meta y puesta en marcha

Guía de la parte que **tienes que hacer tú** en Meta (yo no puedo crear cuentas
ni introducir credenciales) y de cómo se enchufa a lo ya escrito.

**Una sola app de Meta para WhatsApp e Instagram.** La del asistente de
WhatsApp aún no existe: créala con esta guía y después añádele WhatsApp
siguiendo [`whatsapp-alta-waba.md`](whatsapp-alta-waba.md) desde el paso 2 de su §2.

Código: [`supabase/functions/_shared/instagram.ts`](../supabase/functions/_shared/instagram.ts)
(cliente de la Graph API) y las funciones de cada fase.

---

## 0. Qué hay y qué pide cada cosa

Camberas entra por el camino **«Facebook Login»**: su cuenta de Instagram es
profesional y está vinculada a la página de Facebook. Eso permite un token que
**no caduca** (el de un usuario del sistema, como el de WhatsApp) y leer otras
cuentas (Business Discovery), que el camino «Instagram Login» no da.

| Fase | Qué hace | Qué pide en Meta |
|---|---|---|
| 1. Publicar | Carteles de grupetta y resultados en la cuenta de Camberas, desde el panel | App + usuario del sistema. **Sin revisión de Meta.** |
| 2. Web propia | Las últimas publicaciones del club en la web de su carrera | Lo mismo |
| 3. Historias en directo | El cronometraje publica solo «primero en meta» y podios | Lo mismo |
| 4. Mensajes directos | El asistente de WhatsApp, por Instagram | Acceso avanzado a `instagram_manage_messages`: verificación del negocio y revisión de la app |

Las fases 1 a 3 solo tocan cuentas de Camberas, así que basta el **acceso
estándar**: Meta no revisa nada. Publicar en la cuenta de cada organizador o
capo sería otra historia (acceso avanzado, semanas): por eso el cartel de
resultados también se puede **descargar**, para que el organizador lo suba a
la suya a mano.

## 1. Requisitos previos

| Cosa | Detalle |
|---|---|
| Cartera comercial de Meta | La de Camberas en [business.facebook.com](https://business.facebook.com), dueña de la página y de la cuenta de Instagram. |
| Página de Facebook | La de Camberas, dentro de esa cartera. |
| Cuenta de Instagram | Profesional de tipo **Empresa** (las historias por API no van en cuentas de Creador), vinculada a la página y añadida a la cartera: Configuración del negocio → Cuentas → Cuentas de Instagram. |
| Verificación del negocio | No hace falta para las fases 1 a 3. Sí para WhatsApp en producción y para la fase 4: si vas a hacerla, empieza ya, que tarda de días a 2 semanas. |

## 2. Crear la app (una para todo)

1. [developers.facebook.com](https://developers.facebook.com) → **Mis apps** → **Crear app** → tipo **Empresa**, vinculada a la cartera de Camberas.
2. Casos de uso: el de **Instagram** (contenido y mensajes) y, para el bot, el de **WhatsApp**.
   Si pregunta por qué camino configurar la API de Instagram, elige **Facebook Login** (no «Instagram Login»).
3. **Configuración → Básica**: URL de la política de privacidad, icono y categoría. Sin la política no se puede pasar la app a modo Activo (Live).
4. Anota el **App Secret** (Configuración → Básica → Mostrar). Es el mismo para WhatsApp e Instagram; lo usarán los webhooks (el de WhatsApp y el de la fase 4).

> Meta cambia los nombres de los menús a menudo. Si algo no se llama así, lo que
> manda son los **permisos del §3**: con ellos el token sirve, se llegue por
> donde se llegue.

## 3. Usuario del sistema y token que no caduca

1. Cartera → Configuración del negocio → **Usuarios → Usuarios del sistema** → Añadir: «Camberas robot», rol **Administrador**.
2. **Asignar activos** con control total: la **app**, la **página de Facebook** y la **cuenta de Instagram** (y la WABA cuando exista).
3. **Generar nuevo token** → app = la de Camberas → caducidad: **nunca** → permisos:

   | Permiso | Para qué |
   |---|---|
   | `instagram_basic` | Leer la cuenta (todas las fases) |
   | `instagram_content_publish` | Publicar (fases 1 y 3) |
   | `pages_show_list`, `pages_read_engagement` | Llegar de la página a la cuenta de Instagram; Business Discovery (fase 2) |
   | `business_management` | Activos de la cartera |
   | `instagram_manage_messages`, `pages_messaging`, `pages_manage_metadata` | Solo fase 4 (leer y contestar mensajes, suscribir la página al webhook) |
   | `whatsapp_business_messaging`, `whatsapp_business_management` | Si los marcas, el mismo token vale también como `WHATSAPP_TOKEN` |

4. Copia el token: **se enseña una sola vez**.

> Si al publicar sale un error de permisos (`#10` o `#200`) con todo lo de arriba
> marcado, genera el token otra vez añadiendo `ads_read`: Meta lo exige cuando el
> acceso a la página llega por la cartera, como es el caso del usuario del sistema.

## 4. Sacar el id de la cuenta de Instagram

No es el @: es un número largo. Con el token del §3:

```sh
curl -s "https://graph.facebook.com/v26.0/me/accounts?fields=id,name,instagram_business_account{id,username}" \
  -H "Authorization: Bearer EL_TOKEN"
```

Sale la página y, dentro, `instagram_business_account.id` → ese es
`INSTAGRAM_USER_ID`. Si `data` viene vacío, la página no está asignada al
usuario del sistema (§3.2); si viene la página sin `instagram_business_account`,
la cuenta de Instagram no está vinculada a ella.

## 5. Secrets, migración y funciones

1. **Secrets en Lovable Cloud** (y solo ahí: no van en las copias de seguridad):
   - `INSTAGRAM_TOKEN` — el token del §3
   - `INSTAGRAM_USER_ID` — el id del §4
2. **Migración** (panel de Supabase → SQL): `20261011120000_instagram_publicaciones.sql`.
3. **Desplegar** la edge function `instagram-publicar` (`verify_jwt = true`, ya en
   `supabase/config.toml`). Un push a GitHub no despliega las funciones: hay que
   pedirlas expresamente.

## 6. Comprobar

Panel de administración → **Instagram** → **Comprobar conexión**. Tiene que salir
@ de Camberas con sus seguidores y el cupo de publicaciones del día. Si no:

| Sale | Es |
|---|---|
| «El token de Instagram no vale» | Token mal copiado, revocado o generado sin caducidad «nunca» |
| «Al token le falta un permiso» | Falta alguno del §3 (o `ads_read`, ver la nota) |
| `Unsupported get request` / `[100]` | `INSTAGRAM_USER_ID` equivocado: pusiste el de la página o el @ |
| «sin configurar» | Faltan los secrets, o la función se desplegó antes de ponerlos |

## 7. Fase 1 — publicar

Solo los **admins** publican, y siempre en la cuenta de Camberas. Cada
publicación queda en el historial del panel (con el error, si falla).

- **Cartel de grupetta**: Panel › Instagram › Carteles de grupetta (las de
  todos los capos). **Publicar en Instagram** sube perfil y mapa como carrusel,
  con un pie que se puede corregir antes. El capo sigue teniendo su cartel en
  /grupetta/capo, solo para descargar.
- **Resultados**: Resultados › **Cartel para redes**. Una pieza por recorrido
  competitivo con el podio de cada sexo, en carrusel. Lo descarga cualquiera
  que gestione la carrera (también el organizador, para subirlo a su cuenta);
  publicar, solo el admin. Sale de `race_results` con estado FIN: primero hay
  que procesar los tiempos. Una carrera cronometrada con RaceTec no tiene ahí
  sus resultados.

Límites de Meta que conviene saber:

- Solo **JPEG**, entre 4:5 y 1,91:1. Los carteles salen en 1080×1350 (4:5).
- Carrusel de **10** piezas como mucho; Instagram recorta todas al formato de la primera.
- Pie de hasta **2.200** caracteres y 30 hashtags. Los enlaces del pie no se pueden pulsar.
- Entre 50 y 100 publicaciones por API cada 24 h, según la cuenta (el panel enseña el cupo).
- Sin filtros, sin música, sin etiquetas de producto.

## 8. Fase 2 — el Instagram del club en su web propia

En la web propia sale una sección **«Instagram del club»** con las 6 últimas
publicaciones de la cuenta que el organizador pone en Web propia › Contenido ›
Instagram (URL). El club no tiene que autorizar nada: se lee desde la cuenta de
Camberas con Business Discovery.

- **La cuenta del club tiene que ser profesional** (Empresa o Creador). De una
  personal Meta no da nada, y la sección simplemente no sale.
- La sección está en el libro de diseño (se puede mover o apagar). En las webs
  ya creadas aparece al final, antes del pie; si no hay publicaciones, no se pinta.
- Caché de **1 hora** por cuenta (`instagram_feed_cache`), también de los
  errores. Panel › Instagram › **Webs propias** enseña cada cuenta leída y, si
  no se ve, el motivo que dio Meta.
- La función `instagram-feed` es pública (`verify_jwt = false`) pero solo
  acepta el slug de una carrera, nunca un @ suelto: nadie puede gastar el cupo
  de llamadas de Camberas leyendo cuentas ajenas.

Puesta en marcha: aplicar `20261011130000_instagram_feed_web_propia.sql` y
desplegar `instagram-feed`. Usa los mismos secrets que la fase 1.

## 9. Fase 3 — historias en directo

El día de la carrera, el cronometraje publica **solo** en las historias de
Camberas dos momentos por recorrido y sexo: **«primero en meta»** y **«podio
provisional»** (cuando hay tres en meta). Se dibujan en el servidor
(1080×1920, con la paleta y la mosca de la casa).

Se maneja en Panel › Instagram › **Historias en directo**:

1. Elige la carrera y marca qué momentos quieres y cuántos minutos espera
   cada uno **sin cambios** (3 por defecto). Si en ese rato corriges una
   lectura o retiras a alguien, la historia sale con el dato bueno, o no sale.
2. Si un recorrido se cronometra con **RaceTec**, pon su EID: sus podios
   salen de `racetec_results`. Sin EID salen de las **lecturas de meta de
   Camberas** (el punto de cronometraje del control FINISH, menos la salida
   oficial de la ola), no de `race_results`, que solo se rehace al pulsar
   «Procesar».
3. **Vista previa** dibuja la historia sin publicar nada (con datos de
   ejemplo si aún no hay llegadas) y enseña los momentos que se ven ahora.
4. Enciende el **directo** y guarda (pide confirmación). Desde ese momento
   el robot lo repasa **cada minuto**. Cada momento detectado aparece en la
   lista, con **Descartar** (no se publicará) y **Reintentar** (tras un error).

Reglas que conviene saber:

- Solo se publica **el día de la carrera y el siguiente** (para las que acaban
  pasada la medianoche): un directo olvidado encendido no publica nada días
  después. Aun así, **apágalo al terminar**.
- Como mucho 4 historias por minuto; el resto, al minuto siguiente.
- Las historias por API **solo van en cuentas de Empresa**, y sin stickers
  (ni enlace ni encuesta): el enlace a los resultados va escrito en la imagen.
- La foto de fondo es la portada de la carrera si es JPEG o PNG; si es WebP,
  sale el degradado de la casa.
- Las fuentes (Archivo Black y Barlow Semi Condensed) se descargan del
  repositorio oficial de Google Fonts en GitHub, y la mosca de camberas.com.

Puesta en marcha: aplicar `20261011140000_instagram_directo.sql` (crea la clave
del robot en el Vault y el trabajo de pg_cron, que solo llama a la función si
hay algún directo encendido) y desplegar `instagram-directo`.

## 10. Fase 4 — mensajes directos

El **asistente de carrera de WhatsApp** contesta también por Instagram (dorsal,
clasificación, mapa, info), con las mismas consultas (`_shared/asistente/`) y la
misma carrera en directo (`wa_bot_config`). Dos diferencias a propósito, porque
el buzón de Instagram de Camberas lo atienden personas:

- Solo contesta con **«Contestar también por Instagram»** encendido (Panel ›
  Instagram › Mensajes directos) **y** una carrera en directo (`enabled` y
  `active_eid`, como para WhatsApp: [`whatsapp-alta-waba.md`](whatsapp-alta-waba.md) §7).
  Fuera de eso no contesta ni guarda nada.
- **Nunca contesta a lo que no entiende**, ni a fotos o audios: se queda en el
  buzón para una persona.

Además: Instagram no pinta `*negritas*` ni `_cursivas_` (se quitan), corta en
1.000 bytes, y el aviso de privacidad habla de «tu usuario», no de «tu número».
Los mensajes se guardan 30 días en `ig_mensajes` y se purgan solos cada noche
(junto con los de WhatsApp, cuya purga no estaba programada).

### Lo que hay que hacer en Meta

1. **Token**: genera otra vez el del usuario del sistema (§3) añadiendo
   `instagram_manage_messages`, `pages_messaging` y `pages_manage_metadata`, y
   cambia `INSTAGRAM_TOKEN`.
2. **En la app de Instagram**, con la cuenta de Camberas: Configuración →
   Mensajes y respuestas a historias → Herramientas conectadas → **Permitir
   acceso a los mensajes**. Sin esto la API no ve ningún mensaje.
3. **Secrets** en Lovable:
   - `INSTAGRAM_PAGE_ID` — el `id` de la página que sale en el curl del §4
   - `INSTAGRAM_VERIFY_TOKEN` — una cadena larga que inventes
   - `META_APP_SECRET` — el App Secret (§2.4). Si ya está `WHATSAPP_APP_SECRET`,
     vale ese: es la misma app.
4. **Migración** `20261011150000_instagram_mensajes.sql` y **desplegar**
   `instagram-webhook` (`verify_jwt = false`: Meta no manda el JWT de Supabase,
   se autentica con la firma `X-Hub-Signature-256`).
5. **Webhook** en la app de Meta → Instagram → Webhooks → objeto **Instagram**:
   - URL: `https://rsahtxjpisnldxnsmupk.supabase.co/functions/v1/instagram-webhook`
   - Token de verificación: el `INSTAGRAM_VERIFY_TOKEN`.
   - Meta hace un `GET` y debe salir «Verificado». Después, suscribir el campo **`messages`**.
6. **Suscribir la página a la app** (sin esto no llega nada):

   ```sh
   # el token de la página, con el del usuario del sistema
   curl -s "https://graph.facebook.com/v26.0/PAGE_ID?fields=access_token" \
     -H "Authorization: Bearer EL_TOKEN"
   # y con ese token de página:
   curl -s -X POST "https://graph.facebook.com/v26.0/PAGE_ID/subscribed_apps?subscribed_fields=messages" \
     -H "Authorization: Bearer TOKEN_DE_PAGINA"
   ```

7. **Probar en modo Desarrollo**: solo llegan mensajes de cuentas con rol en la
   app. Añádete como tester, pon una carrera en directo, enciende Instagram en
   el panel y escribe un dorsal desde tu cuenta.
8. **Abrirlo al público**: app en modo **Activo** y **acceso avanzado** a
   `instagram_manage_messages` y `pages_messaging`. Eso pide la **verificación
   del negocio** y la **revisión de la app**, con un vídeo por permiso: alguien
   escribe un dorsal por Instagram y el asistente contesta con su paso por el
   último control. Cuenta con semanas: hazlo con tiempo antes de la carrera.

> El código del asistente de WhatsApp se ha movido a `_shared/asistente/` y
> `_shared/meta.ts` (y usa ya la v26.0 de la Graph API). No cambia lo que hace,
> pero el próximo despliegue de `whatsapp-webhook` tiene que llevar esas rutas.
