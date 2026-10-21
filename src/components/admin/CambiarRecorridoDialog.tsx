// Cambiar de recorrido a un corredor ya inscrito, todo de una vez (21-oct-2026).
//
// Antes se cambiaba el desplegable de «Editar» y nada más: el dorsal se
// quedaba en el rango del recorrido viejo, el QR GPS en el recorrido viejo,
// las respuestas del formulario huérfanas y el dinero sin cuadrar. Aquí lo
// hace la RPC cambiar_recorrido en una transacción; este diálogo enseña antes
// la vista previa (cambio_recorrido_info) y pide lo que no se puede decidir
// solo:
//  · el dinero, con el precio del recorrido nuevo A SU FECHA DE INSCRIPCIÓN:
//    si sale a cobrar, cobrado en mano o se perdona; si sale a devolver, el
//    admin devuelve y el organizador lo pide (queda pendiente para el admin);
//  · el dorsal: el siguiente libre del recorrido nuevo, el mismo, a mano o
//    ninguno (si ya lo recogió, de entrada el mismo).
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

export interface CorredorACambiar {
  id: string;
  race_id: string;
  race_distance_id: string;
  first_name: string | null;
  last_name: string | null;
  bib_number: number | null;
}

interface Recorrido {
  id: string;
  name: string;
  distance_km: number | null;
}

interface Vista {
  ok: boolean;
  bloqueo: string | null;
  avisos: string[];
  nombre: string;
  desde: { id: string; nombre: string };
  hasta: {
    id: string;
    nombre: string;
    bib_start: number | null;
    bib_end: number | null;
    next_bib: number | null;
    gps: boolean;
  };
  dorsal: number | null;
  entregado: boolean;
  plazas_libres: number | null;
  qr: "sin_qr" | "libre" | "vinculado";
  dinero: {
    tipo: "tarjeta" | "mano" | "gratis" | "pendiente" | "externa";
    pagado: number | null;
    pagado_supuesto: boolean;
    precio_viejo: number;
    precio_nuevo: number;
    diferencia: number | null;
    cupon: number;
    devolucion_pendiente: number;
    anula_devolucion: number;
    devolvible_tarjeta: boolean;
  };
}

interface Hecho {
  cambio_id: string;
  dorsal: number | null;
  categoria: string | null;
  qr: "movido" | "nuevo" | "desactivado" | "sin_qr";
  decision: string;
  importe: number | null;
  avisos: string[];
}

type ModoDorsal = "siguiente" | "mismo" | "manual" | "ninguno";
type Decision = "cobrado_mano" | "perdonado" | "devolucion_pedida" | "no_se_devuelve";

const euros = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

