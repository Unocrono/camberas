# Guía de Errores Comunes - Camberas

Esta guía documenta los errores más comunes que pueden aparecer en la aplicación, sus causas y soluciones.

---

## 📋 Índice

1. [Errores de Base de Datos](#errores-de-base-de-datos)
2. [Errores de Validación](#errores-de-validación)
3. [Errores de Autenticación](#errores-de-autenticación)
4. [Errores de GPS/Tracking](#errores-de-gpstracking)
5. [Errores de Cronometraje](#errores-de-cronometraje)

---

## Errores de Base de Datos

### `duplicate key value violates unique constraint "race_categories_race_id_name_key"`

**Mensaje mostrado:** "duplicate key value violates unique constraint race_categories_race_id_name_key"

**Causa:** Al crear un segundo evento (distancia) en una carrera, el sistema intentaba crear una categoría por defecto "UNICA" pero ya existía una categoría con ese nombre para la misma carrera.

**Solución aplicada:** Se modificó la restricción única de `(race_id, name)` a `(race_id, race_distance_id, name)` para permitir categorías con el mismo nombre en diferentes eventos.

**Estado:** ✅ Corregido (Enero 2026)

---

### `duplicate key value violates unique constraint "race_categories_race_distance_name_key"`

**Mensaje mostrado:** "duplicate key value violates unique constraint race_categories_race_distance_name_key"

**Causa:** Se está intentando crear una categoría con un nombre que ya existe para el mismo evento/distancia.

**Solución:** Usar un nombre de categoría diferente o editar la categoría existente.

---

### `new row violates row-level security policy`

**Mensaje mostrado:** "new row violates row-level security policy"

**Causa:** El usuario no tiene permisos suficientes para realizar la operación (insertar, actualizar o eliminar datos).

**Posibles razones:**
- El usuario no está autenticado
- El usuario no tiene el rol requerido (admin, organizer, timer)
- El usuario intenta modificar datos de otro usuario/organizador

**Solución:** 
1. Verificar que el usuario haya iniciado sesión
2. Verificar que el usuario tenga el rol correcto asignado
3. Si es organizador, verificar que la carrera le pertenece

---

### `violates foreign key constraint`

**Mensaje mostrado:** "violates foreign key constraint [nombre_constraint]"

**Causa:** Se intenta insertar un registro que referencia a otro que no existe, o eliminar un registro que tiene dependencias.

**Ejemplos comunes:**
- Crear inscripción para una carrera que no existe
- Eliminar una distancia que tiene inscripciones
- Crear resultado para una inscripción inexistente

**Solución:** 
- Verificar que los registros relacionados existan antes de crear nuevos
- Eliminar primero los registros dependientes antes de eliminar el principal

---

### `PGRST116 - JSON object requested, multiple (or no) rows returned`

**Mensaje mostrado:** Error al obtener datos (puede variar)

**Causa:** Se usó `.single()` en una consulta que devolvió 0 o más de 1 resultado.

**Solución técnica:** Usar `.maybeSingle()` si puede no haber resultados, o verificar la lógica de la consulta.

---

## Errores de Validación

### `Este email ya tiene una inscripción para esta carrera` con una inscripción sin pagar

**Mensaje mostrado:** "Este email ya tiene una inscripción para esta carrera" (o "Ya estás inscrito" con cuenta), aunque la persona nunca llegó a pagar.

**Causa:** El control de duplicados miraba solo el email (invitados) o el `user_id` (con cuenta) y la carrera, **sin mirar el estado de la inscripción**. Como la fila se crea con `payment_status='pending'` ANTES de ir a Redsys, quien abandonaba el pago quedaba bloqueado para siempre en esa carrera, aunque su plaza se hubiera liberado a los 30 minutos. En el camino con cuenta, además, el `.maybeSingle()` reventaba en cuanto había más de una fila.

**Solución aplicada:** La decisión vive ahora en la RPC `resolver_inscripcion_previa(p_race_id, p_race_distance_id, p_email, p_user_id)`, que usan `guest-register` y `RaceDetail.tsx`. Devuelve `libre`, `duplicada` o `retomar` (con el token del enlace `/retomar-pago/<token>`). Una cancelada no bloquea; un abandono en otro recorrido de la misma carrera se cancela solo.

**Estado:** ✅ Corregido (agosto 2026)

---

### Una función `SECURITY DEFINER` queda abierta a `anon` sin querer

**Mensaje mostrado:** Ninguno. No falla nada: simplemente cualquiera con la clave anónima —que viaja en el propio navegador— puede llamar a la función.

**Causa:** Dos capas, y la segunda es la que engaña. `CREATE FUNCTION` concede `EXECUTE` a **PUBLIC**; pero además el proyecto tiene puesto `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role`, así que cada función nueva nace también con un permiso **explícito para `anon`**. Un `REVOKE ... FROM PUBLIC` revoca la primera capa y deja la segunda intacta: la función sigue abierta y no da ningún error que lo delate. Pasó con `avisos_pago_pendientes()`, que devuelve los nombres y correos de quien dejó una inscripción a medias, y estuvo accesible con la clave anónima —la que viaja en el bundle del navegador— hasta que se comprobó a mano.

**Solución:** Revocar **por nombre de rol**: `REVOKE EXECUTE ON FUNCTION ... FROM anon, authenticated, PUBLIC;` y después el `GRANT` de quien sí debe entrar. Ojo con lo contrario, que también ha pasado: un REVOKE sin GRANT detrás deja fuera a `authenticated` y rompe la aplicación (ver CLAUDE.md).

**Cómo comprobarlo** (no te fíes del SQL escrito, mira el resultado):

```sql
SELECT p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS con_sesion
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef
ORDER BY 2 DESC, 1;
```

**Estado:** ✅ Corregido (agosto 2026)

---

### `Expected number, received nan`

**Mensaje mostrado:** "Error de validación" o "Expected number, received nan"

**Causa:** Se intentó parsear un campo numérico vacío o con texto no numérico.

**Campos afectados típicamente:**
- Distancia (km)
- Precio
- Desnivel
- Máximo participantes

**Solución aplicada:** Se añadió validación previa que trata strings vacíos como 0 o undefined según el campo.

**Estado:** ✅ Corregido (Enero 2026)

---

### `El dorsal inicial no puede ser mayor que el dorsal final`

**Mensaje mostrado:** "El dorsal inicial no puede ser mayor que el dorsal final"

**Causa:** Al configurar el rango de dorsales, se introdujo un valor de inicio mayor que el final (ej: 500-100).

**Solución:** Corregir los valores para que el dorsal inicial sea menor o igual al final.

---

### `Por favor, introduce valores numéricos válidos para distancia y precio`

**Mensaje mostrado:** "Por favor, introduce valores numéricos válidos para distancia y precio"

**Causa:** Los campos de distancia o precio contienen texto o caracteres no numéricos.

**Solución:** Introducir solo números (se permiten decimales con punto: 10.5)

---

## Errores de Autenticación

### `Invalid login credentials`

**Mensaje mostrado:** "Credenciales inválidas" o "Invalid login credentials"

**Causa:** Email o contraseña incorrectos.

**Solución:** Verificar las credenciales. Usar "Olvidé mi contraseña" si es necesario.

---

### `Email not confirmed`

**Mensaje mostrado:** "Email not confirmed"

**Causa:** El usuario no ha confirmado su email después del registro.

**Solución:** Buscar el email de confirmación en la bandeja de entrada (y spam). Si no llega, solicitar reenvío.

**Nota:** En desarrollo, el auto-confirm está habilitado para evitar este problema.

---

### `User already registered`

**Mensaje mostrado:** "User already registered"

**Causa:** Se intenta registrar con un email que ya existe en el sistema.

**Solución:** Usar "Iniciar sesión" en lugar de "Registrarse", o usar "Olvidé mi contraseña" si no recuerda las credenciales.

---

### `session_not_found`

**Mensaje mostrado:** Puede aparecer en consola o como error silencioso

**Causa:** La sesión del usuario ha expirado o fue invalidada.

**Solución:** Volver a iniciar sesión. El sistema debería redirigir automáticamente.

---

## Errores de GPS/Tracking

### `Permission denied for table gps_tracking`

**Mensaje mostrado:** "Permission denied for table gps_tracking"

**Causa:** El usuario no tiene permisos para insertar datos de GPS.

**Posibles razones:**
- No está autenticado
- No tiene una inscripción activa para la carrera
- La inscripción no está confirmada

**Solución:** Verificar que el usuario esté logueado y tenga inscripción confirmada.

---

### Posiciones GPS no aparecen en el mapa

**Síntoma:** El mapa de seguimiento no muestra a los participantes.

**Posibles causas:**
1. No hay datos GPS recientes en la base de datos
2. Error en la función RPC `get_live_gps_positions`
3. El evento no tiene GPS habilitado

**Diagnóstico:**
```sql
-- Verificar si hay datos GPS para la carrera
SELECT COUNT(*) FROM gps_tracking WHERE race_id = '[UUID_CARRERA]';

-- Verificar las últimas posiciones
SELECT * FROM gps_tracking 
WHERE race_id = '[UUID_CARRERA]' 
ORDER BY timestamp DESC 
LIMIT 10;
```

**Solución aplicada:** Se corrigió la función `get_live_gps_positions` que referenciaba columnas inexistentes.

**Estado:** ✅ Corregido (Enero 2026)

---

## Errores de Cronometraje

### `No se encontró inscripción para el dorsal X`

**Mensaje mostrado:** "No se encontró inscripción para el dorsal X"

**Causa:** Se intenta registrar un tiempo para un dorsal que no existe o no está inscrito en el evento seleccionado.

**Solución:** 
1. Verificar que el dorsal esté inscrito
2. Verificar que se seleccionó el evento correcto
3. Si es un dorsal nuevo, registrar primero la inscripción

---

### `Tiempo fuera de rango válido`

**Mensaje mostrado:** "Tiempo fuera de rango válido" o similar

**Causa:** El tiempo registrado está fuera del rango min_time/max_time configurado para el checkpoint.

**Posibles razones:**
- El corredor pasó demasiado rápido (sospecha de atajo)
- El corredor pasó demasiado lento (fuera de tiempo límite)
- Error en la configuración de tiempos mínimos/máximos

**Solución:** 
1. Verificar la configuración del checkpoint
2. Si el tiempo es legítimo, ajustar los rangos
3. Si es error de lectura, corregir manualmente

---

## Errores de Archivos/Storage

### `new row violates row-level security policy for table "objects"`

**Mensaje mostrado:** Error al subir archivo

**Causa:** El usuario no tiene permisos para subir archivos al bucket de storage.

**Solución:** Verificar las políticas RLS del bucket correspondiente (race-photos, race-gpx, etc.)

---

### `Payload too large`

**Mensaje mostrado:** "Payload too large" o "413"

**Causa:** El archivo que se intenta subir excede el límite de tamaño.

**Límites típicos:**
- Imágenes: 5MB
- GPX: 10MB

**Solución:** Reducir el tamaño del archivo antes de subirlo.

---

## 🆘 ¿Error no documentado?

Si encuentras un error que no está en esta guía:

1. **Captura el mensaje exacto** del error
2. **Anota el contexto**: qué acción estabas realizando
3. **Revisa la consola** del navegador (F12 → Console) para más detalles
4. **Documenta aquí** el error y su solución una vez resuelto

---

## 📝 Plantilla para documentar nuevos errores

```markdown
### `[Mensaje de error exacto]`

**Mensaje mostrado:** "[Cómo aparece para el usuario]"

**Causa:** [Explicación técnica de por qué ocurre]

**Contexto:** [En qué situación/pantalla ocurre]

**Solución:** [Cómo solucionarlo]

**Estado:** ⏳ Pendiente / ✅ Corregido (Fecha)
```

---

**Última actualización:** Enero 2026
