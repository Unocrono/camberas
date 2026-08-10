/**
 * Auto-actualización de la PWA.
 *
 * El registro que inyecta vite-plugin-pwa solo busca versión nueva al
 * cargar la página. En una PWA instalada eso casi nunca ocurre (se abre
 * desde el icono y se restaura de segundo plano), así que se queda con
 * la versión vieja indefinidamente. Por eso forzamos la comprobación
 * cada vez que el usuario VUELVE a la app —y no con un temporizador—
 * para no recargar a nadie en mitad de un formulario de inscripción.
 *
 * ⚠️ La recarga NO puede delegarse en el evento "activated" de
 * workbox-window. Verificado en node_modules/workbox-window/Workbox.js
 * (10-ago-2026):
 *
 *  - Línea 93: toda actualización detectada más de
 *    REGISTRATION_TIMEOUT_DURATION (60 s, línea 22) después del registro
 *    se clasifica como "externa". Nuestro update() al volver a la app
 *    entra SIEMPRE por ahí.
 *  - Línea 100: esa rama hace
 *    `registration.removeEventListener('updatefound', ...)`, así que a
 *    partir de la primera comprobación externa workbox deja de escuchar
 *    y los despliegues siguientes ya no producen evento alguno mientras
 *    la página siga abierta.
 *
 * Por eso escuchamos "controllerchange", la señal NATIVA del navegador:
 * el SW nuevo hace clientsClaim, toma el control y el navegador avisa,
 * sin heurísticas de por medio. Ver docs/pwa-actualizacion-org.md.
 */

import { registerSW } from "virtual:pwa-register";

export function setupPwaAutoUpdate(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  // Solo recargamos si YA había un service worker al cargar la página.
  // En la primera visita el SW también toma el control (clientsClaim) y
  // sin esta guarda entraríamos en un bucle de recargas.
  const teniaControlador = !!navigator.serviceWorker.controller;
  let recargando = false;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!teniaControlador || recargando) return;
    recargando = true;
    window.location.reload();
  });

  registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;

      const checkForUpdate = () => {
        registration.update().catch(() => {
          /* sin red o SW no disponible: se reintenta al volver */
        });
      };

      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") checkForUpdate();
      });
      window.addEventListener("focus", checkForUpdate);
    },
  });
}
