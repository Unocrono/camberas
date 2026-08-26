# Copias de seguridad

Cómo se respalda y cómo se restaura la base de datos de Camberas
(proyecto Supabase `rsahtxjpisnldxnsmupk`).

---

## 1. Qué entra y qué no

| Contenido | ¿En la copia? | Dónde vive si no |
|---|---|---|
| Esquema `public`: tablas, funciones, RLS, permisos (`schema.sql`) | ✅ | también en `supabase/migrations/` |
| Datos del esquema `public` (`data.sql`) | ✅ | **solo aquí** |
| Usuarios de `auth` y metadatos de `storage` | ⚠️ solo con `-IncluirAuth` | Supabase Auth |
| Ficheros de Storage (carteles, fotos, GPX) | ❌ | Supabase Storage |
| Secrets de Edge Functions (Redsys, Mapbox, push, WhatsApp) | ❌ | panel de Supabase |
| Código y Edge Functions | ❌ (no hace falta) | GitHub `Unocrono/camberas` |

Lo que está en la copia es lo irrecuperable: inscripciones, pagos, lecturas de
cronometraje, posiciones GPS, resultados. Lo que queda fuera se puede rehacer,
pero **una base restaurada no funciona hasta volver a poner los secrets a mano**.

> **Datos personales.** El fichero `data.sql` contiene nombres, DNI, correos,
> teléfonos y referencias de pago de los inscritos. No va al repositorio, no se
> sube a un chat, no se manda por correo. Se guarda en `%USERPROFILE%\Backups\camberas\`
> y ahí se queda. Si un `.zip` de estos sale de tu máquina, es una brecha de datos.

---

## 2. Requisito, una sola vez

Hace falta `pg_dump` (y `psql`, que viene en el mismo paquete y es lo que
restaura). En la máquina de desarrollo ya está: **PostgreSQL 17.11**, instalado el
25-ago-2026 en `C:\Program Files\PostgreSQL\17\bin`. En una máquina nueva:

```powershell
winget install -e --id PostgreSQL.PostgreSQL.17
```

No quedó en el `PATH`, así que `pg_dump` a secas no responde desde la consola. No
importa para el script, que busca en `C:\Program Files\PostgreSQL\*\bin` y coge la
versión más alta. Para usar `psql` a mano en la restauración, invócalo por su ruta
completa.

Instala la versión 17 o superior: `pg_dump` se niega a volcar una base más nueva
que él, y Supabase va actualizando el servidor.

> **Por qué no el CLI de Supabase.** `supabase db dump` levanta un contenedor
> para ejecutar `pg_dump` dentro, así que exige Docker Desktop. Instalar Docker
> para esto no compensa cuando el binario nativo pesa lo que pesa y además
> resuelve la restauración.

---

## 3. Hacer una copia

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\copia-seguridad.ps1
```

**El `-ExecutionPolicy Bypass` no es opcional.** Windows viene con la ejecución de
scripts deshabilitada (`Restricted`) y sin él sale
`No se puede cargar el archivo ... porque la ejecución de scripts está deshabilitada`.
Se salta por invocación, que es lo correcto: no hay que cambiar la política del
sistema para lanzar un script propio.

Pide la cadena de conexión de Postgres. Se saca del panel:
**Project Settings → Database → Connection string → URI**, sustituyendo
`[YOUR-PASSWORD]` por la contraseña real.

Si la contraseña lleva caracteres especiales (`@`, `/`, `#`, `?`, `:`), hay que
codificarlos en porcentaje. Un `@` sin codificar parte la URI y la conexión acaba
apuntando a un servidor que no existe.

### Si no sabes la contraseña porque entras por Lovable

Es lo normal: Lovable pilota el proyecto por la Management API con OAuth y nunca
te enseña la contraseña de Postgres. Se resetea desde el panel, y **no rompe
nada**:

**Project Settings → Database → Database password → Reset database password.**

En este proyecto esa contraseña no la usa nadie. Comprobado el 25-ago-2026: no
hay ninguna cadena de conexión directa en el repo, las ~30 Edge Functions se
conectan por API con la `service_role key`, la web con la `anon key`, y no hay
cliente `pg`, Prisma ni Drizzle en las dependencias. Resetearla no afecta ni a la
web, ni a las Edge Functions, ni a Lovable.

Lo único que se rompería es algo **externo al repo** conectado por conexión
directa (una herramienta de BI, n8n, un script en otra máquina). Si existe, hay
que actualizarle la cadena.

Guarda la contraseña nueva en el gestor de contraseñas. El script la pide por
teclado (`Read-Host -AsSecureString`), no la escribe en disco y la descarta al
terminar.

El script:

