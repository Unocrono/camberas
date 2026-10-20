# Montar una carrera en Camberas

Lo aprendido al montar el II Trail Navideño Monte Tejas (sep–oct 2026), para la siguiente. Cómo
se configura la web propia en el panel está en `docs/web-propia.md`; aquí va el orden de trabajo,
lo que no se ve a simple vista y cómo trabajar con el promotor.

## Cómo trabajar con el promotor

- Escribe en español, corto y llano. Es cronometrador de oficio y programador veterano (FoxPro):
  entiende de datos. No hace falta explicarle SQL; sí qué cambia para el corredor y dónde lo verá.
- Quiere las cosas hechas. Si el dato está claro, se aplica, se comprueba y se cuenta. Solo se
  pregunta lo que solo él puede decidir: fechas, precios y textos del reglamento.
- **Ensayo en seco.** Al contarlo, di siempre que «no queda nada en la base». Una vez «marcha
  atrás» se entendió como deshacer sus datos, y no gustó.
- **Mensajes repetidos.** La app a veces le reenvía sola el mismo mensaje unos segundos después
  de cada respuesta. Uno repetido no es una respuesta nueva a lo que se le haya preguntado.
- **Cambios en producción.** Cada cambio de datos queda también como migración en
  `supabase/migrations/`, marcada «APLICADA», y va en un PR que Claude fusiona él mismo.
  Si el cambio toca la web, después hay que darle a Publish en Lovable (ver `CLAUDE.md`).

## Acceso a los datos

- **Base de datos:** se consulta con el conector de Lovable, `query_database`, sobre el proyecto
  `ce90a0d6-7611-478a-9cd7-5d58c8c47bb9`. Si la sesión no tiene ese conector, no puede consultar
  la base ni aplicar migraciones. Se pide al promotor que lo active.
- **Webs que no se alcanzan:** desde el contenedor no se llega a camberas.com, a supabase.co ni a
  las webs de clasificaciones (Sportmaniacs…). Se piden desde la propia base con `net.http_get`
  (pg_net) y la respuesta se lee en `net._http_response`. Así se leen también los ficheros del
  Storage público (`race-gpx`, `race-images`). `race-documents` es privado.

## Orden de trabajo

1. **Fuentes.** Reglamento del año (PDF), cartel, GPX y clasificaciones del año anterior (para los
   ritmos). Si la carrera ya existe en Camberas, se actualiza; si existe la edición anterior, se
   duplica (`duplicar_carrera`, ver `docs/web-propia.md`).
2. **Carrera y recorridos** (`races`, `race_distances`): fecha, lugar, distancia, desnivel,
   precio base, plazas y la **apertura y el cierre de inscripciones, en el recorrido**. Esas
   fechas mandan en la ficha, en el cobro y, desde el 19-oct, en la web propia.
   `races.registration_opens/closes` no se puede editar en el panel y solo es el respaldo.
3. **Tramos de precio** (`race_distance_prices`). El cobro (`redsys-init-payment`,
   `guest-register`) cobra el tramo vigente y, si no hay ninguno, el precio base. El tramo, el
   precio base, el reglamento y los textos de la web tienen que decir lo mismo: en Monte Tejas la
   web enseñaba 14 € y el tramo habría cobrado 13 €.
4. **Olas** (`race_waves`): `hora_prevista` es la pública y `start_time` la oficial. Son horas de
   pared, con literales `+00` (norma de horas del `CLAUDE.md`).
5. **Reglamento por secciones** (`race_regulations`, `race_regulation_sections`).
6. **Web propia** (`race_web`): plantilla, tema, contenido y `activa` (ver más abajo).
7. **Rutómetro** desde el GPX, más los puntos a mano y los ritmos (ver más abajo).
8. **Controles de cronometraje** (`race_checkpoints`): como mínimo, salida y meta.
9. **Documentación:** los trámites (ver más abajo).
10. **Comprobación final** (ver más abajo).

## Web propia

- `camberas.com/<slug>` abre la web propia si `race_web.activa` es cierto, o si se añade
  `?previa=1`. `camberas.com/race/<slug>` es siempre la ficha genérica.
- **Plantillas:** `src/plantillas/registro.ts` (`gurriana`, `navidad-monte-tejas`). Una nueva lleva
  su entrada en el registro, su CSS bajo `[data-plantilla="…"]` y **su nombre en el CHECK
  `race_web_plantilla_check`**; si no, no se puede guardar.
- **Tema** (`race_web.tema`): `avisosContraste` exige 4,5 de contraste en el texto sobre la marca y
  sobre el botón, y 3 entre el botón y la marca.
- **Contenido:** tiene que pasar `ContenidoSchema` (`src/eventos/contenidoSchema.ts`). Si no pasa,
  el editor del panel lo abre vacío y lo machaca al guardar. Antes de escribirlo por SQL se valida
  con `node_modules/.bin/tsx` importando el esquema.