/** "12,50" / "12.5" / "12" → número; null si no es un importe */
function aEuros(texto: string): number | null {
  const t = texto.trim().replace(/\s|€/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Number(t);
}

const chip = (activo: boolean) =>
  `rounded-full border px-3 py-1.5 text-xs font-bold uppercase ${
    activo ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"
  }`;

interface Props {
  corredor: CorredorACambiar | null;
  esAdmin: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tras un cambio hecho: refrescar la tabla */
  onCambiado: () => void;
  /** Admin, con la devolución pedida y el cobro devolvible: abrir la devolución */
  onDevolverAhora?: (registrationId: string, cambioId: string, importe: number, motivo: string) => void;
  /** Mandarle su dorsal (plantilla 'dorsal') o el QR nuevo ('track') */
  onEnviarCorreo?: (registrationId: string, plantilla: string) => void;
}

export function CambiarRecorridoDialog({ corredor, esAdmin, onOpenChange, onCambiado, onDevolverAhora, onEnviarCorreo }: Props) {
  const [recorridos, setRecorridos] = useState<Recorrido[] | null>(null);
  const [hasta, setHasta] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [modoDorsal, setModoDorsal] = useState<ModoDorsal>("siguiente");
  const [dorsalManual, setDorsalManual] = useState("");
  const [decision, setDecision] = useState<Decision | null>(null);
  const [importeTexto, setImporteTexto] = useState("");
  const [forzar, setForzar] = useState(false);
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState<Hecho | null>(null);

  // Para descartar respuestas tardías de otro recorrido u otro corredor
  const peticion = useRef(0);

  useEffect(() => {
    if (!corredor) return;
    setRecorridos(null);
    setHasta(null);
    setVista(null);
    setError(null);
    setNota("");
    setHecho(null);
    const miPeticion = ++peticion.current;
    supabase
      .from("race_distances")
      .select("id, name, distance_km")
      .eq("race_id", corredor.race_id)
      .order("distance_km")
      .then(({ data, error: e }) => {
        if (miPeticion !== peticion.current) return;
        if (e) setError(e.message);
        setRecorridos((data ?? []).filter((d) => d.id !== corredor.race_distance_id));
      });
  }, [corredor]);

  const elegir = async (id: string) => {
    if (!corredor) return;
    setHasta(id);
    setVista(null);
    setError(null);
    setCargando(true);
    const miPeticion = ++peticion.current;
    const { data, error: e } = await supabase.rpc("cambio_recorrido_info" as never, {
      p_registration_id: corredor.id,
      p_hasta: id,
    } as never);
    if (miPeticion !== peticion.current) return;
    setCargando(false);
    if (e) {
      setError(e.code ? e.message : "Sin conexión con el servidor. Vuelve a elegir el recorrido.");
      return;
    }
    const v = data as unknown as Vista;
    setVista(v);
    // Si ya recogió el dorsal, lo normal es que se quede con el suyo
    setModoDorsal(
      v.entregado && corredor.bib_number != null
        ? "mismo"
        : v.hasta.bib_start != null
          ? "siguiente"
          : corredor.bib_number != null
            ? "mismo"
            : "ninguno",
    );
    setDorsalManual("");
    setForzar(false);
    const dif = v.dinero.diferencia ?? 0;
    // Pagado en otra plataforma: aquí no se devuelve
    setDecision(dif < 0 && v.dinero.tipo === "externa" ? "no_se_devuelve" : null);
    setImporteTexto(dif > 0 ? dif.toFixed(2).replace(".", ",") : "");
  };

  const cerrar = () => {
    if (enviando) return;
    onOpenChange(false);
  };

  const d = vista?.dinero;
  const dif = d?.diferencia ?? 0;
  const hayDinero = !!d && d.tipo !== "pendiente" && Math.abs(dif) >= 0.01;
  const dorsalNum = modoDorsal === "manual" ? parseInt(dorsalManual, 10) : null;
  const dorsalValido = modoDorsal !== "manual" || (Number.isFinite(dorsalNum) && (dorsalNum ?? 0) > 0);
  const importe = decision === "cobrado_mano" ? aEuros(importeTexto) : null;
  const dineroValido =
    !hayDinero ||
    (dif > 0 && decision === "perdonado") ||
    (dif > 0 && decision === "cobrado_mano" && importe !== null && importe > 0) ||
    (dif < 0 && (decision === "devolucion_pedida" || decision === "no_se_devuelve"));
  const completo = vista?.plazas_libres != null && vista.plazas_libres <= 0;
  const puede = !!vista?.ok && dorsalValido && dineroValido && (!completo || forzar) && !enviando;
  // Un número del rango que la web aún no ha repartido: la web lo repetiría
  const enRangoDeLaWeb =
    dorsalNum != null &&
    vista?.hasta.next_bib != null &&
    dorsalNum >= vista.hasta.next_bib &&
    (vista.hasta.bib_end == null || dorsalNum <= vista.hasta.bib_end);

  const cambiar = async () => {
    if (!corredor || !hasta || !vista || !puede) return;
    setEnviando(true);
    setError(null);
    const { data, error: e } = await supabase.rpc("cambiar_recorrido" as never, {
      p_registration_id: corredor.id,
      p_hasta: hasta,
      p_modo_dorsal: modoDorsal,
      p_dorsal: modoDorsal === "manual" ? dorsalNum : null,
      p_decision: hayDinero ? decision : null,
      p_importe: decision === "cobrado_mano" ? importe : null,
      p_nota: nota.trim() || null,
      p_forzar_plazas: forzar,
    } as never);
    setEnviando(false);
    if (e) {
      // Sin código: no sabemos si llegó. La tabla lo dirá al recargar
      setError(
        e.code
          ? e.message
          : "No ha llegado respuesta y no sabemos si se ha hecho. Cierra y mira en la lista en qué recorrido está antes de repetirlo.",
      );
      if (!e.code) onCambiado();
      return;
    }
    setHecho(data as unknown as Hecho);
    onCambiado();
  };

  const nombre = `${corredor?.first_name ?? ""} ${corredor?.last_name ?? ""}`.trim();

  return (
    <Dialog open={!!corredor} onOpenChange={(open) => !open && cerrar()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cambiar de recorrido</DialogTitle>
          <DialogDescription>
            {nombre || "Corredor"}
            {vista ? ` · ahora en ${vista.desde.nombre}` : ""}
            {corredor?.bib_number != null ? ` · dorsal ${corredor.bib_number}` : ""}
          </DialogDescription>
        </DialogHeader>

        {hecho && vista ? (
          <div className="space-y-3 text-sm">
            <p className="flex items-center gap-2 font-semibold text-green-700 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              {nombre} ya está en {vista.hasta.nombre}
            </p>
            <ul className="space-y-1">
              <li>
                Dorsal:{" "}
                <strong>{hecho.dorsal != null ? hecho.dorsal : "sin dorsal"}</strong>
                {corredor?.bib_number != null && hecho.dorsal !== corredor.bib_number && ` (antes ${corredor.bib_number})`}
              </li>
              <li>
                Categoría: <strong>{hecho.categoria ?? "sin categoría"}</strong>
                {!hecho.categoria && " — revísala en Editar"}
              </li>
              {hecho.qr === "movido" && <li>QR GPS: el mismo QR sigue valiendo, ahora en {vista.hasta.nombre}.</li>}
              {hecho.qr === "nuevo" && (
                <li>
                  QR GPS: ya tenía la app activada, así que tiene un <strong>QR nuevo</strong> y el viejo se ha apagado.
                  Mándaselo.
                </li>
              )}
              {hecho.qr === "desactivado" && <li>QR GPS: se ha apagado (sin dorsal o recorrido sin seguimiento).</li>}
              <li>
                Dinero:{" "}
                {
                  {
                    sin_diferencia: "sin diferencia de precio",
                    sin_cobro: "invitado, sin cobro",
                    pendiente_pago: `pendiente de pago: pagará el precio de ${vista.hasta.nombre}`,
                    cobrado_mano: `cobrado en mano ${euros(hecho.importe)}`,
                    perdonado: "diferencia perdonada",
                    devolucion_pedida: esAdmin
                      ? `devolución de ${euros(hecho.importe)} pendiente`
                      : `devolución de ${euros(hecho.importe)} pedida al admin`,
                    no_se_devuelve: "no se devuelve",
                  }[hecho.decision] ?? hecho.decision
                }
              </li>
            </ul>
            {hecho.avisos.length > 0 && (
              <ul className="space-y-1 rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300">
                {hecho.avisos.map((a) => (
                  <li key={a} className="flex gap-1.5">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {a}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              {esAdmin && hecho.decision === "devolucion_pedida" && vista.dinero.devolvible_tarjeta && onDevolverAhora && corredor && (
                <Button
                  onClick={() => {
                    onDevolverAhora(
                      corredor.id,
                      hecho.cambio_id,
                      hecho.importe ?? 0,
                      `Cambio de recorrido: ${vista.desde.nombre} → ${vista.hasta.nombre}`,
                    );
                    onOpenChange(false);
                  }}
                >
                  Devolver {euros(hecho.importe)} a su tarjeta
                </Button>
              )}
              {onEnviarCorreo && corredor && hecho.dorsal != null && (
                <Button
                  variant="outline"
                  onClick={() => {
                    onEnviarCorreo(corredor.id, hecho.qr === "nuevo" ? "track" : "dorsal");
                    onOpenChange(false);
                  }}
                >
                  {hecho.qr === "nuevo" ? "Enviarle el QR nuevo" : "Enviarle su dorsal"}
                </Button>
              )}
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cerrar
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Recorrido nuevo */}
            <div className="space-y-2">
              <Label>Recorrido nuevo</Label>
              {recorridos === null ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Cargando recorridos…
                </p>
              ) : recorridos.length === 0 ? (
                <p className="text-sm text-muted-foreground">Esta carrera no tiene otro recorrido.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {recorridos.map((r) => (
                    <button key={r.id} type="button" onClick={() => elegir(r.id)} className={chip(hasta === r.id)}>
                      {r.name}
                      {r.distance_km ? ` · ${r.distance_km} km` : ""}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {cargando && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Calculando…
              </p>
            )}

            {vista && !vista.ok && (
              <p className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-sm text-destructive">
                {vista.bloqueo}
              </p>
            )}

            {vista?.ok && d && (
              <>
                {vista.avisos.length > 0 && (
                  <ul className="space-y-1 rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300">
                    {vista.avisos.map((a) => (
                      <li key={a} className="flex gap-1.5">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        {a}
                      </li>
                    ))}
                  </ul>
                )}

                {/* Dinero */}
                <div className="space-y-2 rounded-2xl border border-border bg-card p-3 text-sm">
                  <p className="font-bold">Dinero</p>
                  {d.tipo === "pendiente" ? (
                    <p className="text-muted-foreground">
                      Está pendiente de pago: cuando pague, pagará el precio de {vista.hasta.nombre} ({euros(d.precio_nuevo)}).
                    </p>
                  ) : (
                    <>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">
                          {d.tipo === "gratis" ? "Invitado: cubre" : d.tipo === "externa" ? "Pagado en otra plataforma" : "Ha pagado"}
                        </span>
                        <span>{euros(d.pagado)}</span>
                      </div>
                      {d.pagado_supuesto && (
                        <p className="text-xs text-muted-foreground">
                          No consta lo cobrado: se da por pagado el precio de su recorrido.
                        </p>
                      )}
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">{vista.hasta.nombre} a su fecha de inscripción</span>
                        <span>{euros(d.precio_nuevo)}</span>
                      </div>
                      {d.cupon > 0 && (
                        <p className="text-xs text-muted-foreground">Con su cupón de {euros(d.cupon)} descontado.</p>
                      )}
                      {d.anula_devolucion > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Se anula la devolución pedida de {euros(d.anula_devolucion)} (aún sin hacer).
                        </p>
                      )}
                      <div className="flex justify-between gap-2 border-t border-border pt-2 font-semibold">
                        <span>{dif > 0 ? "Le toca pagar" : dif < 0 ? "Le sobran" : "Diferencia"}</span>
                        <span>{hayDinero ? euros(Math.abs(dif)) : "nada"}</span>
                      </div>

                      {hayDinero && dif > 0 && (
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => setDecision("cobrado_mano")} className={chip(decision === "cobrado_mano")}>
                              Cobrado en mano
                            </button>
                            <button type="button" onClick={() => setDecision("perdonado")} className={chip(decision === "perdonado")}>
                              Se perdona
                            </button>
                          </div>
                          {decision === "cobrado_mano" && (
                            <div className="space-y-1">
                              <Input
                                inputMode="decimal"
                                value={importeTexto}
                                onChange={(e) => setImporteTexto(e.target.value)}
                                className="w-32"
                                aria-invalid={importe === null || importe <= 0}
                              />
                              <p className="text-xs text-muted-foreground">Se suma a lo cobrado a mano, aparte de la pasarela.</p>
                            </div>
                          )}
                        </div>
                      )}

                      {hayDinero && dif < 0 && d.tipo === "externa" && (
                        <p className="text-xs text-muted-foreground">
                          Pagó en otra plataforma: si procede devolverle algo, se hace allí.
                        </p>
                      )}
                      {hayDinero && dif < 0 && d.tipo !== "externa" && (
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setDecision("devolucion_pedida")}
                              className={chip(decision === "devolucion_pedida")}
                            >
                              {esAdmin
                                ? d.devolvible_tarjeta
                                  ? `Devolver ${euros(-dif)} a su tarjeta`
                                  : `Devolver ${euros(-dif)}`
                                : `Pedir al admin que devuelva ${euros(-dif)}`}
                            </button>
                            <button type="button" onClick={() => setDecision("no_se_devuelve")} className={chip(decision === "no_se_devuelve")}>
                              No se devuelve
                            </button>
                          </div>
                          {decision === "devolucion_pedida" && (
                            <p className="text-xs text-muted-foreground">
                              {esAdmin
                                ? d.devolvible_tarjeta
                                  ? "Después del cambio se abre la devolución con el importe puesto (sin anular la inscripción)."
                                  : "No se puede devolver desde aquí (varios cobros o pago fuera de la pasarela): queda pendiente arriba de la lista para marcarla cuando la hagas."
                                : "Las devoluciones las hace el admin: le queda pendiente arriba de la lista de inscripciones."}
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Dorsal */}
                <div className="space-y-2 rounded-2xl border border-border bg-card p-3 text-sm">
                  <p className="font-bold">Dorsal</p>
                  <div className="flex flex-wrap gap-2">
                    {vista.hasta.bib_start != null && (
                      <button type="button" onClick={() => setModoDorsal("siguiente")} className={chip(modoDorsal === "siguiente")}>
                        Siguiente libre
                      </button>
                    )}
                    {corredor?.bib_number != null && (
                      <button type="button" onClick={() => setModoDorsal("mismo")} className={chip(modoDorsal === "mismo")}>
                        Mantener el {corredor.bib_number}
                      </button>
                    )}
                    <button type="button" onClick={() => setModoDorsal("manual")} className={chip(modoDorsal === "manual")}>
                      Lo pongo yo
                    </button>
                    <button type="button" onClick={() => setModoDorsal("ninguno")} className={chip(modoDorsal === "ninguno")}>
                      Sin dorsal
                    </button>
                  </div>
                  {modoDorsal === "manual" && (
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={dorsalManual}
                      onChange={(e) => setDorsalManual(e.target.value)}
                      placeholder="Número de dorsal"
                    />
                  )}
                  <p className="text-xs text-muted-foreground">
                    {vista.hasta.bib_start != null
                      ? `Rango de ${vista.hasta.nombre}: ${vista.hasta.bib_start}–${vista.hasta.bib_end ?? "…"}${
                          vista.hasta.next_bib != null ? `, la web va por el ${vista.hasta.next_bib}` : ""
                        }.`
                      : `${vista.hasta.nombre} no tiene rango de dorsales.`}
                  </p>
                  {modoDorsal === "manual" && enRangoDeLaWeb && (
                    <p className="text-xs text-amber-700">
                      El {dorsalNum} es del rango que aún reparte la web: cuando llegue a ese número podría dárselo también a otro.
                      Mejor «Siguiente libre».
                    </p>
                  )}
                  {/* El QR GPS va con el dorsal */}
                  {vista.qr !== "sin_qr" && (
                    <p className="text-xs text-muted-foreground">
                      {modoDorsal === "ninguno" || !vista.hasta.gps
                        ? "Su QR GPS se apagará (sin dorsal o recorrido sin seguimiento)."
                        : vista.qr === "vinculado"
                          ? "Ya activó la app: se le hará un QR nuevo y el de su móvil se apagará. Habrá que mandárselo."
                          : "Su QR GPS se mueve al recorrido nuevo: el mismo QR sigue valiendo."}
                    </p>
                  )}
                </div>

                {completo && (
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={forzar} onCheckedChange={(v) => setForzar(v === true)} />
                    {vista.hasta.nombre} está completo: cambiarlo igualmente
                  </label>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="nota-cambio">Nota (opcional)</Label>
                  <Textarea
                    id="nota-cambio"
                    rows={2}
                    maxLength={500}
                    value={nota}
                    onChange={(e) => setNota(e.target.value)}
                    placeholder="Ej.: se apuntó por error al Desafío"
                  />
                </div>
              </>
            )}

            {error && (
              <p className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-sm text-destructive">{error}</p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={cerrar} disabled={enviando}>
                Cancelar
              </Button>
              <Button onClick={cambiar} disabled={!puede}>
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : vista?.ok ? `Cambiar a ${vista.hasta.nombre}` : "Cambiar"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
