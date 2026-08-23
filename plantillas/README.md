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

**Hace falta un ffmpeg con libx264.** El que trae Playwright en
`/opt/pw-browsers` NO vale: está compilado con `--disable-everything` y
solo saca WebM/VP8, que Instagram no admite. Se busca en este orden:
`FFMPEG_PATH` → `ffmpeg` del PATH → `node_modules/ffmpeg-static`.

```sh
npm i -D ffmpeg-static      # o instala ffmpeg en el sistema
```

El vídeo sale **mudo**: la música se pone en el propio editor de
Instagram, que además es donde el audio cuenta para la distribución.
