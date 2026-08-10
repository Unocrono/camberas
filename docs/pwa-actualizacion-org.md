# Actualización automática de la PWA (Camberas Org) — verificación

Fecha de la verificación: **10-ago-2026**. Motivo: la sospecha de que la app
solo mostraba los cambios tras borrar la caché a mano.

Este documento recoge **qué se comprobó, cómo y con qué resultado**, para poder
repetirlo tal cual la próxima vez en lugar de suponer.

## Resultado corto

La cadena de auto-actualización está **completa y correcta** en producción. No
falta activar nada. Los seis eslabones se verificaron uno a uno y todos pasan.

## Comprobaciones (repetibles)

### 1. El service worker está desplegado

```bash
curl -sI https://camberas.com/sw.js | head -1
```

Resultado: **HTTP 200**.

### 2. El SW se salta la espera y toma el control

Sin `skipWaiting`, un SW nuevo se queda en estado *waiting* hasta que se cierran
todas las pestañas — que es exactamente el síntoma de "no cambia hasta que borro
la caché".

```bash
curl -s https://camberas.com/sw.js | grep -c "skipWaiting"   # 1
curl -s https://camberas.com/sw.js | grep -c "clientsClaim"  # 1
```

Resultado: **ambos presentes**.

### 3. Las cabeceras no cachean lo que no se debe cachear

```bash
curl -sI https://camberas.com/sw.js | grep -i cache-control   # no-cache
curl -sI https://camberas.com/      | grep -i cache-control   # no-cache, must-revalidate, max-age=0
```

Resultado: **correcto**. Los `/assets/*` sí se cachean para siempre, pero llevan
hash en el nombre: un cambio genera un nombre nuevo.

### 4. El SW desplegado corresponde al build desplegado

Si el `sw.js` fuera de un build anterior, precachearía ficheros que ya no
existen y nunca traería los nuevos.

```bash
curl -s https://camberas.com/ | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1
curl -s https://camberas.com/sw.js | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1
```

Resultado: **los dos dan el mismo fichero**. Coinciden.

### 5. El script importado no rompe la instalación

`workbox.importScripts: ["/push-sw.js"]` se ejecuta durante el *install* del SW.
Si ese fichero diera 404, la instalación abortaría y el SW viejo seguiría
mandando indefinidamente.

```bash
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" https://camberas.com/push-sw.js
```

Resultado: **200 text/javascript**.

### 6. El bundle desplegado recarga al activarse un SW nuevo

Este es el eslabón que de verdad importa: `skipWaiting` hace que el SW nuevo
tome el control, pero la página que ya está abierta sigue ejecutando el
JavaScript viejo que tiene en memoria. Hace falta una recarga.

```bash
curl -s https://camberas.com/assets/index-XXXX.js | grep -oE '.{80}location\.reload\(\).{40}'
```

Resultado (desminificado):

```js
wb.addEventListener("activated", (e) => {
  (e.isUpdate || e.isExternal) && (onNeedReload ? onNeedReload() : window.location.reload())
})
```

`onNeedReload` es un callback opcional que **no pasamos** en
`src/lib/pwaUpdate.ts`, así que la rama que se ejecuta es `window.location.reload()`.
Verificado también que el destructuring del bundle es
`{immediate, onNeedReload, onNeedRefresh, onOfflineReady, onRegistered, onRegisteredSW, onRegisterError}`.

### 7. Comportamiento en un navegador real

Con las herramientas de navegador, sobre `https://camberas.com`:

```js
await navigator.serviceWorker.getRegistrations()
await caches.keys()
```

Resultado: **1 registro**, scope `https://camberas.com/`, que pasa de
`installing` a `activated` y toma el control (`navigator.serviceWorker.controller`
deja de ser `null`). Una única caché, `workbox-precache-v2-https://camberas.com/`,
con **34 entradas**, incluyendo `index.html` con su `__WB_REVISION__`.

