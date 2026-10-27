# Grabar la app de organizador

Graba un recorrido por `/org` con **datos simulados**, sin tocar la base de
datos de verdad. No son pantallazos pegados: es la app corriendo en el
servidor de desarrollo con Supabase interceptado, así que salen las
transiciones y los despliegues como se ven de verdad.

```sh
# 1 · El servidor. OJO: --host 127.0.0.1, que vite.config.ts pide "::"
#     (IPv6) y en el contenedor no hay.
npm run dev -- --host 127.0.0.1

# 2 · La grabación
node plantillas/herramientas/demo/grabar.mjs out/videos/org-demo.mp4
```

## Por qué está simulado y no es la carrera demo real

Supabase **no es alcanzable** desde el contenedor: la política de red del
entorno rechaza `*.supabase.co`. Pero es que además el encargo pedía datos
simulados, así que no es un apaño: `datos.mjs` define la carrera, los
inscritos, los voluntarios y los documentos, y `servidor.mjs` los sirve
interceptando las llamadas.

La sesión se siembra en `localStorage` (`sb-<ref>-auth-token`) antes de que
arranque la app, y `has_role` contesta que sí a `organizer`. Con eso la app
entra sin pasar por el login.

## Qué hace falta para que una pantalla pinte

Cada pantalla pide lo suyo. Si sale vacía, `sonda.mjs` lo dice:

```sh
node plantillas/herramientas/demo/sonda.mjs
```

Apunta todas las llamadas a Supabase y las imprime agrupadas. Lo que salga y
no esté en `TABLAS` o `RPCS` de `datos.mjs` es lo que falta por simular.

## Dos trampas que ya costaron una vuelta

- **`recordVideo` no escala la página.** Si le pides un lienzo de 1080×1920
  con el móvil a 540×960, te deja la web en una esquina y el resto gris. Se
  graba al tamaño del móvil y se sube a 1080 con ffmpeg.
- **El dedo hay que pintarlo.** Playwright pulsa sin dejar rastro; sin el
  círculo naranja no se entiende que alguien está tocando la pantalla.
