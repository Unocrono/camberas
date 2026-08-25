# Traspaso: carruseles de ayuda y de Instagram

Todo lo aprendido en la sesión que montó esto, para retomarlo sin volver a
descubrirlo. Lo operativo (cómo se usa el generador, esquema del JSON, las
herramientas) está en `plantillas/README.md`; la lista de deberes en
`plantillas/PENDIENTE.md`. Aquí va el **porqué**: las decisiones, las trampas
que ya nos han mordido y el contexto que no se deduce leyendo el código.

Rama: `claude/carruseles-ayuda-2lvhq2`. PR #6 (borrador).

---

## 1. Qué hay, en dos frentes

Son dos cosas distintas que comparten nombre y viven en la misma rama.

**a) Carruseles dentro de la web** — `src/components/carrusel.tsx`,
`src/pages/Help.tsx`, `src/pages/OrganizerGuide.tsx`. `/ayuda` y
`/guia-organizador` pasaron de listas largas a carrusel, una sección por
diapositiva. No hay base de datos nueva: el contenido es el que ya había.

**b) Generador de carruseles para Instagram** — `generar-carrusel.js`,
`plantillas/`, `content/`, `capturas/`. Pipeline aparte: no entra en el
bundle de Vite ni toca la web. Render con Playwright a PNG.

El grueso del trabajo es (b). Si solo hay que llevar (a) a `main`, el commit
`7c51b43` lo aísla.

---

## 2. Historia que conviene saber

El encargo original pedía «reutilizar la plantilla de carrusel que ya existe
en el repo y el pipeline de render con Playwright», con fuente Danube y
colores cian/magenta de UNO crono. **Nada de eso existía**: ni plantilla, ni
Playwright, ni pipeline de vídeo, ni esas fuentes. Se hizo de cero, con la
identidad de Camberas (confirmado por el usuario). Si alguien vuelve a
mencionar «la plantilla que ya existe», es ésta.

---

## 3. Las trampas que ya nos costaron tiempo

Están resueltas. Documentadas para que nadie las re-rompa al tocar la
plantilla.

**Las fuentes se caían en silencio.** Los primeros PNG salieron en Liberation
Sans y `document.fonts.check()` devolvía `true` igualmente: miente. Solución:
Archivo Black y Barlow Semi Condensed **autoalojadas** en `plantillas/fuentes/`
(OFL 1.1), y la comprobación se hace midiendo texto en un canvas contra
`monospace` — si el ancho no cambia, la fuente no se aplicó. El render no
puede depender de la red.

**La bisección se hundía al mínimo.** `.caja-titulo { min-height: 0 }` dejaba
que flexbox encogiera la caja por debajo del contenido, así que
`scrollHeight` nunca superaba a `clientHeight` y el algoritmo creía que todo
cabía a cualquier escala. El patrón bueno es el que hay ahora: `.caja-ajuste`
con `min-height: 0` **y `flex-shrink: 0` en los hijos**.

**Recorte horizontal.** El `?` de «¿PUEDO COBRAR LAS INSCRIPCIONES?» se salía
por el lado. Una palabra larga que no puede partirse cabe de alto y no de
ancho: `cabe()` mira **las dos** dimensiones.

**Zonas seguras de story.** Instagram pinta su interfaz *encima* del PNG:
unos 250 px arriba y abajo sobre un lienzo de 1920. Con márgenes iguales, la
cabecera quedaba a y=96 y la regla a y=1816, las dos tapadas. De ahí
`--margen-arriba` / `--margen-abajo` separados y 280 px en story.

**`--colinas-alto` va en px, no en %.** Un porcentaje se resolvería contra el
ancho, no contra el alto, y las colinas cambiarían de tamaño entre formatos.

**El HTML temporal se escribe dentro de `plantillas/`**, no en `/tmp`: si no,
las rutas relativas a `fuentes/` no resuelven y volvemos al punto uno.

**`embla-carousel-auto-height` no vale** para el carrusel de la web. Se probó
y se quitó: solo recalcula al cambiar de diapositiva, así que un acordeón que
se abre queda cortado. Por eso `useCarruselAltura` usa `ResizeObserver` sobre
la diapositiva activa. Requiere `items-start` en el `CarouselContent`.

**El acordeón de `/guia-organizador` se eliminó.** Dentro del carrusel dejaba
ocho diapositivas casi vacías.

**Playwright: gana la última ruta registrada.** Un stub genérico
`**/*.supabase.co/**` se comía al específico `**/rest/v1/help_*`. Un solo
manejador.

**El ffmpeg de Playwright no sirve para MP4.** Está compilado con
`--disable-everything`: solo WebM/VP8, que Instagram no admite. Hace falta
libx264 → `ffmpeg-static` (ya en devDependencies) o ffmpeg del sistema.

---

## 4. Cómo mover ficheros a este contenedor

Se perdió bastante rato con esto. La sesión corre en un contenedor en la
nube, no en el ordenador del usuario:

- Las imágenes pegadas en el chat **se ven pero no aterrizan en disco**.
- Drive las encuentra, pero devolverlas es base64 dentro del contexto:
  inviable para ficheros de megas.
- **`git pull` es el único camino que mueve bytes sin gastar contexto.**

El flujo que funciona: el usuario sube la captura por la web de GitHub **a la
rama** (no a `main`) y aquí se hace `git pull`. Si dice «no existe la carpeta
capturas», casi seguro está mirando `main`.

