// Árbol de rutas de la web de una carrera bajo su propio dominio
// (desafio-sarrio.com). Solo existe esa carrera, en la raíz; no hay sesión
// de usuario ni marco de Camberas. Lo que exige cuenta (dashboard, retomar
// pago, mi dorsal, equipos) enlaza en absoluto a camberas.com.
import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import PaginaCarrera from "./pages/web/PaginaCarrera";
import PaginaReglamento from "./pages/web/PaginaReglamento";
import PaginaRecorrido from "./pages/web/PaginaRecorrido";
import PaginaInscripcionResultado from "./pages/web/PaginaInscripcionResultado";
import PaginaLegal from "./pages/web/PaginaLegal";
import NoEncontradoWeb from "./pages/web/NoEncontradoWeb";
import { Cargando } from "./pages/web/Cargando";

// Clasificaciones y GPS en vivo pesan (mapas, gráficas): solo se descargan si
// el corredor entra en ellas
const LiveResults = lazy(() => import("./pages/LiveResults"));
const LiveGPSTracking = lazy(() => import("./pages/LiveGPSTracking"));
const SplitClassification = lazy(() => import("./pages/SplitClassification"));

const queryClient = new QueryClient();

const AppWebPropia = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Suspense fallback={<Cargando />}>
          <Routes>
            <Route path="/" element={<PaginaCarrera />} />
            <Route path="/reglamento" element={<PaginaReglamento />} />
            <Route path="/recorrido/:pruebaId" element={<PaginaRecorrido />} />
            <Route path="/inscripcion/ok" element={<PaginaInscripcionResultado resultado="ok" />} />
            <Route path="/inscripcion/ko" element={<PaginaInscripcionResultado resultado="ko" />} />
            <Route path="/aviso-legal" element={<PaginaLegal />} />
            <Route path="/privacidad" element={<PaginaLegal />} />
            <Route path="/cookies" element={<PaginaLegal />} />
            <Route path="/live" element={<LiveResults />} />
            <Route path="/live/split/:checkpointOrder" element={<SplitClassification />} />
            <Route path="/gps" element={<LiveGPSTracking />} />
            <Route path="*" element={<NoEncontradoWeb />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default AppWebPropia;
