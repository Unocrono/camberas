# Copias de seguridad

Cómo se respalda y cómo se restaura la base de datos de Camberas
(proyecto `rsahtxjpisnldxnsmupk`, alojado en **Lovable Cloud**).

---

## 1. El punto de partida: no tenemos las llaves

El backend lo gestiona **Lovable Cloud**, que administra el proyecto de Supabase
por debajo pero **no entrega las credenciales**:

- no hay acceso al panel de Supabase (`supabase.com/dashboard`),
- no hay contraseña de Postgres, así que **no se puede conectar con `pg_dump` ni
  `psql`**,
- no hay `service_role key` visible.

Todo lo que sigue está condicionado por eso. Se intentó el camino directo con
`pg_dump` y no es viable: sin cadena de conexión no hay por dónde entrar.

> **Consecuencia de fondo, más grave que la copia.** Con este montaje, el acceso
> a la base de datos de un producto con pagos reales e inscritos reales depende
> por completo de Lovable. La salida, si algún día compensa, es migrar a un
> Supabase propio (Lovable lo soporta: "connect your own Supabase project", y da
> panel, credenciales y `pg_dump`). No es una decisión para tomar con prisa, pero
> conviene tenerla presente. Ver §6.

---

## 2. Qué respalda Lovable solo

Lovable hace **un backup diario** de la base (estructura y datos) y permite
restaurar a cualquiera de los snapshots recientes, con una retención del orden de
**dos semanas**. Es la red de seguridad ante un `DELETE` sin `WHERE`.

Lo que esa red **no** te da: no te la puedes llevar, no controlas la retención, y
si el problema es el acceso a la cuenta de Lovable, se va con ella. Por eso hay
que sacar exports propios.

---

## 3. Sacar una copia propia

### 3.1. Generar el export en Lovable

1. Pestaña **Cloud → Overview → Advanced settings**.
2. En *Export project data*, botón **Export data**.
3. En la tarjeta **Database**, **Export** → **Start export**.
4. Lovable **avisa por correo** cuando está listo.
5. Se descarga desde **Cloud → Storage**.

Límites: **5 GB** por export y **uno cada 24 horas**. No es un mecanismo para
disparar a menudo: elige bien el momento (ver §4).

### 3.2. Archivar lo descargado

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\copia-seguridad.ps1
```

**El `-ExecutionPolicy Bypass` no es opcional.** Windows trae la ejecución de
scripts en `Restricted` y sin él sale
`No se puede cargar el archivo ... porque la ejecución de scripts está deshabilitada`.
Se salta por invocación: no hay que cambiar la política del sistema para lanzar
un script propio.

El script busca el export en `Descargas`, te deja elegirlo de una lista, y:

1. **Verifica** que dentro están `registrations`, `payment_intents`, `races`,
   `timing_readings` y `user_roles`. Un export puede descargarse a medias y pesar
   lo suficiente para parecer bueno; si falta una tabla crítica **no lo archiva**
   y sale con error. Los volcados en texto los lee directamente; los binarios,
   con `pg_restore --list`.
2. Lo comprime en `%USERPROFILE%\Backups\camberas\camberas_AAAA-MM-DD_HHmmss.zip`,
   fuera del repositorio.
3. Conserva las 10 últimas.

Si no puede leer el formato, lo archiva marcándolo `_SIN-VERIFICAR` en el nombre,
para que no se confunda con una copia comprobada.

Con la ruta puesta a mano:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\copia-seguridad.ps1 -Fichero "C:\Users\UNO\Downloads\export.sql"
```

**Borra el original de `Descargas`** cuando confirmes que el `.zip` está bien.

> **Datos personales.** El export contiene nombres, DNI, correos, teléfonos y
> referencias de pago de los inscritos. No va al repositorio, no se sube a un
> chat, no se manda por correo. Si uno de estos ficheros sale de tu máquina, es
> una brecha de datos.

---

