/**
 * Marcar puntos en campo — pantalla PROPIA de Camberas Org (formato móvil).
 *
 * El organizador recorre la carrera con Camberas Track grabando (dorsal
 * 999) y, con esta pantalla en el mismo móvil, marca lo que va viendo:
 * «aquí un avituallamiento líquido», «aquí el control». Cada marca entra en
 * el rutómetro del recorrido con su km y aparece después, sin hacer nada
 * más, en el mapa en vivo, el rutómetro público y el perfil de la web
 * propia (como los avituallamientos de la Gurriana).
 *
 * Cómo:
 *  - La posición la da el GPS del móvil (watchPosition, alta precisión).
 *  - El km se calcula aquí sobre el GPX del recorrido (CDN, no toca la
 *    base) y lo recalcula el servidor sobre el trazado del rutómetro si lo
 *    tiene (marcar_punto_rutometro, 20261014110000).
 *  - Sin cobertura, la marca se guarda en localStorage y se reintenta al
 *    volver la señal (evento 'online') o cada 30 s mientras haya pendientes.
 *    Cada marca lleva su id: un reintento no la duplica.
 *  - Los tipos son los del rutómetro (roadbook_item_types), filtrados por
 *    el tipo de carrera; nada inventado aquí.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { parseGpxFile } from "@/lib/gpxParser";
import { buildRouteIndex, haversineKm, type RouteIndex } from "@/lib/routeProgress";
import { ICONOS_RUTOMETRO } from "@/lib/iconosRutometro";
import { AlertTriangle, CloudOff, Loader2, LocateFixed, MapPin } from "lucide-react";

interface Props {
  raceId: string | null;
}

interface Recorrido {
  id: string;
  name: string;
  distance_km: number | null;
  gpx_file_url: string | null;
}

interface TipoPunto {
  id: string;
  name: string;
  label: string;
  icon: string;
  display_order: number;
}

interface PuntoExistente {
  id: string;
  km_total: number;
  item_type: string;
  description: string;
  origen: string | null;
}

/** Marca guardada en el móvil hasta que el servidor la acepte */
interface MarcaPendiente {
  id: string;
  distance_id: string;
  tipo: string;
  lat: number;
  lng: number;
  altitud: number | null;
  precision_m: number | null;
  nota: string | null;
  km: number | null;
  marcado_en: string;
}

interface PosicionGps {
  lat: number;
  lng: number;
  precision_m: number;
  altitud: number | null;
  ms: number;
}

const CLAVE_PENDIENTES = "org-marcas-pendientes";
const CLAVE_RECORRIDO = (raceId: string) => `org-marcar-recorrido-${raceId}`;
// Más lejos que esto del trazado, el km que sale no es de fiar
const FUERA_TRAZADO_M = 150;

const leerPendientes = (): MarcaPendiente[] => {
  try {
    const raw = localStorage.getItem(CLAVE_PENDIENTES);
    return raw ? (JSON.parse(raw) as MarcaPendiente[]) : [];
  } catch {
    return [];
  }
};
const guardarPendientes = (lista: MarcaPendiente[]) => {
  try {
    localStorage.setItem(CLAVE_PENDIENTES, JSON.stringify(lista));
  } catch { /* sin almacenamiento: solo en memoria */ }
};

const nuevoId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });

/** Km del vértice del trazado más cercano, y a cuántos metros está */
const kmEnTrazado = (indice: RouteIndex, lat: number, lng: number): { km: number; fueraM: number; idx: number } | null => {
  if (indice.coords.length === 0) return null;
  let mejor = -1;
  let dMin = Infinity;
  for (let i = 0; i < indice.coords.length; i++) {
    const d = haversineKm(lat, lng, indice.coords[i][1], indice.coords[i][0]);
    if (d < dMin) {
      dMin = d;
      mejor = i;
    }
  }
  return mejor < 0 ? null : { km: indice.cumKm[mejor], fueraM: dMin * 1000, idx: mejor };
};

const esErrorDefinitivo = (mensaje: string) =>
  /No puedes marcar|Tipo de punto desconocido|iniciar sesión|violates row-level|permission denied/i.test(mensaje);