## Lo que NO se puede verificar sin un despliegue

El ciclo entero de actualización (build nuevo → SW nuevo → recarga automática)
necesita **dos versiones distintas** en producción. Los seis puntos de arriba
verifican que cada pieza está en su sitio; la prueba de extremo a extremo hay que
hacerla contra el siguiente Publish.

## Fallo encontrado en workbox-window (y cómo se arregló)

Tras las comprobaciones anteriores seguía haciendo falta un Ctrl+Shift+R para ver
los cambios. La causa está en `node_modules/workbox-window/Workbox.js`, verificada
leyendo el código (no deducida):

**a) Nuestras comprobaciones se clasifican siempre como "externas".** Línea 93:

```js
performance.now() > this._registrationTime + REGISTRATION_TIMEOUT_DURATION
```

`REGISTRATION_TIMEOUT_DURATION` son 60 000 ms (línea 22). Como
`src/lib/pwaUpdate.ts` llama a `registration.update()` al volver a la app —
siempre bastante más de 60 s después del registro— toda actualización nuestra
entra por la rama "externa".

**b) Esa rama se desactiva a sí misma.** Línea 100:

```js
if (updateLikelyTriggeredExternally) {
    this._externalSW = installingSW;
    registration.removeEventListener('updatefound', this._onUpdateFound);
}
```

Deja de escuchar `updatefound`. A partir de la primera comprobación externa,
mientras la página siga abierta, ningún despliegue posterior genera evento; sin
`updatefound` no hay `activated`, y sin `activated` no se ejecuta el
`window.location.reload()` de vite-plugin-pwa.

**Arreglo:** no depender de esa heurística y escuchar la señal **nativa** del
navegador, que no tiene clasificaciones ni temporizadores:

```js
const teniaControlador = !!navigator.serviceWorker.controller;
navigator.serviceWorker.addEventListener("controllerchange", () => {
  if (!teniaControlador || recargando) return;   // guarda anti-bucle
  recargando = true;
  window.location.reload();
});
```

El SW nuevo hace `clientsClaim()` (verificado en el punto 2), toma el control y el
navegador dispara `controllerchange`. La guarda `teniaControlador` evita el bucle
de recargas en la primera visita, donde el SW también toma el control por primera
vez.

Verificado en el build: la cadena `controllerchange` aparece una vez en
`dist/assets/index-*.js` con la lógica correcta.

## Dos hechos del mecanismo que conviene conocer

Ninguno de los dos es un fallo, pero explican por qué a veces "parece" que no se
actualiza:

1. **Siempre se ve una vez el contenido viejo.** La página se sirve desde la
   precaché *antes* de que el SW nuevo se instale. La secuencia es: abres → ves
   lo viejo → el SW nuevo se instala y precachea (34 ficheros, ~7,5 MB) → activa
   → recarga → ves lo nuevo. Con mala cobertura, esos segundos se notan.

2. **La comprobación es al volver a la app, no periódica.** `pwaUpdate.ts` llama
   a `registration.update()` en `visibilitychange` y `focus`, deliberadamente y
   no con un temporizador, para no recargar a nadie en mitad de un formulario de
   inscripción.

## Causa documentada del episodio del 10-ago

Durante la sesión se comprobó por `curl` que producción servía un bundle que
**todavía contenía `key:"carreras"`** cuando el repo ya tenía el grupo eliminado
(commit `12bafdf`). Es decir: en ese momento el problema no era la caché del
navegador, era que **el Publish de Lovable no se había hecho**. Al repetir la
comprobación más tarde, el mismo `grep` daba 0.

**Regla práctica:** antes de culpar a la caché, comprobar qué sirve producción:

```bash
B=$(curl -s https://camberas.com/ | grep -oE '/assets/index-[^"]*\.js' | head -1)
curl -s "https://camberas.com$B" | grep -c "TEXTO_QUE_BUSCO"
```

Si da 0, el código no está desplegado y no hay caché que valga.
