/**
 * RouteFlightViewer — carga el GPX y el token de Mapbox y lanza el
 * vuelo 3D sobre el recorrido (RouteFlight).
 * La duración del vuelo se calibra para durar ~75 s sea cual sea la
 * distancia del track.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { parseGpxFile } from "@/lib/gpxParser";
import RouteFlight, { type TrackCoord } from "@/components/RouteFlight";
import { Loader2 } from "lucide-react";

interface RouteFlightViewerProps {
  gpxUrl: string;
  distanceName?: string;
}

const FLIGHT_SECONDS = 75; // duración objetivo del vuelo completo
const PACE_KMH = 10; // ritmo "real" de referencia (trail)

export function RouteFlightViewer({ gpxUrl }: RouteFlightViewerProps) {
  const [track, setTrack] = useState<TrackCoord[] | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [totalKm, setTotalKm] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [tokenRes, gpxRes] = await Promise.all([
          supabase.functions.invoke("get-mapbox-token"),
          fetch(gpxUrl),
        ]);

        if (tokenRes.error || !tokenRes.data?.token) {
          throw new Error("No se pudo obtener el token del mapa");
        }
        if (!gpxRes.ok) {
          throw new Error("No se pudo descargar el recorrido GPX");
        }

        const gpxText = await gpxRes.text();
        const parsed = parseGpxFile(gpxText);
        const points = parsed.tracks[0]?.points ?? [];
        if (points.length < 2) {
          throw new Error("El GPX no contiene un track válido");
        }

        // [lng, lat, ele] y distancia total aproximada para calibrar el vuelo
        const coords: TrackCoord[] = points.map((p) => [p.lon, p.lat, p.ele ?? 0]);
        let km = 0;
        for (let i = 1; i < points.length; i++) {
          const dLat = ((points[i].lat - points[i - 1].lat) * Math.PI) / 180;
          const dLon = ((points[i].lon - points[i - 1].lon) * Math.PI) / 180;
          const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos((points[i - 1].lat * Math.PI) / 180) *
              Math.cos((points[i].lat * Math.PI) / 180) *
              Math.sin(dLon / 2) ** 2;
          km += 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        }

        if (!cancelled) {
          setToken(tokenRes.data.token);
          setTrack(coords);
          setTotalKm(km);
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message ?? "Error cargando el vuelo");
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [gpxUrl]);

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        {error}
      </div>
    );
  }

  if (!track || !token) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        Preparando el vuelo sobre el recorrido...
      </div>
    );
  }

  // timeScale para que el vuelo completo dure ~FLIGHT_SECONDS
  const realSeconds = (totalKm / PACE_KMH) * 3600;
  const timeScale = Math.max(1, realSeconds / FLIGHT_SECONDS);

  return (
    <div className="h-[65vh] w-full overflow-hidden rounded-xl">
      <RouteFlight
        track={track}
        accessToken={token}
        pace={[{ km: 0, kmh: PACE_KMH }]}
        timeScale={timeScale}
        autoPlay
        showHud
      />
    </div>
  );
}
