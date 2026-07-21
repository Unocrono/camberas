/**
 * Auto-actualización de la PWA.
 *
 * El registro que inyecta vite-plugin-pwa solo busca versión nueva al
 * cargar la página. En una PWA instalada eso casi nunca ocurre (se abre
 * desde el icono y se restaura de segundo plano), así que se queda con
 * la versión vieja indefinidamente.
 *
 * Aquí forzamos la comprobación cada vez que el usuario VUELVE a la app.
 * Con registerType "autoUpdate", al detectarse una versión nueva el
 * service worker la aplica y recarga. Se comprueba al recuperar el foco
 * —y no con un temporizador— para no recargar a alguien en mitad de un
 * formulario de inscripción.
 */

import { registerSW } from "virtual:pwa-register";

export function setupPwaAutoUpdate(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;

      const checkForUpdate = () => {
        // update() descarga el SW nuevo si lo hay; autoUpdate hace el resto
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
