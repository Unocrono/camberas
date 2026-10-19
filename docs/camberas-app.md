# Camberas.app: el siguiente paso

Apuntado el 15-oct-2026, en palabras del dueño:

> Camberas.app será un grupo de apps separadas y unidas. Quiero tener una app de
> inscripciones, una app de seguimiento, una app de cronometraje y resultados, una app de
> grafismo y una app de carreras y organización. Todo ello separado y todo ello unido, que
> pueda haber transferencia de datos de una a otra fácilmente.

Este documento guarda esa idea y lo que ya hay hecho que cuenta para ella. No es un diseño:
el diseño se hará cuando se dé el paso.

## Las cinco apps

| App | Qué hace | Qué hay hoy |
|---|---|---|
| **Inscripciones** | Altas, pagos (Redsys), cupones, dorsales, chips, cesiones, devoluciones, emails y WhatsApp | Dentro de la web (`src/components/admin/RegistrationManagement.tsx` y afines, Edge Functions de pagos y correo) |
| **Seguimiento** | GPS en vivo de corredores y organización, mapas, replay | Web (`/:slug/gps`, `MotoMapViewer`) más las apps `camberas-track` (corredor) y `camberas-motos` (GPS Organización) |
| **Cronometraje y resultados** | Lecturas (Ultra, puestos con móvil, fichero), motor, clasificaciones, publicación, exportación | Web (`/timing`, `/start`, Resultados, Lecturas Crono), receptor del Ultra en el VPS (`receptor-ultra/`), motor automático (PR #11, sin aplicar). Cómo debe funcionar: `docs/libro-cronometraje.md` |
| **Grafismo** | Rótulos y clasificaciones para la retransmisión (OBS) | Web (`src/overlays/`, `src/pages/overlays/`) y el repo `camberas-overlays`; hoy lee de RaceTec (`racetec_*`) |
| **Carreras y organización** | La carrera: ficha, recorridos, rutómetro, documentación, reglamentos, web propia, voluntarios, puestos | Web (panel admin y organizador, `/org` en móvil) |

## Lo que las une

Hoy todo comparte una sola base de datos (Supabase) y un solo bundle web. Lo que ya está pensado
para vivir separado y seguir unido:

- **El patrón token**: la identidad es el puesto (dorsal, dispositivo GPS, punto de cronometraje),
  no la persona. Es lo que permite que una app de móvil o un aparato hable con Camberas sin
  usuarios ni contraseñas. `src/lib/camberasToken.ts` está copiado a propósito en tres repos.
- **Las RPC**: cada app entra por funciones con el token dentro (`ultra_registrar_lecturas`,
  `ultra_receptor_sincronizar`, `link_gps_token`…), no leyendo tablas. Esa es la «transferencia
  de datos de una a otra»: una app expone funciones, la otra las llama.
- **El receptor del Ultra**: ya reparte las mismas lecturas a varios sitios (Camberas, RaceTec,
  el PC, otros servidores). Es el modelo de cómo un dato entra una vez y llega a todas las apps.
- **Las horas**: todas las de carrera son hora de pared y no se convierten nunca
  (`CLAUDE.md`). Cualquier app nueva hereda esa norma.

## Decisiones ya tomadas

- **15-oct-2026, Inscripciones.** «La web de inscripciones ha de ser independiente de las
  carreras: su base de datos, su código y su herramienta para conectar con la carrera y con
  las clasificaciones.» Es decir: Inscripciones es una app aparte, con base propia, y lo que
  la une a las demás es una herramienta de conexión (lo que da a la carrera: inscritos,
  dorsales, chips, atributos de clasificación; lo que recibe de ella: resultados para
  enseñárselos al inscrito). La estructura de datos está en `docs/camberas-app-datos.md`.

## Qué hay que decidir cuando se dé el paso

- Si cada app tiene su base o todas comparten una, y en ese caso cómo se reparte el acceso.
- Qué datos son de quién: la inscripción es de Inscripciones, la lectura de Cronometraje, el
  resultado publicado lo leen Grafismo y Seguimiento. Quién puede escribir dónde.
- Cómo se despliega cada una (hoy: la web por Lovable, el receptor a mano en el VPS, las apps de
  móvil por Expo).
- El orden: lo natural es separar primero lo que ya tiene vida propia (grafismo, seguimiento,
  receptor) y dejar inscripciones y carreras para el final, porque son las que más comparten.
  Ojo: `docs/camberas-app-datos.md` (§2 y §7) propone lo contrario, adelantar Inscripciones por la
  decisión del 15-oct. Está pendiente de que el dueño elija.

## Dónde está lo demás

- `docs/camberas-app-datos.md`: la estructura de datos de las cinco apps y la conexión de Inscripciones.
- `docs/libro-cronometraje.md`: cómo cronometra Camberas (decisiones del 15-oct).
- `docs/analisis-wiclax.md`: Wiclax como referencia y las respuestas del dueño.
- `receptor-ultra/README.md` y `receptor-ultra/pc/README.md`: el Ultra, el VPS y RaceTec.
- `docs/tokens-camberas.md`, `docs/gps-organizacion.md`: tokens y GPS.
