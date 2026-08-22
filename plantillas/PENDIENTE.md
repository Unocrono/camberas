# Estado y pendientes de los carruseles

Traspaso para retomar en otra sesión. Lo que hay hecho está en `content/`
y se regenera entero con `node generar-carrusel.js content`.

## Series montadas

| Serie | Ficheros | Acento | Estado |
|---|---|---|---|
| Grupetta (corredores) | `grupetta-1..8` | Lima | 8 carruseles, completos |
| Organizadores (recorrido) | `organizadores-1..6` | Naranja | 6 carruseles, completos |
| La plataforma (pilares) | `plataforma-1..5` | Naranja | 5 carruseles, completos |
| Sueltos | `faq-corredores`, `manual-seguimiento-gps` | Lima | Ver pendientes |

Retirado en `content/retirados/`: `manual-grupetta.json` y
`faq-organizadores.json`, que solapaban con las series.

## Pendientes

1. **Capturas del SOS en el carrusel del pinchazo.** Faltan dos JPEG en
   `capturas/`: el botón «Mantén pulsado 2 s» y el selector de motivo con
   «Avería o pinchazo, estoy reparando». Van con `"pantallazo": true` en
   `grupetta-5-percances.json`. La tercera captura (la confirmación con el
   aviso del 112) va en `grupetta-6-seguridad.json`.
   Con las dos, el pinchazo llega a 10 slides, que es el tope de Instagram:
   valorar quitar el slide «Desde casa».

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

7. **El post del pinchazo ya publicado tiene 7 slides**, pero el JSON ya
   va por 8 (entró el slide del motivo de SOS). Los contadores «n/7» de lo
   publicado no cuadran con lo regenerado: hay que reponer el post.

## Fuera de este repo

- El cartel de ruta lo genera `src/components/CartelRuta.tsx`, que está en
  `main`, no en esta rama.
- Supabase no es alcanzable desde un contenedor en la nube, así que las
  capturas de salidas reales hay que sacarlas desde una sesión con acceso.