1. Vuelca esquema y datos de `public` en dos `.sql`.
2. **Verifica** que en `data.sql` aparecen `registrations`, `payment_intents`,
   `races`, `timing_readings` y `user_roles`. `pg_dump` puede salir con código 0
   y dejar un volcado a medias; sin esta comprobación la copia parecería buena.
3. Comprime en `camberas_AAAA-MM-DD_HHmmss.zip`.
4. Conserva las 10 últimas y borra las anteriores.

Si algo falla, borra el volcado incompleto y sale con error. Una copia parcial es
peor que ninguna, porque da confianza falsa.

### Opciones

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\copia-seguridad.ps1 -SoloEsquema
```
Sin datos. Para comprobar que el circuito funciona sin descargarlo todo.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\copia-seguridad.ps1 -IncluirAuth
```
Añade `auth_storage.sql` con los usuarios. Necesario si quieres poder restaurar
en un proyecto nuevo y que la gente pueda entrar; **este fichero es todavía más
sensible que el resto**.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\copia-seguridad.ps1 -Destino "D:\Backups\camberas" -Conservar 20
```

### Sin escribir la contraseña cada vez

Solo en tu máquina, para la sesión actual de la consola:

```powershell
$env:CAMBERAS_DB_URL = "postgresql://..."
```

No la metas en `.env` ni en ningún fichero del repo.

---

## 4. Cuándo hacerla

No hay automatismo: se dispara a mano, a propósito.

- **Antes de cada carrera**, con las inscripciones ya cerradas. Es el momento en
  que la base vale más.
- **Después de la carrera**, con resultados y lecturas consolidados.
- **Antes de aplicar una migración gorda** o cualquier `DELETE`/`UPDATE` masivo
  desde el editor SQL.
- **Después de cada pasada de Lovable sobre la base**, que ya ha cerrado permisos
  y roto paneles en silencio más de una vez.

Supabase mantiene su propio backup diario, pero con retención corta y sin control
tuyo. Estas copias son las que puedes llevarte y las que puedes probar.

---

## 5. Restaurar

Esto es lo que hay que saber hacer sin improvisar.

### 5.1. Descomprimir

```powershell
Expand-Archive "$env:USERPROFILE\Backups\camberas\camberas_2026-08-25_120000.zip" -DestinationPath "$env:USERPROFILE\restauracion"
```

Fuera del repositorio. Si lo descomprimes dentro, `data.sql` acaba a un `git add .`
de distancia de GitHub (hay una regla en `.gitignore` para tapar el descuido, pero
no te apoyes en ella).

### 5.2. Restaurar en un proyecto vacío

Crea un proyecto nuevo en Supabase (o vacía el actual, con mucho cuidado) y lanza,
desde la carpeta descomprimida:

```
psql --single-transaction --variable ON_ERROR_STOP=1 --file schema.sql --command "SET session_replication_role = replica" --file data.sql --dbname "postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres"
```

`session_replication_role = replica` desactiva triggers y comprobaciones de clave
ajena mientras entran los datos. Sin eso, el orden de las tablas hace fallar la
carga.

Si incluiste `auth_storage.sql`, va después, en una llamada aparte y con la misma
opción de `session_replication_role`.

Los roles de la base (`anon`, `authenticated`, `service_role`) no se vuelcan: un
proyecto de Supabase ya los trae. Los `GRANT` sobre funciones y tablas sí van en
`schema.sql`, que es lo que importa en este proyecto.

### 5.3. Lo que hay que rehacer a mano

Una base restaurada **no es un proyecto funcionando**. Falta:

1. **Los secrets de las Edge Functions**: claves de Redsys, Mapbox, VAPID de push,
   WhatsApp. Se vuelven a poner en Project Settings → Edge Functions → Secrets.
   Sin esto no se cobra ni se envía nada.
2. **Desplegar las Edge Functions** al proyecto nuevo.
3. **Los ficheros de Storage**: carteles, fotos, GPX. El volcado guarda los
   metadatos, no los ficheros.
4. **Apuntar la web al proyecto nuevo**: `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_PROJECT_ID` y `VITE_SUPABASE_PUBLISHABLE_KEY` en `.env` y en el
   despliegue.
5. **Rehacer los webhooks externos** (GPS, Redsys) contra la URL nueva.

### 5.4. Prueba de restauración

Una copia que no se ha restaurado nunca no es una copia, es un fichero. Al menos
una vez, y después de cualquier cambio grande de esquema: crea un proyecto de
usar y tirar, restaura ahí, comprueba que `registrations` y `payment_intents`
traen el número de filas que esperas, y bórralo.

Fecha de la última prueba de restauración: _(sin probar todavía)_

---

## 6. Pendiente

- Copia de los ficheros de Storage.
- Inventario cifrado de los secrets de Edge Functions.
- Automatizar el disparo: requiere decidir dónde vive la contraseña de Postgres
  en la máquina que lo ejecute.
