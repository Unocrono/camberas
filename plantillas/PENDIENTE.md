# Estado y pendientes de los carruseles

Lo que hay hecho está en `content/` y se regenera entero con
`node generar-carrusel.js content`. El porqué de cada decisión y las trampas
ya resueltas están en `plantillas/TRASPASO.md`.

## Series montadas

| Serie | Ficheros | Acento | Estado |
|---|---|---|---|
| Grupetta (corredores) | `grupetta-1..8` | Lima | 8 carruseles, completos |
| Organizadores (recorrido) | `organizadores-1..6` | Naranja | 6 carruseles, completos |
| La plataforma (pilares) | `plataforma-1..5` | Naranja | 5 carruseles, completos |
| Camberas Track (app) | `track-1..2` | Lima | 2 carruseles, completos |
| Sueltos | `faq-corredores`, `manual-seguimiento-gps` | Lima | Ver pendientes |

Retirado en `content/retirados/`: `manual-grupetta.json` y
`faq-organizadores.json`, que solapaban con las series.

## Pendientes

1. **Capturas del SOS: hechas.** Las tres están en `capturas/`
   (`sos-1-boton`, `sos-2-motivo`, `sos-3-confirmacion`). El botón sale
   recortado y con el fondo remapeado en `sos-boton-recorte.png`, que es la
   portada de `grupetta-6-seguridad.json`. El carrusel del pinchazo se quedó
   en 9 slides, con margen de uno hasta el tope de Instagram.

2. **«Sin comisión por inscripción»** no está escrito en ningún carrusel
   porque no se ha podido confirmar. Si no hay comisión sobre el precio de
   la inscripción, es el argumento más fuerte de
   `plataforma-1-que-es-camberas.json` y de `organizadores-1`.

3. **`faq-corredores.json`** es la FAQ suelta del principio, sin gancho.
   Conviene reescribirla como recorrido de corredor: inscribirse sin
   cuenta, el día de la carrera, buscar tu resultado.

4. **Solape entre series de organizadores.** `organizadores-*` cuenta el
   *cómo se hace* y `plataforma-*` el *qué hacemos*; se pisan en
   inscripciones, cronometraje y la pieza de entrada. No publicarlas
   seguidas en el mismo feed sin decidir cuál manda.

5. **Cronometraje: lecturas RFID.** `plataforma-5` dice que las lecturas
   **se importan**, no que se capturen en directo, porque solo existe
   `RFIDImportDialog` (parsea un fichero) y no hay nada que hable por
   TCP/IP con un equipo. Si la captura en vivo existe en otra rama, ese
   carrusel se queda corto y hay que reescribirlo.

6. **La rama va por detrás de `main`.** Conviene mergear antes de abrir a
   revisión el PR.

7. **Reponer el post del pinchazo.** Lo publicado tiene 7 slides y el JSON
   va por 9, así que los contadores «n/7» no cuadran con lo que se regenera.
   La cuenta no tenía audiencia cuando se publicó: no se pierde nada.

8. **La app nativa contradice a los carruseles viejos.** Camberas Track ya
   está publicada en App Store y Google Play, y los de `track-*` mandan a
   la tienda. Pero `grupetta-3-soy-miembro` sigue mandando a instalar la
   PWA desde `camberas.com/descargas`, y `manual-seguimiento-gps` explica
   el tracker web («entra en Tracking GPS, con tu cuenta iniciada»), que es
   otro camino distinto. Se decidió no tocarlos de momento. Cuando se
   toquen, hay que decidir qué vía es la buena para cada caso: el QR del
   dorsal en carrera y el código de seis letras en grupetta.

9. **`camberas.com/descargas` no existe como ruta en el repo.** Es el `web`
   de `track-1`, `track-2` y `grupetta-3`, así que conviene crearla y que
   reparta a las dos tiendas.

10. **`public/activar.html` sigue ofreciendo TestFlight** (`btn secondary`
    → «iPHONE — TESTFLIGHT (beta)»). Con la app publicada, ese enlace
    manda a la beta en vez de a la ficha de App Store.

## Fuera de este repo

- El cartel de ruta lo genera `src/components/CartelRuta.tsx`, que está en
  `main`, no en esta rama.
- Supabase no es alcanzable desde un contenedor en la nube, así que las
  capturas de salidas reales hay que sacarlas desde una sesión con acceso.
