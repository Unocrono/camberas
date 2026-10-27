# Piezas aprobadas

Lo que el cliente ha dado por bueno y no se regenera a la ligera. El resto
sale en `out/`, que está ignorado por git y muere con el contenedor.

Cada pieza lleva aquí su receta: si hay que rehacerla, se rehace igual.

---

## `reel-donde-esta-el-cierre.mp4`

Reel de GPS Organización, 1080×1920, 29,5 s. Abre con la simulación del mapa
—que ya lleva el titular dentro, así que no hay portada— y sigue con el
problema, el QR, el cierre y el CTA.

Aprobado el 27-oct-2026.

```sh
# 1 · El QR de marca (si no está ya en capturas/)
node plantillas/herramientas/qr.mjs https://camberas.com/organizadores capturas/qr-camberas.png

# 2 · El mapa y la simulación en vertical
node plantillas/herramientas/mapa.mjs \
  public/gpx/desafio-picota-2027-trail.gpx capturas/mapa-reel.png \
  --avituallamientos="0.20,0.44,0.80" --reel \
  --titulo="¿Dónde está el cierre?" --pie="GPS Organización · camberas.com" \
  --video=out/videos/simulacion-cierre-reel.mp4 --segundos=11

# 3 · El mapa cuadrado que va dentro del slide del cierre
node plantillas/herramientas/mapa.mjs \
  public/gpx/desafio-picota-2027-trail.gpx capturas/mapa-organizacion.png \
  --avituallamientos="0.20,0.44,0.80"

# 4 · Los slides
node generar-carrusel.js content/app-org-2-gps-organizacion.json --formato=ambos

# 5 · El reel, con la simulación en el sitio de la portada
node plantillas/herramientas/video.mjs \
  out/organizadores/donde-esta-el-cierre/story \
  out/videos/reel-cierre-completo.mp4 \
  --ritmo=1.3 --sustituir=1:out/videos/simulacion-cierre-reel.mp4
```

El GPX es el de la Picota y no el de la Gurriana a propósito: el GT40 mide
casi 4:1 y en un lienzo cuadrado sale como una tira.

Quedó pendiente, por si alguien lo retoma: el mapa sale dos veces (la
simulación y luego quieto en el slide del cierre), 29,5 s es un reel largo,
y las etiquetas del cierre y la ambulancia se cruzan un par de segundos
cuando uno alcanza al otro.
