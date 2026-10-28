/**
 * Mesas Dorsales — pantalla PROPIA de Camberas Org (formato móvil), dentro
 * de Corredores.
 *
 * El organizador, desde el móvil, crea las mesas de recogida de dorsales y
 * le manda a cada persona que va a atender una el ENLACE de su mesa, por
 * WhatsApp, copiado o como QR (el mismo reparto que los cupones). Esa
 * persona lo abre en su tablet o móvil y ya está atendiendo: la mesa es el
 * puesto (/recogida/<token>), sin cuentas ni contraseñas.
 *
 * El enlace es la LLAVE de la mesa: solo se manda a quien la atiende. Si se
 * escapa, se revoca la mesa y se crea otra (las entregas que hizo quedan).
 *
 * Los mismos RPC que el panel de escritorio (Mesas de recogida):
 * mesas_recogida_carrera, generar_token_mesa_recogida,
 * renombrar_mesa_recogida y revocar_token_mesa_recogida, que ya comprueban
 * que quien llama es admin u organizador de la carrera.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { qrConLogo } from "@/lib/qrConLogo";
import { mesaAtendiendo, numerarMesas, textoMesa } from "@/lib/mesasRecogida";
import {
  Check,
  Copy,
  Loader2,
  Pencil,
  Plus,
  QrCode,
  Share2,
  Store,
  Trash2,
  X,
} from "lucide-react";

const db = supabase as any;

interface Mesa {
  id: string;
  token: string;
  nombre: string;
  activa: boolean;
  last_seen_at: string | null;
  created_at: string;
  entregados: number;
}

interface Props {
  raceId: string | null;
}

const REFRESCO_MS = 60_000;

export const OrgMesasRecogida = ({ raceId }: Props) => {
  const { toast } = useToast();
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [raceName, setRaceName] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // La primera carga enseña el error a pantalla completa (con Reintentar);
  // un refresco que falla (cobertura floja en la carpa) solo avisa y
  // conserva la lista, la edición en curso y el QR abierto
  const cargadoOk = useRef(false);

  // Alta
  const [nombreNueva, setNombreNueva] = useState("");
  const [creando, setCreando] = useState(false);

  // Edición en línea del nombre: una mesa a la vez
  const [editando, setEditando] = useState<{ id: string; nombre: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Revocar: primero se pide confirmación en la propia tarjeta
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [revocando, setRevocando] = useState(false);

  // QR abierto en pantalla, para enseñarlo o guardarlo
  const [qr, setQr] = useState<{ mesa: Mesa; png: string } | null>(null);

  const cargar = useCallback(async () => {
    if (!raceId) return;
    const [{ data: race }, { data, error: err }] = await Promise.all([
      supabase.from("races").select("name").eq("id", raceId).single(),
      db.rpc("mesas_recogida_carrera", { p_race_id: raceId }),
    ]);
    if (err) {
      if (cargadoOk.current) {
        toast({ title: "No se pudo refrescar", description: err.message, variant: "destructive" });
      } else {
        setError(err.message);
        setCargando(false);
      }
      return;
    }
    cargadoOk.current = true;
    setError(null);
    setRaceName(race?.name ?? "");
    setMesas((data ?? []) as Mesa[]);
    setCargando(false);
  }, [raceId, toast]);

  useEffect(() => {
    cargadoOk.current = false;
    setCargando(true);
    cargar();
    const t = setInterval(cargar, REFRESCO_MS);
    return () => clearInterval(t);
  }, [cargar]);

  // Numeración común a panel, app y mesa (cuenta también las revocadas)
  const numeracion = useMemo(() => numerarMesas(mesas), [mesas]);
  const titulo = (m: Mesa) =>
    numeracion[m.id] ? textoMesa(numeracion[m.id].numero, m.nombre) : m.nombre;
  const numero = (m: Mesa): number | undefined => numeracion[m.id]?.numero;
  /** ¿El nombre dice algo más que el número? (misma regla que textoMesa) */
  const conNombre = (m: Mesa) => {
    const n = numero(m);
    return n == null || textoMesa(n, m.nombre) !== `Mesa #${n}`;
  };

  const url = (m: Mesa) => `${window.location.origin}/recogida/${m.token}`;

  const vivas = mesas.filter((m) => m.activa);

  const crear = async () => {
    if (!raceId || creando) return;
    setCreando(true);
    try {
      // «Mesa N» por defecto, con la lista FRESCA: si alguien acaba de crear
      // otra desde el panel, el número coincide con el que enseñan panel,
      // app y tablet (numerarMesas cuenta también las revocadas)
      let nombre = nombreNueva.trim();
      if (!nombre) {
        const { data: actuales } = await db.rpc("mesas_recogida_carrera", { p_race_id: raceId });
        nombre = `Mesa ${(actuales?.length ?? mesas.length) + 1}`;
      }
      const { error: err } = await db.rpc("generar_token_mesa_recogida", {
        p_race_id: raceId,
        p_nombre: nombre,
      });
      if (err) throw err;
      setNombreNueva("");
      await cargar();
      toast({
        title: "Mesa creada",
        description: "Mándale el enlace a quien la vaya a atender: WhatsApp, copiar o QR.",
      });
    } catch (e: any) {
      toast({ title: "No se pudo crear la mesa", description: e.message, variant: "destructive" });
    } finally {
      setCreando(false);
    }
  };

  const guardarNombre = async () => {
    if (!editando || guardando) return;
    const nuevo = editando.nombre.trim();
    const actual = mesas.find((m) => m.id === editando.id);
    if (!nuevo || !actual || nuevo === actual.nombre) {
      setEditando(null);
      return;
    }
    setGuardando(true);
    const { error: err } = await db.rpc("renombrar_mesa_recogida", { p_id: editando.id, p_nombre: nuevo });
    setGuardando(false);
    if (err) {
      toast({ title: "No se pudo renombrar", description: err.message, variant: "destructive" });
      return;
    }
    // Se refleja al instante; el refresco confirma
    setMesas((prev) => prev.map((x) => (x.id === editando.id ? { ...x, nombre: nuevo } : x)));
    setEditando(null);
    toast({ title: "Mesa renombrada", description: "La tablet de la mesa lo enseña al recargar." });
    cargar();
  };

  const revocar = async (m: Mesa) => {
    if (revocando) return;
    setRevocando(true);
    const { error: err } = await db.rpc("revocar_token_mesa_recogida", { p_id: m.id });
    setRevocando(false);
    setConfirmando(null);
    if (err) {
      toast({ title: "No se pudo revocar", description: err.message, variant: "destructive" });
      return;
    }
    // Fuera de la lista al instante: que no se pueda compartir una revocada
    setMesas((prev) => prev.map((x) => (x.id === m.id ? { ...x, activa: false } : x)));
    toast({
      title: "Mesa revocada",
      description: `«${m.nombre}» deja de funcionar al instante. Sus entregas quedan registradas.`,
    });
    cargar();
  };

  const compartirWhatsApp = (m: Mesa) => {
    const texto =
      `Te paso el enlace de tu mesa de recogida de dorsales de ${raceName}: ${titulo(m)}. ` +
      `Ábrelo en la tablet o el móvil con el que vas a atender y ya estás en marcha: ${url(m)} ` +
      `(no lo reenvíes: es la llave de la mesa).`;
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
  };

  const copiar = async (m: Mesa) => {
    try {
      await navigator.clipboard.writeText(url(m));
      toast({ title: "Enlace copiado", description: "Pégaselo a quien atienda la mesa." });
    } catch {
      toast({ title: "No se pudo copiar", description: url(m), variant: "destructive" });
    }
  };

  const abrirQr = async (m: Mesa) => {
    const png = await qrConLogo(url(m));
    setQr({ mesa: m, png });
  };

  if (!raceId) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Elige una carrera en la portada.</p>;
  }

  if (cargando) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-secondary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3 py-8 text-center">
        <p className="text-sm text-destructive">No se pudieron cargar las mesas: {error}</p>
        <button
          onClick={() => {
            setError(null);
            setCargando(true);
            cargar();
          }}
          className="rounded-lg border border-border px-4 py-2 text-xs font-bold uppercase"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Alta */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-2">
        <p className="text-xs font-bold uppercase tracking-widest text-secondary">Nueva mesa</p>
        <div className="flex gap-2">
          <input
            value={nombreNueva}
            onChange={(e) => setNombreNueva(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && crear()}
            placeholder="Carpa, Dorsales 1-200, Feria…"
            maxLength={80}
            className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-3 text-base"
          />
          <button
            onClick={crear}
            disabled={creando}
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-bold uppercase text-primary-foreground disabled:opacity-60"
          >
            {creando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Crear
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Cada mesa es un enlace sin contraseña para la tablet o el móvil de quien atiende: busca al
          corredor o escanea su QR, ve los avisos y sella la entrega.
        </p>
      </div>

      {/* Mesas */}
      {vivas.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center space-y-2">
          <Store className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Ninguna mesa abierta. Ponle un nombre que diga dónde está, créala y mándale el enlace a
            quien la vaya a atender.
          </p>
        </div>
      ) : (
        vivas.map((m) => {
          const enEdicion = editando?.id === m.id;
          const enConfirmacion = confirmando === m.id;
          return (
            <div key={m.id} className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {enEdicion ? (
                    <div className="flex gap-2">
                      <input
                        autoFocus
                        value={editando.nombre}
                        onChange={(e) => setEditando({ id: m.id, nombre: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") guardarNombre();
                          if (e.key === "Escape") setEditando(null);
                        }}
                        maxLength={80}
                        className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-base"
                      />
                      <button
                        onClick={guardarNombre}
                        disabled={guardando}
                        title="Guardar"
                        className="rounded-lg bg-primary px-3 text-primary-foreground disabled:opacity-60"
                      >
                        {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => setEditando(null)}
                        title="Cancelar"
                        className="rounded-lg border border-border px-3"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Número y nombre en dos líneas, como en la propia
                          mesa: en Archivo cabe poco y el nombre es lo que
                          distingue una de otra */}
                      <p className="font-archivo text-lg uppercase tracking-wide">
                        {numero(m) != null ? `Mesa #${numero(m)}` : m.nombre}
                      </p>
                      {conNombre(m) && numero(m) != null && (
                        <p className="truncate text-sm font-semibold">{m.nombre}</p>
                      )}
                      <p className="text-sm text-muted-foreground">{m.entregados} entregados aquí</p>
                      {/* Solo texto: un roce no debe abrir la mesa (la marcaría
                          «atendiendo»); para repartirla están los botones */}
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{url(m)}</p>
                    </>
                  )}
                </div>
                {!enEdicion && (
                  <div className="shrink-0 text-right space-y-1.5">
                    {mesaAtendiendo(m.last_seen_at) ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold uppercase text-primary">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
                        Atendiendo
                      </span>
                    ) : (
                      <span className="inline-block rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-bold uppercase text-muted-foreground">
                        Sin señal
                      </span>
                    )}
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => {
                          setConfirmando(null);
                          setEditando({ id: m.id, nombre: m.nombre });
                        }}
                        title="Cambiar el nombre"
                        className="rounded-lg border border-border p-2"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setConfirmando(enConfirmacion ? null : m.id)}
                        title="Revocar"
                        className="rounded-lg border border-border p-2 text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {enConfirmacion ? (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-2">
                  <p className="text-sm">
                    ¿Revocar «{m.nombre}»? El enlace deja de funcionar al instante. Lo que ya ha
                    entregado queda registrado.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => revocar(m)}
                      disabled={revocando}
                      className="flex items-center justify-center gap-1.5 rounded-lg bg-destructive py-2.5 text-xs font-bold uppercase text-destructive-foreground disabled:opacity-60"
                    >
                      {revocando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      Revocar
                    </button>
                    <button
                      onClick={() => setConfirmando(null)}
                      disabled={revocando}
                      className="rounded-lg border border-border py-2.5 text-xs font-bold uppercase"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                /* Repartir el enlace a quien atiende: como los cupones */
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => compartirWhatsApp(m)}
                    className="flex flex-col items-center gap-1 rounded-lg border border-border py-2.5 text-xs font-semibold uppercase"
                  >
                    <Share2 className="h-4 w-4" />
                    WhatsApp
                  </button>
                  <button
                    onClick={() => copiar(m)}
                    className="flex flex-col items-center gap-1 rounded-lg border border-border py-2.5 text-xs font-semibold uppercase"
                  >
                    <Copy className="h-4 w-4" />
                    Copiar
                  </button>
                  <button
                    onClick={() => abrirQr(m)}
                    className="flex flex-col items-center gap-1 rounded-lg border border-border py-2.5 text-xs font-semibold uppercase"
                  >
                    <QrCode className="h-4 w-4" />
                    QR
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}

      <p className="text-xs text-muted-foreground">
        El enlace es la llave de la mesa: mándaselo solo a quien la atienda. Si se escapa, revoca la
        mesa y crea otra. «Sin señal» es que lleva más de dos minutos sin dar noticias. Solo se
        entrega a inscripciones pagadas; si recoge otra persona, la mesa anota quién.
      </p>

      {/* QR a pantalla: quien atiende lo escanea con su tablet y ya está dentro */}
      {qr && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
          onClick={() => setQr(null)}
        >
          <div
            className="w-full max-w-xs rounded-2xl bg-white p-5 text-center space-y-3"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-archivo uppercase text-neutral-900 truncate">{titulo(qr.mesa)}</p>
              <button onClick={() => setQr(null)} title="Cerrar">
                <X className="h-5 w-5 shrink-0 text-neutral-500" />
              </button>
            </div>
            <img src={qr.png} alt={`QR de la ${titulo(qr.mesa)}`} className="w-full" />
            <p className="text-xs text-neutral-500">
              Recogida de dorsales · {raceName}
            </p>
            <a
              href={qr.png}
              download={`mesa-${numeracion[qr.mesa.id]?.numero ?? ""}-${raceName}.png`}
              className="block rounded-lg bg-neutral-900 py-2.5 text-sm font-bold uppercase text-white"
            >
              Guardar imagen
            </a>
          </div>
        </div>
      )}
    </div>
  );
};
