/**
 * Recogida de dorsales — la herramienta de la MESA, no del organizador.
 *
 * La identidad es el puesto: la URL lleva el token de la mesa (generado en
 * el panel, igual que las pantallas de seguimiento) y la tablet que la abre
 * ES esa mesa. Sin login, revocable al acabar.
 *
 * Pensada para cola y prisa: buscar (dorsal, nombre o DNI) o escanear el QR
 * que el corredor trae en el móvil (/mi-dorsal), ver la ficha con los avisos
 * que importan (pendiente de pago = no se entrega; menor = autorización;
 * ya entregado = cuándo y dónde) y un botón grande. Las reglas duras las
 * comprueba el servidor (recogida_entregar), no esta pantalla.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Html5Qrcode } from "html5-qrcode";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  QrCode,
  RotateCcw,
  Search,
  X,
} from "lucide-react";

const db = supabase as any;

interface ResumenRecorrido {
  recorrido: string;
  total: number;
  entregados: number;
}

interface Contexto {
  estado: "ok" | "revocada" | "no_existe";
  mesa: string;
  race_id: string;
  race_name: string;
  race_date: string;
  resumen: ResumenRecorrido[];
}

interface Ficha {
  registration_id: string;
  nombre: string;
  apellidos: string;
  dorsal: number | null;
  recorrido: string;
  talla: string | null;
  dni_final: string | null;
  pago: string;
  edad_carrera: number | null;
  entregado_at: string | null;
  entregado_mesa: string | null;
  recogido_por: string | null;
}

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

const RecogidaDorsales = () => {
  const { token } = useParams();
  const [ctx, setCtx] = useState<Contexto | null>(null);
  const [cargando, setCargando] = useState(true);

  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<Ficha[]>([]);
  const [buscando, setBuscando] = useState(false);

  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [recogidoPor, setRecogidoPor] = useState("");
  const [entregando, setEntregando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  // Confirmación grande tras entregar: nombre y dorsal, se cierra sola
  const [entregadoOk, setEntregadoOk] = useState<{ nombre: string; dorsal: number | null } | null>(null);

  const [escaneando, setEscaneando] = useState(false);
  const scanner = useRef<Html5Qrcode | null>(null);
  const wakeLock = useRef<any>(null);

  // ── Contexto + latido (como las pantallas de seguimiento) ───────────────
  const cargarContexto = useCallback(async () => {
    if (!token) return;
    const { data } = await db.rpc("recogida_contexto", { p_token: token });
    setCtx(data as Contexto | null);
    setCargando(false);
  }, [token]);

  useEffect(() => {
    cargarContexto();
    const latido = setInterval(cargarContexto, 60_000);
    return () => clearInterval(latido);
  }, [cargarContexto]);

  // Que la tablet no se apague con la mesa abierta
  useEffect(() => {
    const pedir = async () => {
      try {
        wakeLock.current = await (navigator as any).wakeLock?.request("screen");
      } catch { /* no soportado: da igual */ }
    };
    pedir();
    const alVolver = () => document.visibilityState === "visible" && pedir();
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      document.removeEventListener("visibilitychange", alVolver);
      wakeLock.current?.release?.();
    };
  }, []);

  // ── Búsqueda con un respiro (300 ms) ────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    const txt = texto.trim();
    if (txt.length < 2) {
      setResultados([]);
      return;
    }
    setBuscando(true);
    const t = setTimeout(async () => {
      const { data } = await db.rpc("recogida_buscar", { p_token: token, p_texto: txt });
      setResultados((data ?? []) as Ficha[]);
      setBuscando(false);
    }, 300);
    return () => clearTimeout(t);
  }, [texto, token]);

  // ── Escáner: lee la URL /mi-dorsal/<token> del móvil del corredor ───────
  const abrirEscaner = async () => {
    setEscaneando(true);
    setAviso(null);
    // El div del vídeo tiene que existir antes de arrancar
    setTimeout(async () => {
      try {
        const h5 = new Html5Qrcode("lector-qr");
        scanner.current = h5;
        await h5.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          async (decoded) => {
            const uuid = decoded.match(
              /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
            )?.[0];
            if (!uuid) return;
            await cerrarEscaner();
            const { data } = await db.rpc("recogida_por_qr", {
              p_token: token,
              p_token_inscripcion: uuid,
            });
            const f = (data ?? [])[0] as Ficha | undefined;
            if (f) abrirFicha(f);
            else setAviso("Ese QR no es de un corredor de esta carrera.");
          },
          () => { /* fotogramas sin QR: silencio */ },
        );
      } catch (e: any) {
        setEscaneando(false);
        setAviso("No se pudo abrir la cámara: " + (e?.message ?? e));
      }
    }, 50);
  };

  const cerrarEscaner = async () => {
    try {
      await scanner.current?.stop();
      scanner.current?.clear();
    } catch { /* ya parado */ }
    scanner.current = null;
    setEscaneando(false);
  };

  useEffect(() => () => { cerrarEscaner(); }, []);

  const abrirFicha = (f: Ficha) => {
    setFicha(f);
    setRecogidoPor("");
    setAviso(null);
  };

  const refrescarTrasCambio = async () => {
    setTexto("");
    setResultados([]);
    cargarContexto();
  };

  // ── Entregar / deshacer ─────────────────────────────────────────────────
  const entregar = async () => {
    if (!ficha || !token) return;
    setEntregando(true);
    setAviso(null);
    const { data, error } = await db.rpc("recogida_entregar", {
      p_token: token,
      p_registration_id: ficha.registration_id,
      p_recogido_por: recogidoPor.trim() || null,
    });
    setEntregando(false);
    if (error) {
      setAviso(error.message);
      return;
    }
    const r = data as any;
    if (r?.estado === "ok") {
      setEntregadoOk({ nombre: `${ficha.nombre} ${ficha.apellidos}`.trim(), dorsal: ficha.dorsal });
      setFicha(null);
      refrescarTrasCambio();
      setTimeout(() => setEntregadoOk(null), 2500);
    } else if (r?.estado === "ya_entregada") {
      setAviso(`Ya se entregó ${r.entregado_at ? "a las " + hora(r.entregado_at) : ""}${r.mesa ? " en " + r.mesa : ""}.`);
    } else if (r?.estado === "pendiente_pago") {
      setAviso("Pendiente de pago: no se puede entregar.");
    } else if (r?.estado === "cancelada") {
      setAviso("Inscripción cancelada: no se entrega.");
    } else {
      setAviso("No se pudo entregar (" + (r?.estado ?? "error") + ").");
    }
  };

  const deshacer = async () => {
    if (!ficha || !token) return;
    setEntregando(true);
    const { data } = await db.rpc("recogida_deshacer", {
      p_token: token,
      p_registration_id: ficha.registration_id,
    });
    setEntregando(false);
    if (data) {
      setFicha(null);
      refrescarTrasCambio();
    } else {
      setAviso("No se pudo deshacer.");
    }
  };

  // ── Pantallas de error / carga ──────────────────────────────────────────
  if (cargando) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!ctx || ctx.estado !== "ok") {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <AlertCircle className="h-14 w-14 text-destructive" />
        <h1 className="text-2xl font-bold">
          {ctx?.estado === "revocada" ? "Esta mesa ha sido revocada" : "Enlace no válido"}
        </h1>
        <p className="text-muted-foreground max-w-md">
          {ctx?.estado === "revocada"
            ? "La organización ha desactivado este puesto. Pídeles un enlace nuevo."
            : "Comprueba que has copiado la dirección entera, o pide otra a la organización."}
        </p>
      </div>
    );
  }

  const totales = ctx.resumen.reduce(
    (a, r) => ({ total: a.total + r.total, entregados: a.entregados + r.entregados }),
    { total: 0, entregados: 0 },
  );

  const pagoOk = ficha && (ficha.pago === "paid" || ficha.pago === "not_required");
  const esMenor = ficha?.edad_carrera != null && ficha.edad_carrera < 18;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Cabecera: qué carrera, qué mesa, cómo vamos */}
      <header className="px-4 py-3 border-b border-border space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-archivo text-lg uppercase truncate">{ctx.race_name}</h1>
            <p className="text-xs text-muted-foreground">Recogida de dorsales · {ctx.mesa}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-2xl font-bold text-primary leading-none">
              {totales.entregados}<span className="text-muted-foreground text-base font-normal">/{totales.total}</span>
            </p>
            <p className="text-[11px] uppercase text-muted-foreground">entregados</p>
          </div>
        </div>
        {ctx.resumen.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-0.5">
            {ctx.resumen.map((r) => (
              <span key={r.recorrido}
                className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                {r.recorrido}: <strong className="text-foreground">{r.entregados}</strong>/{r.total}
              </span>
            ))}
          </div>
        )}
      </header>

      <main className="flex-1 p-4 space-y-3 max-w-xl w-full mx-auto">
        {/* Buscar + escanear: las dos puertas */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              autoFocus
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Dorsal, nombre o DNI…"
              className="w-full rounded-xl border border-border bg-card py-3 pl-9 pr-3 text-base"
            />
          </div>
          <button
            onClick={abrirEscaner}
            className="shrink-0 rounded-xl bg-secondary px-4 text-secondary-foreground flex flex-col items-center justify-center"
          >
            <QrCode className="h-5 w-5" />
            <span className="text-[10px] font-bold uppercase">Escanear</span>
          </button>
        </div>

        {aviso && !ficha && (
          <p className="rounded-lg bg-destructive/10 text-destructive text-sm px-3 py-2">{aviso}</p>
        )}

        {/* Resultados */}
        {buscando && <p className="text-sm text-muted-foreground px-1">Buscando…</p>}
        <div className="space-y-2">
          {resultados.map((r) => (
            <button
              key={r.registration_id}
              onClick={() => abrirFicha(r)}
              className="w-full rounded-xl border border-border bg-card p-3 flex items-center gap-3 text-left"
            >
              <span className="font-mono font-bold text-lg w-14 shrink-0 text-center">
                {r.dorsal ?? "—"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold truncate">{r.nombre} {r.apellidos}</span>
                <span className="block text-xs text-muted-foreground">{r.recorrido}</span>
              </span>
              {r.entregado_at ? (
                <span className="shrink-0 rounded-full bg-primary/10 text-primary text-[11px] font-bold uppercase px-2 py-0.5">
                  Entregado
                </span>
              ) : r.pago !== "paid" && r.pago !== "not_required" ? (
                <span className="shrink-0 rounded-full bg-destructive/10 text-destructive text-[11px] font-bold uppercase px-2 py-0.5">
                  Sin pagar
                </span>
              ) : null}
            </button>
          ))}
          {texto.trim().length >= 2 && !buscando && resultados.length === 0 && (
            <p className="text-sm text-muted-foreground px-1">Nadie coincide con "{texto.trim()}".</p>
          )}
        </div>
      </main>

      {/* Ficha del corredor */}
      {ficha && (
        <div className="fixed inset-0 z-40 bg-black/60 flex items-end sm:items-center justify-center"
             onClick={() => setFicha(null)}>
          <div className="w-full sm:max-w-md bg-background rounded-t-2xl sm:rounded-2xl p-5 space-y-4"
               onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-3xl font-bold font-mono leading-none">
                  {ficha.dorsal ?? "—"}
                </p>
                <h2 className="text-lg font-semibold mt-1">{ficha.nombre} {ficha.apellidos}</h2>
                <p className="text-sm text-muted-foreground">
                  {ficha.recorrido}
                  {ficha.talla ? ` · Camiseta ${ficha.talla}` : ""}
                  {ficha.dni_final ? ` · DNI …${ficha.dni_final}` : ""}
                </p>
              </div>
              <button onClick={() => setFicha(null)}><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>

            {/* Los avisos que importan, en grande */}
            {!pagoOk && (
              <p className="flex items-center gap-2 rounded-lg bg-destructive/10 text-destructive px-3 py-2 text-sm font-semibold">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Pendiente de pago: no se entrega. Que pase por la organización.
              </p>
            )}
            {esMenor && (
              <p className="flex items-center gap-2 rounded-lg bg-secondary/10 text-secondary px-3 py-2 text-sm font-semibold">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Menor de edad ({ficha.edad_carrera} años): pedir autorización del tutor.
              </p>
            )}
            {ficha.entregado_at && (
              <p className="flex items-center gap-2 rounded-lg bg-primary/10 text-primary px-3 py-2 text-sm font-semibold">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Ya entregado a las {hora(ficha.entregado_at)}
                {ficha.entregado_mesa ? ` en ${ficha.entregado_mesa}` : ""}
                {ficha.recogido_por ? ` (recogió: ${ficha.recogido_por})` : ""}
              </p>
            )}

            {aviso && (
              <p className="rounded-lg bg-destructive/10 text-destructive text-sm px-3 py-2">{aviso}</p>
            )}

            {!ficha.entregado_at && pagoOk && (
              <>
                <input
                  value={recogidoPor}
                  onChange={(e) => setRecogidoPor(e.target.value)}
                  placeholder="¿Recoge otra persona? Su nombre y DNI (opcional)"
                  className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm"
                />
                <button
                  onClick={entregar}
                  disabled={entregando}
                  className="w-full rounded-xl bg-primary py-4 text-primary-foreground text-lg font-bold uppercase tracking-wide disabled:opacity-50"
                >
                  {entregando ? "Entregando…" : "Entregar dorsal"}
                </button>
              </>
            )}
            {ficha.entregado_at && (
              <button
                onClick={deshacer}
                disabled={entregando}
                className="w-full rounded-xl border border-border py-3 text-sm font-semibold uppercase flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" />
                Deshacer la entrega
              </button>
            )}
          </div>
        </div>
      )}

      {/* Escáner a pantalla */}
      {escaneando && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 text-white">
            <p className="font-semibold">Escanea el QR del corredor</p>
            <button onClick={cerrarEscaner}><X className="h-6 w-6" /></button>
          </div>
          <div id="lector-qr" className="flex-1" />
          <p className="text-center text-white/70 text-sm py-3 px-6">
            El corredor lo tiene en el enlace "Mi dorsal" de su email de confirmación.
          </p>
        </div>
      )}

      {/* Confirmación grande, visible desde el otro lado de la mesa */}
      {entregadoOk && (
        <div className="fixed inset-0 z-50 bg-primary flex flex-col items-center justify-center gap-3 text-primary-foreground"
             onClick={() => setEntregadoOk(null)}>
          <CheckCircle2 className="h-20 w-20" />
          <p className="text-5xl font-bold font-mono">{entregadoOk.dorsal ?? ""}</p>
          <p className="text-xl font-semibold text-center px-6">{entregadoOk.nombre}</p>
          <p className="uppercase tracking-widest text-sm opacity-80">Dorsal entregado</p>
        </div>
      )}
    </div>
  );
};

export default RecogidaDorsales;
