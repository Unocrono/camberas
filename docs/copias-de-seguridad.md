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

**Qué te descargas.** Comprobado con el export del 26-ago-2026: un `.zip` que
contiene un único fichero `.backup`, que es un volcado nativo de PostgreSQL en
**formato CUSTOM** (cabecera `PGDMP`, comprimido con zstd). Aquel traía 112
tablas, 98 de ellas con datos, y 116 funciones, en 27 MB.

Lo generó `pg_dump` **18.4** contra un servidor PostgreSQL **17.6**. Eso importa
para restaurar: ver §6.2.

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

1. **Comprueba que no esté ya archivado**, comparando el hash. Con un export cada
   24 horas es fácil guardar dos veces el mismo fichero y creer que tienes dos
   copias donde hay una.
2. **Verifica que trae datos** de `registrations`, `payment_intents`, `races`,
   `timing_readings` y `user_roles`. Abre el `.zip`, lee el índice del volcado con
   `pg_restore --list` y busca `TABLE DATA`, no `TABLE` a secas: un volcado de
   solo estructura no es una copia de seguridad. Los volcados en texto los lee
   directamente, buscando `COPY` o `INSERT INTO`. Si falta una tabla crítica **no
   lo archiva** y sale con error.
3. Lo guarda en `%USERPROFILE%\Backups\camberas\camberas_AAAA-MM-DD_HHmmss.zip`,
   fuera del repositorio. Si el origen ya venía comprimido, lo copia tal cual en
   vez de meter un zip dentro de otro.
4. Conserva las 10 últimas.

Si no puede leer el formato, lo archiva marcándolo `_SIN-VERIFICAR` en el nombre,
para que no se confunda con una copia comprobada.

El fichero que extrae para verificar va a un temporal y se borra siempre al
terminar, incluso si la verificación falla: lleva datos personales.

Con la ruta puesta a mano:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\copia-seguridad.ps1 -Fichero "C:\Users\UNO\Downloads\export.sql"
```

**Borra el original de `Descargas`** cuando confirmes que el `.zip` está bien.

> **Datos personales.** El export contiene nombres, DNI, correos, teléfonos y
> referencias de pago de los inscritos. No va al repositorio, no se sube a un
> chat, no se manda por correo sin cifrar. Si uno de estos ficheros sale de tu
> máquina en claro, es una brecha de datos.

### 3.3. Segunda copia, cifrada, en Dropbox

La copia local no basta. En esta máquina `C:` y `D:` son **dos particiones del
mismo SSD** (disco 0, un NVMe de 512 GB) y `E:` es un disco virtual: guardar en
`D:` no protege de nada: si ese disco muere, se van las dos a la vez.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\copia-seguridad.ps1 -Cifrada
```

Deja una segunda copia en `%USERPROFILE%\Dropbox\Camberas-Backups`, **cifrada con
AES-256**, y Dropbox la sincroniza sola. El cifrado no es opcional: sin él estarías
subiendo DNI, correos, teléfonos y referencias de pago de tus inscritos a un
servicio de terceros.

Necesita 7-Zip, una vez:

```powershell
winget install -e --id 7zip.7zip
```

Qué hace el script:

1. Pide la contraseña **dos veces y las compara**. Un archivo cifrado con una
   contraseña mal tecleada es papel mojado, y no te enteras hasta el día que lo
   necesitas.
2. Cifra con `-mhe=on`, que oculta también **los nombres de fichero**, no solo el
   contenido.
3. **Comprueba que el archivo se abre** con esa contraseña. Si no abre, lo borra:
   una copia que no se puede abrir es peor que ninguna, porque da falsa confianza.
4. Rota las 10 últimas, igual que en local.

**Guarda esa contraseña en tu gestor.** Sin ella la copia de Dropbox no vale nada,
y ese es exactamente el punto de cifrarla.

Si el export ya estaba archivado, el script lo detecta y usa la copia local para
generar la cifrada, sin pedirte otra vez el fichero:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\copia-seguridad.ps1 -Fichero "$env:USERPROFILE\Backups\camberas\camberas_2026-08-26_101754.zip" -Cifrada
```

> **Detalle honesto.** La contraseña se le pasa a 7-Zip como argumento, así que
> durante el par de segundos que dura el cifrado es visible para quien pueda
> inspeccionar los procesos de tu propia sesión de Windows. En una máquina
> personal el riesgo es bajo; en una compartida, cifra a mano.

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

El export es un volcado nativo de Postgres en formato CUSTOM, así que se restaura
con `pg_restore`, no con `psql`. Primero hay que **descomprimir el `.zip`** y
sacar el `.backup` de dentro.

**PostgreSQL 17.11 está instalado** en `C:\Program Files\PostgreSQL\17\bin` (no
quedó en el `PATH`: invócalo por ruta completa). Para inspeccionar el volcado sin
tocar nada, sirve de sobra:

```
"C:\Program Files\PostgreSQL\17\bin\pg_restore.exe" --list camberas_260826.backup
```

> **Antes de restaurar de verdad, instala PostgreSQL 18.** El export lo genera
> `pg_dump` 18.4, y `pg_restore` debe ser de versión igual o superior a la que
> creó el archivo. El 17 lo lista bien —comprobado— pero no des por hecho que lo
> restaura entero.

Contra un proyecto de Supabase propio y vacío:

```
"C:\Program Files\PostgreSQL\18\bin\pg_restore.exe" --no-owner --no-privileges --disable-triggers --dbname "postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres" camberas_260826.backup
```

`--disable-triggers` evita que las claves ajenas hagan fallar la carga por el
orden de las tablas. `--no-owner` porque los roles del proyecto de destino no son
los del origen.

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

- ~~La primera copia real~~ — hecha el 26-ago-2026: 112 tablas, 98 con datos, 27 MB.
- La prueba de restauración (§6.3).
- Descarga de los ficheros de Storage.
- Inventario de los secrets en un gestor de contraseñas (§5.1).
- Decidir si conviene migrar a un Supabase propio (§1).