- **Las tarjetas del día de carrera no leen el reglamento.** Programa, recogida de dorsales y
  servicio sanitario salen de `race_web.contenido`: si cambia el reglamento, hay que cambiarlas
  también (Panel › Web propia › Día de carrera).
- **El cuadro «Material obligatorio» sí lee el reglamento.** Coge todas las líneas con viñeta de esa
  sección, también las de «Recomendado». Lo recomendado se escribe sin viñetas.
- **Visibilidad:** quien entra sin sesión ve una copia que se renueva cada 90 s
  (`evento_publico_cache`). Con la carrera oculta (`is_visible = false`), el público no ve nada y
  el organizador con sesión ve la vista previa.
- **Avituallamientos y controles** se montan en `src/eventos/normalizar.ts` con el rutómetro y los
  controles de cronometraje.

## Rutómetro

- **Qué lee del GPX.** Los lectores solo entienden `<trkpt>`: un GPX de ruta (`<rtept>`) hay que
  pasarlo a track. Los `<wpt>` se convierten en puntos destacados con el tipo que dicta el nombre:
  - `avitu…` → avituallamiento sólido y líquido;
  - `agua…` → líquido;
  - `control…`, `salida`, `meta`…
- **Ida y vuelta.** Cada waypoint se coloca en el punto del track más cercano, a 300 m como mucho.
  Un avituallamiento por el que se pasa a la ida y a la vuelta necesita dos waypoints.
- **«Regenerar desde el GPX»** borra solo los puntos con `origen = 'gpx'`. Los añadidos en el panel
  o marcados en campo se conservan. Todo lo anterior al 14-oct quedó como `gpx`, y por eso en
  Monte Tejas se perdieron los avituallamientos al subir otra vez el GPX y regenerar.
- **Orden:** desde el 19-oct un disparador renumera por km tras cada alta o cambio de km. El km
  parcial se calcula en la lista, desde el punto anterior.
- **Ritmos** (`roadbook_paces`): orden 1 «Ritmo del primero», orden 2 «Ritmo de corte». Salen de
  las clasificaciones del año anterior (el primero y el último) y necesitan rutómetro y salida
  prevista.

## Migraciones

- **Lo que manda el `CLAUDE.md`:** ensayo en seco y aplicación en la misma sesión, norma de horas y
  guardia de horas.
- **Si las va a pegar el promotor en el editor SQL de Lovable:** sentencias sueltas e
  idempotentes, sin bloques `DO` ni `$…$`, y sin `;` ni comillas en los comentarios, porque el
  editor parte las sentencias. Con la consulta de Lovable los bloques `DO` sí funcionan.
- **Ensayo en seco con resultado a la vista:** se termina con
  `SELECT ('ENSAYO ' || <jsonb>::text)::int`. Falla a propósito, deshace todo y el mensaje de error
  trae el resultado.
- **Probar con los permisos del organizador (su RLS),** dentro del ensayo:
  `SELECT set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true);` y
  después `SET LOCAL ROLE authenticated;`.
- **Para cambiar una función de producción,** por sustitución sobre su definición real
  (`pg_temp.sustituir`, ver `20261017140000_url_externa_de_inscripcion.sql`). En el repo no está la
  última versión de `evento_publico`.
- **Ejemplos de Monte Tejas:**
  - `20260929130000_web_trail_navideno_monte_tejas_2026.sql`: web propia, recorrido y rutómetro;
  - `20261009120000_monte_tejas_precio_14.sql`: precio;
  - `20261019120000_monte_tejas_recogida_dorsales_web.sql`: tarjetas de la web;
  - `20261019180000_monte_tejas_apertura_24_octubre.sql`: fechas.

## Documentación (trámites)

- **Dónde está:** tablas `race_document_requirements` y `race_documents`, con los ficheros en el
  bucket privado `race-documents`. En el panel, Panel › Carreras › Documentación.
- **Checklist estándar:** lo carga `seed_requisitos_documentales(race_id)`, pero necesita
  `auth.uid()` y desde la consulta de Lovable no funciona. Se insertan las mismas filas a mano, o el
  organizador pulsa «Cargar checklist estándar».
- **Plazos estándar, en días antes de la carrera:**
  - ayuntamiento, espectáculos y medio ambiente: 90;
  - tráfico (ETRAZA/DGT) y permiso federativo: 60;
  - seguros: 45;
  - plan de seguridad y protección de datos: 30.

## Comprobación final

- **Lo que ve la web:** `SELECT public.evento_publico('<slug>')` (precios, apertura y cierre,
  rutómetro, avituallamientos). Si la carrera está oculta, sin sesión devuelve NULL.
- **Datos viejos en los textos:** se buscan con una expresión regular en `races`, `race_distances`,
  tramos, reglamento, `race_faqs` y `race_web`. Un precio o una fecha cambiados en un sitio
  suelen quedarse viejos en otro.
- **Copia de visitantes:** si hay prisa, se renueva llamando a `evento_publico_cache('<slug>')`.
- **Publicación:** tras fusionar, Publish en Lovable y comprobar que camberas.com pide otro
  `assets/index-*.js`.