export const OrgMarcarPuntos = ({ raceId }: Props) => {
  const { toast } = useToast();
  const [recorridos, setRecorridos] = useState<Recorrido[]>([]);
  const [recorridoId, setRecorridoId] = useState<string | null>(null);
  const [tipos, setTipos] = useState<TipoPunto[]>([]);
  const [tipo, setTipo] = useState<string | null>(null);
  const [nota, setNota] = useState("");
  const [indice, setIndice] = useState<RouteIndex | null>(null);
  const [elevaciones, setElevaciones] = useState<(number | undefined)[]>([]);
  const [cargandoGpx, setCargandoGpx] = useState(false);
  const [pos, setPos] = useState<PosicionGps | null>(null);
  const [errorGps, setErrorGps] = useState<string | null>(null);
  const [existentes, setExistentes] = useState<PuntoExistente[]>([]);
  const [pendientes, setPendientes] = useState<MarcaPendiente[]>(() => leerPendientes());
  const [guardando, setGuardando] = useState(false);
  const [enLinea, setEnLinea] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const enviandoRef = useRef(false);

  // ── Recorridos de la carrera y tipos del rutómetro ──────────────────
  useEffect(() => {
    if (!raceId) return;
    let vivo = true;
    (async () => {
      const [{ data: ds }, { data: carrera }] = await Promise.all([
        supabase
          .from("race_distances")
          .select("id, name, distance_km, gpx_file_url")
          .eq("race_id", raceId)
          .order("display_order", { ascending: true, nullsFirst: false })
          .order("distance_km", { ascending: true }),
        supabase.from("races").select("race_type").eq("id", raceId).maybeSingle(),
      ]);
      if (!vivo) return;
      const lista = (ds ?? []) as Recorrido[];
      setRecorridos(lista);
      const guardado = localStorage.getItem(CLAVE_RECORRIDO(raceId));
      setRecorridoId(lista.find((d) => d.id === guardado)?.id ?? lista[0]?.id ?? null);

      const raceType = (carrera as { race_type?: string } | null)?.race_type ?? "trail";
      const { data: ts } = await supabase
        .from("roadbook_item_types")
        .select("id, name, label, icon, display_order, race_type")
        .eq("is_active", true)
        .neq("name", "point")
        .order("display_order");
      if (!vivo) return;
      setTipos(
        ((ts ?? []) as (TipoPunto & { race_type: string })[])
          .filter((t) => t.race_type === "both" || t.race_type === raceType)
          .map(({ race_type: _rt, ...t }) => t),
      );
    })();
    return () => { vivo = false; };
  }, [raceId]);

  // ── GPX del recorrido elegido (del almacén: no carga la base) ────────
  const recorrido = recorridos.find((d) => d.id === recorridoId) ?? null;
  useEffect(() => {
    setIndice(null);
    setElevaciones([]);
    if (!recorrido?.gpx_file_url) return;
    let vivo = true;
    setCargandoGpx(true);
    (async () => {
      try {
        const res = await fetch(recorrido.gpx_file_url as string);
        const gpx = parseGpxFile(await res.text());
        const puntos = gpx.tracks.flatMap((t) => t.points);
        if (!vivo || puntos.length < 2) return;
        setIndice(buildRouteIndex(puntos.map((p) => [p.lon, p.lat] as [number, number])));
        setElevaciones(puntos.map((p) => p.ele));
      } catch {
        /* sin GPX: el servidor usará el trazado del rutómetro, si lo tiene */
      } finally {
        if (vivo) setCargandoGpx(false);
      }
    })();
    return () => { vivo = false; };
  }, [recorrido?.gpx_file_url]);

  useEffect(() => {
    if (raceId && recorridoId) localStorage.setItem(CLAVE_RECORRIDO(raceId), recorridoId);
  }, [raceId, recorridoId]);

  // ── Puntos que ya tiene el rutómetro (sin el trazado) ────────────────
  const cargarExistentes = useCallback(async () => {
    if (!recorridoId) { setExistentes([]); return; }
    const { data: rb } = await supabase
      .from("roadbooks")
      .select("id")
      .eq("race_distance_id", recorridoId)
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (!rb) { setExistentes([]); return; }
    const { data } = await supabase
      .from("roadbook_items")
      .select("id, km_total, item_type, description, origen")
      .eq("roadbook_id", rb.id)
      .neq("item_type", "point")
      .order("km_total")
      .order("item_order");
    setExistentes((data ?? []) as PuntoExistente[]);
  }, [recorridoId]);
  useEffect(() => { cargarExistentes(); }, [cargarExistentes]);

  // ── GPS del móvil ────────────────────────────────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) {
      setErrorGps("Este móvil no da la posición al navegador");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setErrorGps(null);
        setPos({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          precision_m: p.coords.accuracy,
          altitud: p.coords.altitude,
          ms: p.timestamp,
        });
      },
      (e) => {
        setErrorGps(
          e.code === e.PERMISSION_DENIED
            ? "Sin permiso de ubicación: actívalo para Camberas en los ajustes del navegador"
            : "El GPS no da posición todavía",
        );
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // ── Envío de las marcas pendientes ───────────────────────────────────
  const enviarPendientes = useCallback(async () => {
    if (enviandoRef.current) return;
    const lista = leerPendientes();
    if (lista.length === 0) return;
    enviandoRef.current = true;
    try {
      let restantes = lista;
      for (const m of lista) {
        const { data, error } = await supabase.rpc("marcar_punto_rutometro" as never, {
          p_distance_id: m.distance_id,
          p_tipo: m.tipo,
          p_lat: m.lat,
          p_lng: m.lng,
          p_altitud: m.altitud,
          p_precision_m: m.precision_m,
          p_nota: m.nota,
          p_km: m.km,
          p_marcado_en: m.marcado_en,
          p_id: m.id,
        } as never);
        if (error) {
          if (esErrorDefinitivo(error.message)) {
            // No va a entrar nunca: fuera de la cola, y se avisa
            restantes = restantes.filter((x) => x.id !== m.id);
            guardarPendientes(restantes);
            toast({ title: "Marca rechazada", description: error.message, variant: "destructive" });
            continue;
          }
          break; // sin cobertura o servidor caído: se reintenta luego
        }
        restantes = restantes.filter((x) => x.id !== m.id);
        guardarPendientes(restantes);
        const r = (data ?? {}) as { km?: number; descripcion?: string; repetida?: boolean; km_de?: string | null };
        if (!r.repetida) {
          toast({
            title: `Marcado: ${r.descripcion ?? m.tipo}`,
            description:
              r.km_de == null
                ? "Sin km: no hay trazado. Corrígelo en el rutómetro del panel."
                : `km ${Number(r.km ?? 0).toFixed(1)}`,
          });
        }
      }
      setPendientes(restantes);
      if (restantes.length < lista.length) cargarExistentes();
    } finally {
      enviandoRef.current = false;
    }
  }, [toast, cargarExistentes]);

  useEffect(() => {
    const online = () => { setEnLinea(true); enviarPendientes(); };
    const offline = () => setEnLinea(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    enviarPendientes();
    const t = window.setInterval(() => { if (leerPendientes().length > 0) enviarPendientes(); }, 30_000);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      window.clearInterval(t);
    };
  }, [enviarPendientes]);

  // ── Dónde estoy sobre el trazado ─────────────────────────────────────
  const enTrazado = useMemo(() => (indice && pos ? kmEnTrazado(indice, pos.lat, pos.lng) : null), [indice, pos]);
  const posVieja = pos ? Date.now() - pos.ms > 60_000 : false;

  const marcar = async () => {
    if (!pos || !recorridoId || !tipo) return;
    setGuardando(true);
    const marca: MarcaPendiente = {
      id: nuevoId(),
      distance_id: recorridoId,
      tipo,
      lat: pos.lat,
      lng: pos.lng,
      altitud: pos.altitud ?? (enTrazado ? elevaciones[enTrazado.idx] ?? null : null),
      precision_m: Number.isFinite(pos.precision_m) ? Math.round(pos.precision_m) : null,
      nota: nota.trim() || null,
      km: enTrazado && enTrazado.fueraM <= 300 ? Math.round(enTrazado.km * 1000) / 1000 : null,
      marcado_en: new Date().toISOString(),
    };
    const lista = [...leerPendientes(), marca];
    guardarPendientes(lista);
    setPendientes(lista);
    setNota("");
    setTipo(null);
    await enviarPendientes();
    if (leerPendientes().some((m) => m.id === marca.id)) {
      toast({
        title: "Guardado en el móvil",
        description: "Sin cobertura: se enviará solo cuando vuelva la señal. No cierres esta pantalla del todo.",
      });
    }
    setGuardando(false);
  };

  if (!raceId) {
    return <p className="text-sm text-muted-foreground">Elige una carrera en la portada.</p>;
  }

  const iconoDe = (nombre: string) => ICONOS_RUTOMETRO[nombre] ?? MapPin;
  const etiquetaTipo = (name: string) => tipos.find((t) => t.name === name)?.label ?? name;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Lleva Camberas Track grabando el recorrido y marca aquí lo que vayas viendo. Cada marca entra en el
        rutómetro del recorrido con su km; después la puedes retocar en el panel.
      </p>

      {/* Recorrido */}
      {recorridos.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {recorridos.map((d) => (
            <button
              key={d.id}
              onClick={() => setRecorridoId(d.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-bold uppercase ${
                d.id === recorridoId ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"
              }`}
            >
              {d.name}
            </button>
          ))}
        </div>
      )}
      {recorridos.length === 0 && <p className="text-sm text-muted-foreground">Esta carrera no tiene recorridos.</p>}

      {/* Dónde estoy */}
      <div className="rounded-2xl border border-border bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          <LocateFixed className={`h-6 w-6 shrink-0 ${pos && !posVieja ? "text-secondary" : "text-muted-foreground"}`} />
          <div className="min-w-0 flex-1">
            {errorGps ? (
              <p className="text-sm text-destructive">{errorGps}</p>
            ) : !pos ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Buscando posición…
              </p>
            ) : (
              <>
                <p className="font-archivo text-lg uppercase leading-tight">
                  {enTrazado ? `Km ${enTrazado.km.toFixed(2)}` : cargandoGpx ? "Cargando trazado…" : "Sin trazado"}
                  <span className="ml-2 text-sm font-normal normal-case text-muted-foreground">±{Math.round(pos.precision_m)} m</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {pos.lat.toFixed(5)}, {pos.lng.toFixed(5)}
                  {pos.altitud != null && ` · ${Math.round(pos.altitud)} m alt.`}
                  {posVieja && " · posición antigua"}
                </p>
              </>
            )}
          </div>
        </div>
        {enTrazado && enTrazado.fueraM > FUERA_TRAZADO_M && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-600">
            <AlertTriangle className="h-3.5 w-3.5" /> Estás a {Math.round(enTrazado.fueraM)} m del trazado: el km puede no ser el bueno.
          </p>
        )}
        {recorrido && !recorrido.gpx_file_url && (
          <p className="mt-2 text-xs text-amber-600">Este recorrido no tiene GPX: el km lo pondrá el servidor si el rutómetro tiene trazado.</p>
        )}
      </div>

      {/* Qué hay aquí */}
      <div>
        <p className="mb-2 text-sm font-bold uppercase tracking-[0.14em] text-secondary">¿Qué hay aquí?</p>
        <div className="grid grid-cols-2 gap-2">
          {tipos.map((t) => {
            const Icono = iconoDe(t.icon);
            const sel = tipo === t.name;
            return (
              <button
                key={t.id}
                onClick={() => setTipo(sel ? null : t.name)}
                className={`flex items-center gap-2 rounded-xl border px-3 py-3 text-left text-sm leading-tight ${
                  sel ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"
                }`}
              >
                <Icono className="h-5 w-5 shrink-0" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
        <input
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Nota (opcional): junto a la fuente, mesa en el cruce…"
          maxLength={120}
          className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
        />
        <button
          onClick={marcar}
          disabled={!pos || !tipo || !recorridoId || guardando}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 font-archivo text-base uppercase tracking-wide text-primary-foreground disabled:opacity-40"
        >
          {guardando ? <Loader2 className="h-5 w-5 animate-spin" /> : <MapPin className="h-5 w-5" />}
          Marcar punto aquí
        </button>
      </div>

      {/* Pendientes sin cobertura */}
      {pendientes.length > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
          <span className="flex items-center gap-1.5">
            <CloudOff className="h-4 w-4" />
            {pendientes.length} {pendientes.length === 1 ? "marca pendiente" : "marcas pendientes"} de enviar
            {!enLinea && " · sin conexión"}
          </span>
          <button onClick={() => enviarPendientes()} className="font-bold uppercase text-secondary">
            Reintentar
          </button>
        </div>
      )}

      {/* Lo que ya tiene el rutómetro */}
      {existentes.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-bold uppercase tracking-[0.14em] text-secondary">
            En el rutómetro ({existentes.length})
          </p>
          <div className="space-y-1.5">
            {existentes.map((p) => {
              const Icono = iconoDe(tipos.find((t) => t.name === p.item_type)?.icon ?? "MapPin");
              return (
                <div key={p.id} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm">
                  <span className="w-14 shrink-0 font-mono text-xs text-muted-foreground">km {Number(p.km_total).toFixed(1)}</span>
                  <Icono className="h-4 w-4 shrink-0 text-secondary" />
                  <span className="min-w-0 flex-1 truncate" title={etiquetaTipo(p.item_type)}>{p.description}</span>
                  {p.origen === "campo" && (
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
                      📍 campo
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
