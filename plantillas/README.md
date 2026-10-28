# Carruseles de FAQ para Instagram

Generador de carruseles de preguntas frecuentes en la identidad Camberas.
Es un pipeline aparte del resto del repo: no entra en el bundle de Vite ni
toca la web.

```sh
node generar-carrusel.js content/faq-corredores.json --formato=ambos
node generar-carrusel.js content/faq-organizadores.json --formato=feed

# Varios de golpe, o la carpeta entera (reutiliza un solo navegador)
node generar-carrusel.js content/faq-*.json
node generar-carrusel.js content
```

Con varios ficheros se validan **todos** antes de abrir el navegador: si uno
está mal, te enteras de golpe y no a mitad de una tanda de diez.

`--formato` acepta `feed` (1080×1350, 4:5), `story` (1080×1920, 9:16) o
`ambos`. Por defecto, `ambos`.

Salida en `out/{audiencia}/{slug}/{formato}/01.png, 02.png…` (ignorada por git).

## Puesta en marcha

```sh
npm install
npx playwright install chromium
```

En entornos que ya traen navegador (CI, contenedores) se puede saltar la
descarga apuntando a uno existente:

```sh
CHROMIUM_PATH=/ruta/al/chromium node generar-carrusel.js content/faq-corredores.json
```

## Contenido

El texto vive **solo** en `content/*.json`. La plantilla no lleva ni una
palabra fija.

```json
{
  "audiencia": "corredores",
  "marca": "camberas",
  "tipo": "faq",
  "antetitulo": "opcional",
  "titulo": "…",
  "pildora": "opcional",
  "web": "camberas.com",
  "slides": [
    { "etiqueta": "opcional", "pregunta": "…", "respuesta": "…", "nota": "opcional" }
  ],
  "cta": "…"
}
```

`web` es lo que aparece bajo el CTA del último slide (por defecto
`camberas.com`). Úsalo para mandar a la página concreta —
`camberas.com/grupetta/capo`— en vez de a la portada.

### Imágenes

Un slide admite `imagen` con la ruta **relativa a la raíz del repo**. Se
coloca entre el titular y la explicación, y escala con el bloque: si la
imagen es alta, el texto se encoge para dejarle sitio.

```json
{ "pregunta": "…", "respuesta": "…", "imagen": "capturas/mapa.png" }
```

Con `"aSangre": true` el slide pasa a ser **solo la imagen**, ocupando el
slide entero sin cabecera ni regla, y ya no hace falta texto:

```json
{ "imagen": "capturas/grupetta-mapa.png", "aSangre": true }
```

Con `"pantallazo": true` la imagen puede ocupar bastante más alto. Es para
capturas de móvil, que son 9:19,5: con el tope normal salen como una tira
de 300 px y no se lee la interfaz.

```json
{ "pregunta": "…", "respuesta": "…", "imagen": "capturas/sos.jpeg", "pantallazo": true }
```

Eso es lo que quieren las piezas que **ya traen su propia marca** —el
cartel de ruta sale a 1080×1350 con logo, título y datos—: encajarlas
dentro de un slide normal las dejaría con doble cabecera. Se usa
`contain`, no `cover`: en story sobra alto y es mejor que caiga sobre el
fondo verde a recortar la pieza. Como el cartel comparte ese mismo fondo,
el hueco ni se ve.

### Destacar una palabra en la portada

Rodeando una palabra de asteriscos en `antetitulo` o `titulo` se resalta:

```json
{ "antetitulo": "¿Sabes qué es un *GPX*?", "titulo": "Sí, claro" }
```

En el antetítulo, que va en cuerpo pequeño, el énfasis es de **tamaño**:
la palabra pasa a Archivo Black casi al doble. En el titular, que ya es
enorme, es de **color**: agrandarlo más rompería el bloque.

Solo funciona en la portada, y el texto se escapa antes, así que por ahí
no se cuela HTML.

`pildora` sobrescribe la etiqueta de la portada, que por defecto es
`Para {audiencia}`. Sirve cuando el carrusel apunta a un papel concreto
dentro de la audiencia —«Para el capo»— en vez de a toda ella. Va en
tamaño fijo, así que no la alargues: si no cabe de ancho, el ajuste
encoge el titular entero para hacerle sitio.