## 4. Cuándo sacarla

Con el límite de un export cada 24 horas, se dispara a propósito:

- **Antes de cada carrera**, con las inscripciones ya cerradas. Es el momento en
  que la base vale más.
- **Después de la carrera**, con resultados y lecturas consolidados.
- **Antes de aplicar una migración gorda** o cualquier `DELETE`/`UPDATE` masivo.
- **Después de cada pasada de Lovable sobre la base**, que ya ha cerrado permisos
  y roto paneles en silencio más de una vez.

Entre medias, la red es el backup diario de Lovable (§2).

---

## 5. Qué NO está en la copia

| Contenido | ¿En el export? | Dónde vive |
|---|---|---|
| Estructura y datos de la base | ✅ | — |
| Ficheros de Storage (carteles, fotos, GPX) | ❌ | Lovable → Cloud → Storage |
| Código de las Edge Functions | ❌ (no hace falta) | GitHub `Unocrono/camberas` |
| Secrets (Redsys, Mapbox, VAPID push, WhatsApp) | ❌ | Lovable, y solo ahí |
| Contraseñas de los usuarios **en forma utilizable** | ❌ | — |

Esa última fila importa: **restaurar la base en otro sitio no devuelve el acceso
a los usuarios**. Tendrían que restablecer contraseña.

Los ficheros de Storage se descargan aparte, desde **Cloud → Storage**.

### 5.1. Los secrets, la pieza que falta

Sin las claves de Redsys no se cobra, y sin las de push/WhatsApp no se avisa a
nadie. No están en ningún export ni en el repositorio: viven solo en Lovable.
Merecen su propio inventario en un gestor de contraseñas. **Sigue pendiente.**

---

## 6. Restaurar

### 6.1. Dentro de Lovable (lo normal)

Para un desastre corriente —un borrado accidental, una migración que se llevó por
delante lo que no debía— la vía es **restaurar el backup diario desde Lovable**,
eligiendo el snapshot anterior al estropicio. No hace falta el export.

### 6.2. Fuera de Lovable (el export propio)

El export es un backup de Postgres, así que se restaura con las herramientas
nativas. **PostgreSQL 17.11 ya está instalado** en la máquina de desarrollo, en
`C:\Program Files\PostgreSQL\17\bin` (no quedó en el `PATH`: invócalo por ruta
completa).

Contra un proyecto de Supabase propio y vacío, para un volcado en texto:

```
"C:\Program Files\PostgreSQL\17\bin\psql.exe" --single-transaction --variable ON_ERROR_STOP=1 --command "SET session_replication_role = replica" --file export.sql --dbname "postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres"
```

`session_replication_role = replica` desactiva triggers y claves ajenas mientras
entran los datos; sin eso, el orden de las tablas hace fallar la carga.

Si el export viene en formato binario, se usa `pg_restore` en lugar de `psql`.
Para ver qué trae dentro antes de tocar nada:

```
"C:\Program Files\PostgreSQL\17\bin\pg_restore.exe" --list export.dump
```

Después quedan por rehacer a mano: los secrets, el despliegue de las Edge
Functions, los ficheros de Storage, las variables `VITE_SUPABASE_*` y los
webhooks externos (GPS, Redsys) apuntando a la URL nueva.

### 6.3. Prueba de restauración

Una copia que no se ha restaurado nunca no es una copia, es un fichero. Al menos
una vez: monta un proyecto de Supabase de usar y tirar, restaura ahí el export,
comprueba que `registrations` y `payment_intents` traen las filas que esperas, y
bórralo.

Fecha de la última prueba de restauración: _(sin probar todavía)_

---

## 7. Pendiente

- La primera copia real: nunca se ha generado un export.
- La prueba de restauración (§6.3).
- Descarga de los ficheros de Storage.
- Inventario de los secrets en un gestor de contraseñas (§5.1).
- Decidir si conviene migrar a un Supabase propio (§1).
