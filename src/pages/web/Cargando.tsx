import { Loader2 } from "lucide-react";

/** Pantalla de carga de la web de la carrera: neutra, sin marca (aún no se sabe cuál) */
export function Cargando({ texto = "Cargando…" }: { texto?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center" style={{ background: "#f4f5f0", color: "#4a5540" }}>
      <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
      <span className="ml-3 text-sm">{texto}</span>
    </div>
  );
}