Un carrusel son como mucho **8 slides**: portada + hasta 6 de contenido +
cierre con CTA. Si el JSON trae más, el generador lo parte en varios
carruseles (`…-parte-1`, `…-parte-2`) y avisa por consola.

### Dos tipos

`tipo` vale `faq` (por defecto) o `manual`:

| | `faq` | `manual` |
|---|---|---|
| Antetítulo de portada | «Preguntas frecuentes» | «Guía rápida» |
| Sobre cada titular | — | «Paso 1», «Paso 2»… |

Los campos son los mismos en ambos. En un manual, `pregunta` es el título
del paso en imperativo («Dale a Iniciar seguimiento») y `respuesta` la
instrucción. `antetitulo` sobrescribe la etiqueta por defecto si quieres
otra cosa («Truco rápido», «En 30 segundos»…).

El contador de la cabecera cuenta **slides**, no pasos: en un manual de 5
pasos el tercero es `4/7`, porque la portada va delante.

`etiqueta` en un slide manda sobre la numeración automática. Hace falta
en cuanto el carrusel mezcla pasos con slides que no lo son —«El
problema», «Y además»—, porque ahí «Paso N» se descuadra: pon la etiqueta
a mano en todos y numera tú los que toque.

## Marca

Ambas audiencias son Camberas y comparten estructura, logo y fondo. Lo
único que cambia es el color de acento:

| Audiencia | Acento | Hex |
|---|---|---|
| corredores | Lima | `#C8E85C` |
| organizadores | Naranja Camberas | `#EC7C2B` |

Fondo verde tinta `#0E2419`, texto crema `#FAF6EC` y colinas en sus tres
tonos, todo de `docs/paleta-camberas.md`. **No inventes colores sueltos**:
si hace falta uno nuevo, se amplía primero la paleta en ese doc.

El logo son los mismos paths que `src/components/CamberasLogo.tsx`. Si se
retoca allí, hay que copiarlo aquí.

## Tipografía adaptativa

Las respuestas varían mucho de longitud, así que cada slide escala su
bloque de texto entero —pregunta, respuesta y nota juntas— buscando por
bisección la escala más grande que sigue cabiendo, entre `0.55` y `1.90`
del tamaño base. Coger el máximo que entra es lo que evita a la vez que
el texto desborde y que el slide quede medio vacío.

La medida comprueba **alto y ancho**: una palabra larga que no puede
partirse cabe de alto pero se sale por el lado.

Si un texto no cabe ni al mínimo, el generador avisa por consola diciendo
qué slide hay que acortar en lugar de entregar un PNG con el texto cortado.

## Fuentes

Archivo Black y Barlow Semi Condensed (las mismas que enlaza `index.html`)
van autoalojadas en `fuentes/`, bajo SIL Open Font License 1.1. El render
no puede depender de la red: sin ellas los PNG salen con otra tipografía,
y con las fuentes cargadas por CDN eso pasaba en silencio.

## Recortar una pieza de un pantallazo

`plantillas/herramientas/recortar.mjs` saca un trozo de una captura y le
cambia el fondo de la app por el del carrusel, para que no se vea el
rectángulo pegado:

```sh
node plantillas/herramientas/recortar.mjs \
  capturas/sos-1-boton.jpeg capturas/sos-boton-recorte.png 178 898 380 212
```

Los cuatro números son `x y ancho alto` en píxeles del original. El
recorte se hace en el navegador con canvas y el script escribe el PNG
directamente: no hace falta ninguna librería de imagen.

La sustitución de fondo va con caída suave —cerca del verde de la app se
reemplaza entero, en la franja de transición se mezcla— para que el borde
del círculo no quede con halo.

Para ponerlo en la portada de un carrusel:

```json
{ "titulo": "…", "imagenPortada": "capturas/sos-boton-recorte.png" }
```

## Mapa de una carrera desde su GPX

`plantillas/herramientas/mapa.mjs` dibuja el recorrido con la paleta de
Camberas: la traza, los avituallamientos, los vehículos de organización
—cada uno con su color— y el pelotón, con el cierre detrás del último y su
estela naranja, que es lo que hace que se lea «moviéndose».

