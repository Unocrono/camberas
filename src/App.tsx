// Camberas App - Race Management Platform
//
// Dos árboles de rutas, uno por "casa":
//  - AppCamberas: camberas.com (previas, localhost). Toda la plataforma.
//  - AppWebPropia: el dominio propio de una carrera. Solo su web.
// El tenant lo resuelve main.tsx antes de montar (src/tenant/resolverTenant.ts)
// y llega por TenantContext. Los dos árboles se cargan con lazy: bajo un
// dominio propio nunca se descarga el panel, el cronometraje ni los overlays.
import { lazy, Suspense } from "react";
import { useTenant } from "./tenant/TenantContext";
import { Cargando } from "./pages/web/Cargando";

const AppCamberas = lazy(() => import("./AppCamberas"));
const AppWebPropia = lazy(() => import("./AppWebPropia"));

const App = () => {
  const { modo } = useTenant();
  return <Suspense fallback={<Cargando texto="" />}>{modo === "propia" ? <AppWebPropia /> : <AppCamberas />}</Suspense>;
};

export default App;
