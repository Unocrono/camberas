import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { setupPwaAutoUpdate } from "./lib/pwaUpdate";
import { GA4_CAMBERAS, iniciarAnalytics } from "./lib/analytics";
import { resolverTenant } from "./tenant/resolverTenant";
import { TenantProvider } from "./tenant/TenantContext";
import DominioSinConfigurar from "./pages/web/DominioSinConfigurar";
// Escucha el aviso de instalación de Chrome desde el arranque (puede llegar
// antes de que se monte la pantalla que ofrece el botón "Instalar app")
import "./lib/instalarPwa";

// Un trozo de la web que no llega al navegar (se publicó una versión nueva
// con la página abierta y el trozo viejo ya no existe): en vez de dejar la
// pantalla rota, la misma autocuración que index.html (borrar caché y
// recargar una vez)
window.addEventListener("vite:preloadError", (evento) => {
  const curar = (window as unknown as { __camberasCurar?: () => void }).__camberasCurar;
  if (curar) {
    evento.preventDefault();
    curar();
  }
});

// Antes de montar nada: ¿es camberas.com o el dominio propio de una carrera?
// (src/tenant/resolverTenant.ts). Bajo un dominio propio no se registra el
// service worker de Camberas (y se retira si lo hubiera): la web de la
// carrera no es una PWA y no debe cachear la app entera en un dominio ajeno.
async function arrancar() {
  const raiz = createRoot(document.getElementById("root")!);
  const tenant = await resolverTenant();

  if (tenant === "desconocido") {
    raiz.render(<DominioSinConfigurar />);
    return;
  }

  if (tenant) {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => undefined);
    }
  } else {
    setupPwaAutoUpdate();
    // GA4 de Camberas solo en camberas.com (antes iba en index.html y se
    // disparaba también bajo los dominios propios de las carreras)
    iniciarAnalytics(GA4_CAMBERAS);
  }

  raiz.render(
    <TenantProvider tenant={tenant}>
      <App />
    </TenantProvider>,
  );
}

arrancar();