```sh
node plantillas/herramientas/mapa.mjs public/gpx/desafio-picota-2027-trail.gpx capturas/mapa.png
```

Sale a 1080×1080 sobre el mismo verde tinta que los slides, así que encaja
sin recorte ni marco. **No es un pantallazo de Mapbox a propósito**: el mapa
real mete su propio gris y su interfaz, y a tamaño de Instagram no se lee
nada.

Los puntos salen de los **`<wpt>` del propio GPX**, agrupados por su `<sym>`,
que es lo que rellenan los programas de rutas:

| `sym` | Sale como |
|---|---|
| `Picnic Area`, `Drinking Water` | Avituallamiento |
| `Pharmacy` | Ambulancia / médico |
| `Information` | Control cronometrado |
| `Crossing` | Cruce |

Por defecto se dibujan avituallamientos y sanitarios. Lo de la zona de meta
—parkings, duchas, baños, comedor— se deja fuera: son quince chinchetas en
el mismo sitio y tapan el dibujo.

```sh
node plantillas/herramientas/mapa.mjs public/gpx/gurriana-trail-2027-gt40.gpx capturas/mapa.png
node plantillas/herramientas/mapa.mjs ruta.gpx mapa.png --mostrar=avituallamiento,sanitario,control
```

**Si la traza no trae waypoints** —la Picota, por ejemplo— se colocan a mano
por fracción del recorrido:

```sh
node plantillas/herramientas/mapa.mjs ruta.gpx mapa.png --avituallamientos="0.20,0.44,0.80"
```

Los vehículos y el pelotón siguen fijados arriba del fichero (`VEHICULOS`,
`CORREDORES`), también en fracción.

**Cuidado con la forma de la traza.** El lienzo es cuadrado, así que un
recorrido mucho más ancho que alto sale como una tira y no se lee: el GT40
de la Gurriana mide 0,16° de ancho por 0,03° de alto y no vale para esto.
Un circular compacto como la Picota es lo que mejor encaja.

### Posiciones reales, no inventadas

Si la traza trae la hora de cada punto —una grabada con la app trae **una
posición por segundo**— el avance va a su **ritmo real**: el 50 % de la
simulación es donde el corredor iba por la mitad de su carrera, no por la
mitad de los kilómetros. En las subidas el marcador se arrastra y en las
bajadas se suelta, como pasó de verdad.

La herramienta lo dice al arrancar:

```
  tiempo real: 3624 posiciones grabadas, el avance va a su ritmo
```

Si la traza no trae horas —las rutas dibujadas y exportadas no suelen
traerlas— avisa y vuelve al ritmo constante. `--sin-tiempo` lo fuerza.

### La simulación

Con `--video` el mapa deja de ser una foto: la escoba recorre la traza, el
pelotón va por delante, la cámara runner abre carrera y **los avituallamientos
se apagan según pasa el cierre**, que es literalmente lo que cuenta el
carrusel.

```sh
node plantillas/herramientas/mapa.mjs ruta.gpx mapa.png \
  --avituallamientos="0.20,0.44,0.80" --video=out/simulacion.mp4 --segundos=11
```

Con `--reel` sale en **1080×1920** con la marca, el titular y el pie, todo
dentro de la franja 280–1640 que Instagram no tapa con su interfaz:

```sh
node plantillas/herramientas/mapa.mjs ruta.gpx mapa-reel.png \
  --avituallamientos="0.20,0.44,0.80" --reel \
  --titulo="¿Dónde está el cierre?" --pie="GPS Organización · camberas.com" \
  --video=out/simulacion-reel.mp4 --segundos=11
```

Sin `--reel` sale a 1080×1080, 20 fps, H.264. Los fotogramas no recargan la página: se
le cambia el contenido al SVG y se vuelve a capturar, que con doscientos
fotogramas la diferencia se nota mucho.

La ambulancia no se mueve: es un puesto fijo, no un vehículo que siga a
nadie.

Hace falta el mismo ffmpeg con libx264 que el montador de vídeo — ver más
abajo.

