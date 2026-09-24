import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { setupPwaAutoUpdate } from "./lib/pwaUpdate";
// Escucha el aviso de instalación de Chrome desde el arranque (puede llegar
// antes de que se monte la pantalla que ofrece el botón "Instalar app")
import "./lib/instalarPwa";

setupPwaAutoUpdate();

createRoot(document.getElementById("root")!).render(<App />);
