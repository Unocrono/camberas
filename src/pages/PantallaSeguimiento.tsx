/**
 * Pantalla de seguimiento — el mapa de la carrera para proyectar en la carpa.
 *
 * Sin navegación, sin menús y sin login: la identidad es el PUESTO, no la
 * persona, igual que el cronometrador y los dorsales GPS. La URL lleva el
 * token y el dispositivo que la abre ES esa pantalla.
 *
 * Se diferencia del mapa público en una cosa que importa: aquí las alertas SOS
 * llevan dorsal y nombre. Quien mira esta pantalla es quien tiene que mandar la
 * ayuda; quien mira el mapa público, no.
 *
 * Pensada para quedarse encendida horas: mantiene la pantalla despierta si el
 * navegador lo permite, y no tiene nada que caduque.
 */
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { LiveGPSMap } from "@/components/LiveGPSMap";
import { AlertCircle, Loader2, Maximize2 } from "lucide-react";

interface Recorrido {
  id: string;
  name: string;
  distance_km: number | null;
}

interface Contexto {
  estado: "ok" | "revocada" | "no_existe";
  pantalla: string;
  race_id: string;
  race_name: string;
  race_location: string | null;
  race_date: string;
  recorridos: Recorrido[];
}

const PantallaSeguimiento = () => {
  const { token } = useParams();
  const [ctx, setCtx] = useState<Contexto | null>(null);
  const [mapboxToken, setMapboxToken] = useState("");
  const [recorrido, setRecorrido] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const wakeLock = useRef<any>(null);

  // Contexto + latido. El sello de last_seen_at es como el panel sabe que la
  // pantalla sigue viva; se refresca cada minuto.
  useEffect(() => {
    if (!token) return;
    let vivo = true;

    const cargar = async () => {
      const { data } = await (supabase as any).rpc("pantalla_contexto", { p_token: token });
      if (!vivo) return;
      const c = data as Contexto | null;
      setCtx(c);
      if (c?.estado === "ok" && c.recorridos?.length && !recorrido) {
        setRecorrido(c.recorridos[0].id);
      }
      setCargando(false);
    };

    cargar();
    const latido = setInterval(cargar, 60_000);
    return () => {
      vivo = false;
      clearInterval(latido);
    };
    // recorrido fuera de las dependencias a proposito: el latido no debe
    // reiniciar la seleccion que haya hecho alguien en la pantalla
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    supabase.functions.invoke("get-mapbox-token").then(({ data }) => {
      if (data?.token) setMapboxToken(data.token);
    });
  }, []);

  // Que no se apague la pantalla a mitad de carrera. No todos los navegadores
  // lo permiten; si no se puede, no pasa nada.
  useEffect(() => {
    const pedir = async () => {
      try {
        wakeLock.current = await (navigator as any).wakeLock?.request("screen");
      } catch {
        /* el navegador no lo permite: se ignora */
      }
    };
    pedir();
    const alVolver = () => {
      if (document.visibilityState === "visible") pedir();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      document.removeEventListener("visibilitychange", alVolver);
      wakeLock.current?.release?.();
    };
  }, []);

  const pantallaCompleta = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  };

  if (cargando) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!ctx || ctx.estado !== "ok") {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <AlertCircle className="h-14 w-14 text-destructive" />
        <h1 className="text-2xl font-bold">
          {ctx?.estado === "revocada" ? "Esta pantalla ha sido revocada" : "Enlace no válido"}
        </h1>
        <p className="text-muted-foreground max-w-md">
          {ctx?.estado === "revocada"
            ? "La organización ha desactivado este puesto. Pídeles un enlace nuevo."
            : "Comprueba que has copiado la dirección entera, o pide otra a la organización."}
        </p>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-background">
      {/* Cabecera mínima: lo justo para saber qué se está mirando desde lejos */}
      <header className="flex items-center justify-between gap-4 px-5 py-3 border-b border-border shrink-0">
        <div className="min-w-0">
          <h1 className="font-archivo text-xl uppercase truncate">{ctx.race_name}</h1>
          <p className="text-xs text-muted-foreground truncate">
            {ctx.pantalla}
            {ctx.race_location ? ` · ${ctx.race_location}` : ""}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {ctx.recorridos.length > 1 && (
            <select
              className="rounded-md border border-border bg-card px-3 py-1.5 text-sm"
              value={recorrido ?? ""}
              onChange={(e) => setRecorrido(e.target.value)}
            >
              {ctx.recorridos.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.distance_km ? ` (${r.distance_km} km)` : ""}
                </option>
              ))}
            </select>
          )}
          <span className="flex items-center gap-1.5 text-xs font-semibold text-primary">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            EN VIVO
          </span>
          <button
            onClick={pantallaCompleta}
            title="Pantalla completa"
            className="rounded-md border border-border p-1.5 hover:bg-muted"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* El mapa se come todo lo que queda */}
      <div className="flex-1 min-h-0">
        {mapboxToken && recorrido ? (
          <LiveGPSMap
            raceId={ctx.race_id}
            distanceId={recorrido}
            mapboxToken={mapboxToken}
            pantallaToken={token}
          />
        ) : (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}
      </div>
    </div>
  );
};

export default PantallaSeguimiento;
