# Carruseles de FAQ para Instagram

Generador de carruseles de preguntas frecuentes en la identidad Camberas.
Es un pipeline aparte del resto del repo: no entra en el bundle de Vite ni
toca la web.

```sh
node generar-carrusel.js content/faq-corredores.json --formato=ambos
node generar-carrusel.js content/faq-organizadores.json --formato=feed
```

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
  "titulo": "…",
  "slides": [{ "pregunta": "…", "respuesta": "…", "nota": "opcional" }],
  "cta": "…"
}
```

Un carrusel son como mucho **8 slides**: portada + hasta 6 preguntas +
cierre con CTA. Si el JSON trae más preguntas, el generador lo parte en
varios carruseles (`…-parte-1`, `…-parte-2`) y avisa por consola.

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