Tratamiento de imagen (recortar, muestrear color, remapear fondo) se hace con
canvas en el navegador y el script escribe los bytes a disco: en el
contenedor no hay PIL ni ImageMagick.

---

## 5. Decisiones editoriales que no hay que deshacer

- **Verificado contra el repo, no inventado**: precios (`Planes.tsx`), cupones
  y tarifas de equipo y cancelaciones (componentes de `admin/`), el código de
  seis letras y la entrada solo-con-nombre
  (`20260731100000_grupetta.sql`), la caducidad de 48 h y el tope de 20
  personas, GPX → km y desnivel (`GrupettaCapo.tsx`), categorías de
  documentos (`20260807110000_documentacion_carreras.sql`).
- **Los textos legales mandan.** `public/descargo-grupetta.html` y
  `privacidad-camberas-track.html` se leyeron antes de escribir los
  carruseles de seguridad y privacidad, para no contradecir lo que la propia
  empresa firma. El aviso de que el SOS **no llama al 112** está citado del
  descargo y tiene diapositiva propia.
- **RFID: se dice «se importan», no «se capturan en vivo».** Solo existe
  `RFIDImportDialog`, que parsea un fichero; no hay nada que hable TCP/IP con
  un equipo. Si eso existe en otra rama, `plataforma-5` se queda corto.
- **«Sin comisión por inscripción» no está escrito en ninguna parte** porque
  no se pudo confirmar. Es la línea más fuerte que le falta a
  `plataforma-1` y a `organizadores-1`. Pendiente de que el usuario lo
  confirme.
- **Rojo SOS**: `#D91F10` y `#FB493B` se añadieron a
  `docs/paleta-camberas.md` como colores **funcionales**, no de marca,
  muestreados de la app. Aviso apuntado allí: el rojo a baja opacidad sobre
  el verde tinta se vuelve marrón — nada de halos translúcidos.
- Regla del repo que sigue en pie: **ampliar la paleta en el doc, no inventar
  colores sueltos**.

---

## 6. Instagram: lo que se sabe

- El tope real de un carrusel son **10 diapositivas** (el generador ya usa
  ese número). Todas comparten proporción.
- Al subir, Instagram **recorta a 1:1 por defecto**: hay que elegir 4:5 a
  mano.
- **No se puede añadir una diapositiva a un carrusel ya publicado.** Se
  repone el post.
- Formato: `feed` 1080×1350 (4:5) para la cuadrícula, `story` 1080×1920 para
  historias y reels.
- **El vídeo sale mudo a propósito.** La música se pone en el editor de
  Instagram, que es donde el audio cuenta para la distribución.
- Estrategia acordada: la cuenta de Camberas estaba vacía, así que se siembra
  la cuadrícula con **varios posts de golpe**, no goteando. El canal de
  distribución real no es Instagram, es el propio producto: cada grupetta
  comparte un enlace dentro de un WhatsApp de hasta 20 personas.
- **La serie de organizadores probablemente no es contenido de Instagram.**
  A los organizadores se les llega directamente; están localizados.

---

## 7. Series montadas

| Serie | Ficheros | Acento |
|---|---|---|
| Grupetta (corredores) | `grupetta-1..8` | Lima |
| Organizadores (el cómo) | `organizadores-1..6` | Naranja |
| La plataforma (el qué) | `plataforma-1..5` | Naranja |
| Sueltos | `faq-corredores`, `manual-seguimiento-gps` | Lima |

En `content/retirados/`: `manual-grupetta.json` y `faq-organizadores.json`,
que solapaban con las series. No están ahí por error, y la carpeta queda
fuera de `node generar-carrusel.js content` porque el expandido no es
recursivo.

Orden de la serie de grupetta, que se ha preguntado más de una vez:

1. ¿Qué es una grupetta?
2. Soy el capo — lleva `"pildora": "Para el capo"`, que sobrescribe la
   etiqueta de portada
3. Soy de la grupetta
4. ¿Quién me ve y cuándo? — privacidad
5. ¡Pinchazo! Que no cunda la calma
6. Ojalá no lo uses — el SOS, con el botón real recortado en portada
7. La ruta entera, como una película — el rewind
8. Enséñala — el cartel de ruta, dos diapositivas a sangre

---

## 8. Cosas del repo que se cruzaron

- **`CartelRuta.tsx` está en `main`, no en esta rama.** Marcaba SALIDA y
  LLEGADA por separado y en una ruta circular se solapaban; el usuario lo
  arregló en el hilo de GPS («SALIDA · META»).
- **Supabase no es alcanzable desde el contenedor.** Las capturas de salidas
  reales hay que sacarlas desde una sesión con acceso.
- **La rama va por detrás de `main`** (decenas de commits). Merge antes de
  abrir el PR a revisión.

---

## 9. Lo único que quedó sin tocar

El usuario adjuntó dos ficheros de la exportación de datos de Instagram
—`following.json` (unas 200 cuentas: organizadores de carreras, clubes de
trail y MTB, marcas) y `followers_1.json` (unas 150)— y se interrumpió antes
de decir qué quería con ellos. **No se analizaron, y no se pidió que se
analizaran.** Hay que preguntar antes de suponer. Lo más plausible, y encaja
con el punto 6: sacar de `following.json` una lista de organizadores a los
que escribir directamente.