El dibujo va en tres capas —trazas, pines y etiquetas— y las etiquetas van
siempre las últimas: si se mezclan, un punto de corredor o un pin cae encima
de una etiqueta y se come media palabra.

Dos cosas que ya costaron una vuelta:

- El HTML se escribe **dentro de `plantillas/`** y se abre con `goto`. Con
  `setContent` la página es `about:blank`, no resuelve el `file://` de la
  hoja de fuentes y el PNG sale en serif sin avisar.
- La estela va a **opacidad plena**. El naranja translúcido sobre el verde
  tinta se vuelve marrón, igual que el rojo (está apuntado en
  `docs/paleta-camberas.md`). Para que se lea la dirección, se estrecha
  hacia atrás en dos tramos en vez de desvanecerse.

## QR con el logo en el centro

`plantillas/herramientas/qr.mjs` saca un QR en la identidad de Camberas:
módulos en verde tinta sobre tarjeta crema, con el logo en el hueco central.

```sh
node plantillas/herramientas/qr.mjs https://camberas.com/organizadores capturas/qr.png
```

Va en corrección **H**, que tolera perder un 30 % del código: eso es lo que
permite taparle el centro. El hueco es `LOGO_F` (0,23 del lado); por encima
de 0,26 deja de leerse.

**Oscuro sobre claro, no al revés.** Un QR en negativo lo rechazan bastantes
lectores, y la gracia es que la gente lo escanee de la pantalla.

El logo se lee de `plantillas/carrusel-faq.html` en vez de copiarlo otra
vez: ya hay una copia en `src/components/CamberasLogo.tsx` y con tres sería
cuestión de tiempo que se separasen.

**Cada QR se decodifica antes de darlo por bueno.** Taparle el centro puede
dejarlo ilegible sin que nada lo avise —el PNG sale precioso y no lo lee
ningún móvil—, así que la herramienta lo lee y falla si no coincide con lo
que se le pidió.

## Vídeo a partir de un carrusel

`plantillas/herramientas/video.mjs` encadena los PNG ya renderizados en un
MP4, con un fundido corto entre slides:

```sh
# Reel / story vertical
node plantillas/herramientas/video.mjs out/corredores/<slug>/story reel.mp4

# Vídeo de feed, 4:5
node plantillas/herramientas/video.mjs out/corredores/<slug>/feed feed.mp4
```

Cada slide se queda el tiempo de leerlo: 2,6 s la portada, 4 s los de
contenido y 3,4 s el cierre. Un carrusel de 7 sale en unos 24 s, que es
buena duración de Reel.

`--sustituir=4:simulacion.mp4` cambia ese slide por un vídeo. Es lo que
permite meter la simulación del mapa dentro del reel, en el sitio del slide
que llevaba el mapa quieto:

```sh
node plantillas/herramientas/video.mjs out/corredores/<slug>/story reel.mp4 \
  --ritmo=1.3 --sustituir=4:out/simulacion-reel.mp4
```

Todas las entradas se igualan antes de encadenarlas (`settb`, `setpts`,
`format` y `fps` **el último**, que si no el enlace pierde la tasa y xfade
se planta con «current rate of 1/0 is invalid»). Los PNG en bucle llevan su
`-framerate` en la entrada por lo mismo.

`--ritmo=N` estira o encoge todos los tiempos a la vez, fundido incluido.
Con `1.3` el mismo carrusel de 7 se va a 31 s, que se lee mucho más
tranquilo; con `0.8` queda más nervioso.

```sh
node plantillas/herramientas/video.mjs out/organizadores/<slug>/story reel.mp4 --ritmo=1.3
```

**Hace falta un ffmpeg con libx264.** El que trae Playwright en
`/opt/pw-browsers` NO vale: está compilado con `--disable-everything` y
solo saca WebM/VP8, que Instagram no admite. Se busca en este orden:
`FFMPEG_PATH` → `ffmpeg` del PATH → `node_modules/ffmpeg-static`.

```sh
npm i -D ffmpeg-static      # o instala ffmpeg en el sistema
```

El vídeo sale **mudo**: la música se pone en el propio editor de
Instagram, que además es donde el audio cuenta para la distribución.
