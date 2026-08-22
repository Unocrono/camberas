# Asistente de WhatsApp — alta de WABA y puesta en marcha

Guía de la parte que **tienes que hacer tú** en Meta (yo no puedo crear cuentas
ni introducir credenciales) y de cómo enchufarla al webhook ya escrito.

Código: [`supabase/functions/whatsapp-webhook/`](../supabase/functions/whatsapp-webhook/)
Migración: `supabase/migrations/20260804170000_whatsapp_bot.sql`

---

## 1. Requisitos previos

| Cosa | Detalle |
|---|---|
| Cuenta Meta Business | Verificada (Business Verification). Si no lo está, tarda de días a 2 semanas. |
| Número de teléfono | **Dedicado.** No puede estar dado de alta en WhatsApp normal ni en WhatsApp Business App. Si lo estuvo, hay que borrar esa cuenta antes y esperar. |
| Tarjeta de pago | Aunque las respuestas del bot no se facturen (ver §6), Meta exige método de pago en la WABA. |

> Un fijo vale como número de WABA (recibe el código por llamada). Si vas a usar
> el número que ya aparece en la web de contacto, ten en cuenta que dejará de
> poder usarse desde la app de WhatsApp: mejor uno nuevo.

## 2. Crear la app en Meta

1. [developers.facebook.com](https://developers.facebook.com) → **Mis apps** → **Crear app** → tipo **Empresa**.
2. Añadir el producto **WhatsApp**.
3. Se crea (o eliges) la **WABA**. Meta te da un **número de prueba** gratuito.
4. Anota en la pantalla *API Setup / Configuración de la API*:
   - **Phone Number ID** (no el número: el id numérico largo) → `WHATSAPP_PHONE_NUMBER_ID`
   - **WhatsApp Business Account ID** (por si hace falta luego)
   - **App Secret** (Configuración → Básica → Mostrar) → `WHATSAPP_APP_SECRET`

### El número de prueba sirve para el rodaje

Viene con limitaciones que hay que conocer para no volverse loco:

- Solo puede **enviar a 5 números** que registres a mano en esa misma pantalla.
- El token que se muestra ahí **caduca a las 24 h** (por eso el §3).
- No se puede usar para el público.

Vale perfectamente para probar el webhook de punta a punta antes de quemar el
número bueno. El paso al número real es cambiar `WHATSAPP_PHONE_NUMBER_ID`.

### Registrar el número definitivo

En WhatsApp → **Administrar números de teléfono** → **Añadir número**:

1. **Nombre visible** (el que verá la gente, ej. "Camberas"). Meta lo revisa y
   debe guardar relación con el negocio; los nombres genéricos se rechazan.
2. Verificación por **SMS o llamada** (un fijo vale: recibe la llamada).
3. Elegir PIN de verificación en dos pasos. **Apúntalo**, hace falta para
   migrar el número más adelante.

## 3. Token permanente (System User)

El token de prueba de la consola **caduca en 24 h**. Para producción:

1. Business Settings → **Usuarios** → **Usuarios del sistema** → Añadir.
2. Rol **Administrador**.
3. **Añadir activos** → la WABA → permiso de control total.
4. **Generar nuevo token** → app = la de arriba → permisos `whatsapp_business_messaging`
   y `whatsapp_business_management` → **caducidad: nunca**.
5. Ese token → `WHATSAPP_TOKEN`. Se enseña una sola vez.

## 4. Desplegar el webhook

```bash
supabase secrets set WHATSAPP_VERIFY_TOKEN="una-cadena-larga-que-inventes"
```

Los otros tres secrets igual (`WHATSAPP_APP_SECRET`, `WHATSAPP_TOKEN`,
`WHATSAPP_PHONE_NUMBER_ID`). Después:

```bash
supabase functions deploy whatsapp-webhook --no-verify-jwt
```

El `--no-verify-jwt` no es opcional: Meta no manda el JWT de Supabase. La
autenticación real la hace la firma `X-Hub-Signature-256`, que la función
valida en cada POST.

Aplica también la migración:

```bash
supabase db push
```

## 5. Conectar el webhook en Meta

En la app → WhatsApp → **Configuración** → Webhook → Editar:

- **URL de devolución de llamada**:
  `https://rsahtxjpisnldxnsmupk.supabase.co/functions/v1/whatsapp-webhook`
- **Token de verificación**: el mismo `WHATSAPP_VERIFY_TOKEN` de arriba.

Meta hace un `GET` inmediato; si el token cuadra, la función devuelve el
`hub.challenge` y verás "Verificado". Después, **Administrar** → suscribirse al
campo **`messages`**. Sin esa suscripción no llega nada.

### Pasar la app a modo Live

Arriba del panel, junto al nombre de la app, hay un conmutador
**Desarrollo / Activo (Live)**.

**En modo Desarrollo el webhook solo recibe mensajes de los números que hayas
registrado como testers.** Si lo dejas ahí y anuncias el número, la gente
escribirá y no llegará nada — sin error visible, simplemente silencio. Es el
fallo más común de la primera puesta en marcha.

Para poder activarlo, Meta pide tener completado el aviso de privacidad de la
app (Configuración → Básica → URL de la política de privacidad).

## 6. Coste

- **Respuestas dentro de la ventana de 24 h que abre el usuario: 0 €.** Es el
  caso del asistente entero (solo contesta a quien escribe primero).
- Mensajes que inicias tú (plantillas) sí se pagan, por mensaje y según el país
  del destinatario. Eso es la fase 3 (avisos "tu corredor ha llegado a meta").
- Confirma tus tarifas exactas en WhatsApp Manager → Facturación, que muestra
  el precio por categoría y país de tu cuenta.

## 7. Configurar la carrera en antena

La función no tiene nada hardcodeado: lee la fila 1 de `wa_bot_config`.

```sql
UPDATE public.wa_bot_config SET
  enabled       = true,
  active_eid    = '1',                       -- EID de RaceTec (racetec_*.eid)
  race_name     = 'La Chuleta',
  race_id       = '...uuid de races...',
  distance_id   = '...uuid de race_distances...',
  live_url      = 'https://.../live.html',
  results_url   = 'https://camberas.com/...',
  info_url      = 'https://camberas.com/...',
  race_info     = 'Salida 9:00 · 21 km · 1.100 m D+',
  position_mode = 'split',
  updated_at    = now()
WHERE id = 1;
```

Con `enabled = false` el bot contesta que no hay carrera en directo, en vez de
dar datos viejos. **Apágalo al terminar cada prueba.**

## 8. Privacidad — decisiones ya tomadas en el código

- `position_mode = 'split'`: el bot dice *"pasó por Laredo · 1:42:18"*, **nunca
  coordenadas GPS**. Misma utilidad para la familia, mucho menos útil para
  localizar a una persona.
- El puesto general **no se publica mientras el corredor está en carrera**: el
  `position` de `racetec_leaderboard` lo calcula el bridge por género, no es la
  general, y publicarlo sería dar un dato falso.
- Aviso RGPD automático en la primera respuesta a cada número.
- `wa_messages` guarda el teléfono (dato personal) y se purga a los 30 días con
  `purge_wa_messages()`. Conviene programarla con pg_cron.

## 9. Antes de anunciar el número

Los números nuevos arrancan en un **tier de mensajería bajo**. Las respuestas
dentro de ventana tienen límites distintos a las iniciadas, pero conviene:

1. Comprobar el tier en WhatsApp Manager.
2. Rodar el bot en una prueba pequeña antes de La Chuleta.
3. Vigilar la **calidad del número**: si mucha gente bloquea o reporta, Meta
   baja el tier o restringe el número.

## 10. Qué falta (fases siguientes)

- **F2**: capa LLM para lenguaje libre, usando `findRunner` / `getTop` como
  herramientas y `help_content` como FAQ. La regex se queda delante: un dorsal
  suelto no debe pasar por el modelo.
- **F3**: avisos proactivos por plantilla (requiere aprobación de plantilla en
  Meta y sí tiene coste por mensaje).
- Panel en `/organizer` para editar `wa_bot_config` sin SQL.
