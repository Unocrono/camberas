// Devolver el dinero de una inscripción pagada por Redsys (solo admin).
//
// El diálogo pide a la función redsys-devolucion que ordene la devolución a
// Redsys sobre el cobro original. La base de datos guarda cada intento
// (tabla devoluciones) y pone el tope: nunca más de lo cobrado.
//
// Contra devolver dos veces:
//  · Cada confirmación lleva un id propio. Si no llega respuesta, solo se
//    puede REINTENTAR con ese mismo id (la función reconoce la petición y no
//    pide otra devolución); no se puede volver al formulario y lanzar otra.
//  · Se manda lo devuelto que se veía en pantalla: si ha cambiado (otra
//    pestaña, otro admin) la reserva se para y el diálogo recarga.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from "lucide-react";

interface Cobro {
  payment_intent_id: string;
  order_number: string;
  fecha: string | null;
  titular: string | null;
  cobrado_cent: number;
  devuelto_cent: number;
  en_curso_cent: number;
  disponible_cent: number;
  soportado: boolean;
  motivo_no: string | null;
}

interface Devolucion {
  id: string;
  order_number: string;
  importe_cent: number;
  origen: "redsys" | "externa";
  estado: "pendiente" | "hecha" | "rechazada" | "dudosa";
  atascada: boolean;
  motivo: string | null;
  cancelar: boolean;
  notificar: boolean;
  ds_response: string | null;
  ds_authorisation_code: string | null;
  error_code: string | null;
  created_at: string;
  resuelta_at: string | null;
  aviso_enviado_at: string | null;
}

interface Info {
  ok: boolean;
  motivo?: string;
  inscripcion: {
    nombre: string;
    email: string | null;
    status: string;
    payment_status: string;
    carrera: string;
    fecha_carrera: string;
  };
  cedida: boolean;
  equipo: boolean;
  politica: { dias_hasta_carrera: number; tiene_tramos: boolean; porcentaje: number | null };
  cobros: Cobro[];
  devoluciones: Devolucion[];
}

interface Resultado {
  estado?: "hecha" | "rechazada" | "dudosa" | "pendiente";
  ok?: boolean;
  repetida?: boolean;
  error?: string;
  motivo?: string;
  error_code?: string | null;
  ds_response?: string | null;
  disponible_cent?: number;
}

const euros = (cent: number) =>
  (cent / 100).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

const fecha = (iso: string | null, conSegundos = false) =>
  iso
    ? new Date(iso).toLocaleString("es-ES", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        ...(conSegundos ? { second: "2-digit" } : {}),
      })
    : "—";

/** "12,50" / "12.5" / "12" → céntimos; null si no es un importe */
function aCentimos(texto: string): number | null {
  const t = texto.trim().replace(/\s|€/g, "");
  if (!/^\d+([.,]\d{1,2})?$/.test(t)) return null;
  const [entero, decimales = ""] = t.replace(",", ".").split(".");
  return parseInt(entero, 10) * 100 + parseInt((decimales + "00").slice(0, 2), 10);
}

const aTexto = (cent: number) => (cent / 100).toFixed(2).replace(".", ",");

const ESTADO_INSCRIPCION: Record<string, string> = {
  confirmed: "confirmada",
  pending: "pendiente",
  cancelled: "anulada",
};
const ESTADO_PAGO: Record<string, string> = {
  paid: "pagada",
  pending: "pendiente de pago",
  refunded: "reembolsada",
  not_required: "sin pago",
};

// Qué ha dicho Redsys (o Camberas), en cristiano
const EXPLICACION: Record<string, string> = {
  SIS0054: "Redsys no encuentra el cobro original.",
  SIS0056: "El cobro original no figura como autorizado en Redsys.",
  SIS0057: "El importe supera lo que queda por devolver de ese cobro en Redsys.",
  SIS0214: "El comercio no tiene permitidas las devoluciones: hay que pedírselo al banco.",
  SIS0268: "El comercio no admite devoluciones por la API: hay que pedírselo al banco.",
  SIS0417: "Fuera de plazo: han pasado más de 365 días desde el cobro.",
  SIS0626: "Ese cobro ya estaba anulado.",
  SIS0041: "Error de firma: la clave del TPV no cuadra.",
  SIS0042: "Error de firma: la clave del TPV no cuadra.",
  SIS0412: "Error de firma: la clave del TPV no cuadra.",
  "0950": "Redsys no permite esta devolución.",
  CAMBERAS_TPV: "Ese cobro se hizo con un comercio que Camberas no sabe devolver.",
  CAMBERAS_SIN_RESPUESTA: "Redsys no contestó a tiempo.",
  CAMBERAS_FIRMA: "La respuesta de Redsys no venía bien firmada.",
  CAMBERAS_NO_CUADRA: "La respuesta de Redsys no cuadra con lo pedido.",
  CAMBERAS_NO_APUNTADA: "Redsys contestó, pero Camberas no pudo apuntar el resultado.",
  MANUAL_NO_HECHA: "Marcada a mano como no hecha.",
};

const MOTIVO_RESERVA: Record<string, string> = {
  en_curso: "Hay una devolución de este cobro sin confirmar. Resuélvela antes de pedir otra.",
  supera_disponible: "El importe supera lo que queda por devolver de ese cobro.",
  cambio_desde_que_abriste:
    "Lo devuelto de este cobro ha cambiado desde que abriste el diálogo (otra pestaña u otra persona). Revisa el historial antes de seguir.",
  cobro_no_completado: "Ese cobro no está completado.",
  cobro_de_otra_inscripcion: "Ese cobro no es de esta inscripción.",
  lote_equipo: "Ese cobro es de un lote de equipo: todavía se devuelve a mano en el portal de Redsys.",
  tpv_propio: "Cobrado con el TPV propio del organizador: se devuelve desde su banco.",
  cobro_no_existe: "No existe ese cobro.",
  id_reutilizado: "Petición repetida con otros datos. Cierra y vuelve a abrir el diálogo.",
  ya_resuelta: "Esa devolución ya estaba resuelta.",
  demasiado_pronto: "Espera 15 minutos desde la petición antes de darla por no hecha: Redsys puede tardar en reflejarla.",
};

function explicar(r: { error_code?: string | null; ds_response?: string | null }) {
  const codigo = r.error_code ?? r.ds_response ?? "";
  return EXPLICACION[codigo] ?? (codigo ? `Código ${codigo}.` : "");
}

const sinConfirmar = (d: Devolucion) => d.estado === "dudosa" || d.atascada;

function EstadoBadge({ d }: { d: Devolucion }) {
  if (d.estado === "hecha") return <Badge>Hecha</Badge>;
  if (d.estado === "rechazada") return <Badge variant="destructive">No hecha</Badge>;
  if (sinConfirmar(d)) {
    return (
      <Badge variant="outline" className="border-amber-500 text-amber-700">
        Sin confirmar
      </Badge>
    );
  }
  return <Badge variant="secondary">Esperando a Redsys</Badge>;
}

// Respuesta que el panel entiende; cualquier otra cosa se trata como "no
// sabemos si llegó" y se reintenta con el mismo id
const esRespuestaConocida = (r: Resultado | null | undefined) =>
  !!r && (typeof r.estado === "string" || typeof r.motivo === "string" || r.ok === true);

async function llamarFuncion(body: Record<string, unknown>): Promise<Resultado> {
  const { data, error } = await supabase.functions.invoke("redsys-devolucion", { body });
  if (error) {
    const contexto = (error as { context?: { status?: number; json?: () => Promise<unknown> } }).context;
    const status = contexto?.status;
    let cuerpo: Resultado | null = null;
    try {
      cuerpo = (await contexto?.json?.()) as Resultado;
    } catch {
      /* sin cuerpo legible */
    }
    // Un 5xx (la función pudo morir después de llamar a Redsys) o un cuerpo
    // que no es nuestro: no se puede dar por fallida
    if (!status || status >= 500 || !cuerpo) throw new Error(error.message);
    if (!esRespuestaConocida(cuerpo)) {
      if (status < 500 && typeof cuerpo.error === "string") return cuerpo;
      throw new Error(error.message);
    }
    return cuerpo;
  }
  if (!esRespuestaConocida(data as Resultado)) throw new Error("Respuesta inesperada");
  return data as Resultado;
}

interface Props {
  registrationId: string | null;
  onOpenChange: (open: boolean) => void;
  /** Tras cualquier envío (salga como salga): para refrescar la tabla */
  onCambio?: () => void;
}

export function DevolucionDialog({ registrationId, onOpenChange, onCambio }: Props) {
  const [info, setInfo] = useState<Info | null>(null);
  const [cargando, setCargando] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [errorResolver, setErrorResolver] = useState<string | null>(null);

  const [cobroId, setCobroId] = useState<string | null>(null);
  const [externa, setExterna] = useState(false);
  const [importeTexto, setImporteTexto] = useState("");
  const [motivo, setMotivo] = useState("");
  const [cancelar, setCancelar] = useState(true);
  const [notificar, setNotificar] = useState(true);

  const [paso, setPaso] = useState<"form" | "confirmar" | "resultado">("form");
  const [peticionId, setPeticionId] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [sinRespuesta, setSinRespuesta] = useState(false);
  const [resolviendo, setResolviendo] = useState<{ id: string; estado: "hecha" | "rechazada" } | null>(null);

  // Para descartar respuestas tardías de otra inscripción
  const cargaActual = useRef(0);
  const primeraCarga = useRef(true);
  const huboEnvio = useRef(false);

  const cargar = useCallback(async (): Promise<Info | null> => {
    if (!registrationId) return null;
    const miCarga = ++cargaActual.current;
    setCargando(true);
    setErrorCarga(null);
    const { data, error } = await supabase.rpc("devolucion_info" as never, { p_registration_id: registrationId } as never);
    if (miCarga !== cargaActual.current) return null;
    setCargando(false);
    if (error) {
      setErrorCarga(error.message);
      return null;
    }
    const i = data as unknown as Info;
    if (!i?.ok) {
      setErrorCarga("No se encuentra la inscripción.");
      return null;
    }
    setInfo(i);
    const devolvible = i.cobros.find((c) => c.soportado && c.disponible_cent > 0);
    setCobroId((actual) =>
      actual && i.cobros.some((c) => c.payment_intent_id === actual) ? actual : devolvible?.payment_intent_id ?? null,
    );
    if (primeraCarga.current) {
      primeraCarga.current = false;
      const yaAnulada = i.inscripcion.status === "cancelled";
      // Con el dorsal cedido o con varios cobros, anular no es lo normal
      setCancelar(yaAnulada || (!i.cedida && i.cobros.length <= 1));
      setNotificar(!i.cedida);
      // Si ya se devolvió algo, no se propone devolver el resto de golpe
      if (devolvible && devolvible.devuelto_cent === 0) setImporteTexto(aTexto(devolvible.disponible_cent));
    }
    return i;
  }, [registrationId]);

  useEffect(() => {
    if (!registrationId) return;
    primeraCarga.current = true;
    huboEnvio.current = false;
    setInfo(null);
    setCobroId(null);
    setExterna(false);
    setImporteTexto("");
    setMotivo("");
    setCancelar(true);
    setNotificar(true);
    setPaso("form");
    setPeticionId(null);
    setResultado(null);
    setSinRespuesta(false);
    setResolviendo(null);
    setErrorResolver(null);
    cargar();
  }, [registrationId, cargar]);

  const cobro = useMemo(() => info?.cobros.find((c) => c.payment_intent_id === cobroId) ?? null, [info, cobroId]);
  const importe = aCentimos(importeTexto);
  const importeValido = importe !== null && importe >= 1 && !!cobro && importe <= cobro.disponible_cent;
  const yaAnulada = info?.inscripcion.status === "cancelled";
  const motivoValido = !externa || motivo.trim().length > 0;

  // Lo que tocaría según la política SI CANCELARA HOY, descontando lo devuelto
  const sugerenciaPolitica = useMemo(() => {
    if (!cobro || info?.politica.porcentaje == null) return null;
    const objetivo = Math.floor((cobro.cobrado_cent * info.politica.porcentaje) / 100);
    const cent = Math.min(Math.max(objetivo - cobro.devuelto_cent - cobro.en_curso_cent, 0), cobro.disponible_cent);
    return cent > 0 ? { pct: info.politica.porcentaje, cent } : null;
  }, [cobro, info]);

  // Mientras alguna devolución espera a Redsys, se vuelve a mirar cada pocos
  // segundos (Redsys contesta en menos de un minuto)
  const esperando = info?.devoluciones.some((d) => d.estado === "pendiente" && !d.atascada) ?? false;
  useEffect(() => {
    if (!registrationId || !esperando) return;
    let vueltas = 0;
    const t = setInterval(() => {
      if (++vueltas > 20) clearInterval(t);
      cargar();
    }, 4000);
    return () => clearInterval(t);
  }, [registrationId, esperando, cargar]);

  // Si el resultado que se enseña era "esperando" y la fila ya se resolvió, se actualiza
  useEffect(() => {
    if (paso !== "resultado" || !peticionId || !info) return;
    const fila = info.devoluciones.find((d) => d.id === peticionId);
    if (fila && fila.estado !== resultado?.estado && (resultado?.estado === "pendiente" || resultado?.estado === "dudosa")) {
      setResultado({ estado: fila.estado, error_code: fila.error_code, ds_response: fila.ds_response });
    }
  }, [info, paso, peticionId, resultado?.estado]);

  const cerrar = () => {
    if (enviando) return;
    if (huboEnvio.current) onCambio?.();
    onOpenChange(false);
  };

  const continuar = () => {
    if (!importeValido || !motivoValido) return;
    setPeticionId(crypto.randomUUID());
    setSinRespuesta(false);
    setPaso("confirmar");
  };

  const enviar = async () => {
    if (!peticionId || !cobro || importe === null || !registrationId) return;
    setEnviando(true);
    huboEnvio.current = true;
    try {
      const r = await llamarFuncion({
        accion: externa ? "externa" : "devolver",
        id: peticionId,
        payment_intent_id: cobro.payment_intent_id,
        registration_id: registrationId,
        importe_cent: importe,
        motivo,
        cancelar: yaAnulada ? true : cancelar,
        notificar,
        comprometido_visto_cent: cobro.devuelto_cent + cobro.en_curso_cent,
      });
      setSinRespuesta(false);
      setResultado(r);
      setPaso("resultado");
      await cargar();
    } catch {
      // No sabemos si la petición llegó. Se mira si la fila existe; si no,
      // solo queda reintentar con el MISMO id
      const i = await cargar();
      const fila = i?.devoluciones.find((d) => d.id === peticionId);
      if (fila) {
        setSinRespuesta(false);
        setResultado({ estado: fila.estado, error_code: fila.error_code, ds_response: fila.ds_response });
        setPaso("resultado");
      } else {
        setSinRespuesta(true);
      }
    } finally {
      setEnviando(false);
    }
  };

  const resolver = async () => {
    if (!resolviendo) return;
    setEnviando(true);
    setErrorResolver(null);
    huboEnvio.current = true;
    try {
      const r = await llamarFuncion({ accion: "resolver", id: resolviendo.id, estado: resolviendo.estado });
      await cargar();
      if (!r.ok) setErrorResolver(MOTIVO_RESERVA[r.motivo ?? ""] ?? r.error ?? "No se ha podido resolver.");
      setResolviendo(null);
    } catch (e) {
      setErrorResolver(e instanceof Error ? e.message : String(e));
    } finally {
      setEnviando(false);
    }
  };

  const nuevaDevolucion = () => {
    setPaso("form");
    setResultado(null);
    setPeticionId(null);
    setExterna(false);
    setMotivo("");
    setImporteTexto("");
  };

  const hayDudosas = info?.devoluciones.some(sinConfirmar) ?? false;
  const reembolsadaSinApuntar =
    info?.inscripcion.payment_status === "refunded" && !info.devoluciones.some((d) => d.estado === "hecha");

  return (
    <Dialog open={!!registrationId} onOpenChange={(o) => !o && cerrar()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Devolver dinero</DialogTitle>
          <DialogDescription>
            {info
              ? `${info.inscripcion.nombre} · ${info.inscripcion.carrera} · inscripción ${
                  ESTADO_INSCRIPCION[info.inscripcion.status] ?? info.inscripcion.status
                }, ${ESTADO_PAGO[info.inscripcion.payment_status] ?? info.inscripcion.payment_status}`
              : "Cobros y devoluciones de la inscripción"}
          </DialogDescription>
        </DialogHeader>

        {cargando && !info && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6" role="status">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando cobros…
          </div>
        )}
        {errorCarga && (
          <p className="text-sm text-destructive" role="alert">
            {errorCarga}
          </p>
        )}

        {info && (
          <div className="space-y-4">
            {/* Cobros */}
            {info.cobros.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {info.equipo
                  ? "Esta inscripción se pagó dentro de un lote de equipo: esa devolución todavía se hace a mano en el portal de Redsys."
                  : "Esta inscripción no tiene ningún cobro completado por Redsys en Camberas."}
              </p>
            ) : (
              <div className="space-y-2" role={info.cobros.length > 1 ? "radiogroup" : undefined} aria-label="Cobro a devolver">
                {info.cobros.map((c) => (
                  <label
                    key={c.payment_intent_id}
                    className={`flex items-start gap-3 rounded-md border p-3 text-sm ${
                      c.payment_intent_id === cobroId ? "border-primary" : ""
                    } ${c.soportado ? "cursor-pointer" : "opacity-70"}`}
                  >
                    {info.cobros.length > 1 && (
                      <input
                        type="radio"
                        name="cobro-devolucion"
                        className="mt-1"
                        checked={c.payment_intent_id === cobroId}
                        disabled={!c.soportado || paso !== "form"}
                        onChange={() => {
                          setCobroId(c.payment_intent_id);
                          setImporteTexto(c.devuelto_cent === 0 ? aTexto(c.disponible_cent) : "");
                        }}
                      />
                    )}
                    <div className="flex-1 space-y-0.5">
                      <div className="font-medium">
                        {euros(c.cobrado_cent)} cobrados el {fecha(c.fecha)}
                      </div>
                      <div className="text-muted-foreground">
                        Referencia de pago {c.order_number}
                        {c.titular ? ` · pagó ${c.titular}` : ""}
                      </div>
                      <div>
                        Devuelto {euros(c.devuelto_cent)}
                        {c.en_curso_cent > 0 && ` · sin confirmar ${euros(c.en_curso_cent)}`}
                        {" · "}
                        <strong>Queda {euros(c.disponible_cent)}</strong>
                      </div>
                      {!c.soportado && c.motivo_no && <div className="text-muted-foreground">{c.motivo_no}</div>}
                    </div>
                  </label>
                ))}
              </div>
            )}

            {info.cobros.length > 1 && (
              <Aviso>
                Esta inscripción tiene {info.cobros.length} cobros. Si devuelves uno duplicado, deja la inscripción sin
                anular: el otro cobro sigue siendo su pago.
              </Aviso>
            )}

            {info.cedida && (
              <Aviso>
                Este dorsal se cedió a otra persona. El dinero vuelve a la tarjeta de quien pagó, no al corredor actual, y
                anular deja sin plaza al titular actual. Por eso anular y avisar por email vienen desmarcados.
              </Aviso>
            )}

            {reembolsadaSinApuntar && (
              <Aviso>
                Consta como reembolsada, pero Camberas no tiene apuntada ninguna devolución. Puede que se devolviera a mano
                en el portal de Redsys: míralo en Canales y, si ya salió, apúntala como hecha fuera en vez de devolver otra
                vez.
              </Aviso>
            )}

            {hayDudosas && (
              <Aviso>
                Hay una devolución sin confirmar. Busca la referencia de pago en el portal de Redsys (Canales), mira si
                aparece la devolución y márcala abajo. Hasta entonces no se puede pedir otra de ese cobro.
              </Aviso>
            )}

            {/* Formulario */}
            {paso === "form" && cobro && cobro.soportado && cobro.disponible_cent > 0 && (
              <div className="space-y-3 border-t pt-4">
                <div className="space-y-1.5">
                  <Label htmlFor="importe-devolucion">Importe a devolver (€)</Label>
                  <div className="flex flex-wrap gap-2">
                    <Input
                      id="importe-devolucion"
                      inputMode="decimal"
                      value={importeTexto}
                      onChange={(e) => setImporteTexto(e.target.value)}
                      className="w-32"
                      aria-invalid={!!importeTexto && !importeValido}
                      aria-describedby="importe-devolucion-ayuda"
                    />
                    <Button type="button" variant="outline" size="sm" onClick={() => setImporteTexto(aTexto(cobro.disponible_cent))}>
                      Todo lo que queda
                    </Button>
                    {sugerenciaPolitica && (
                      <Button type="button" variant="outline" size="sm" onClick={() => setImporteTexto(aTexto(sugerenciaPolitica.cent))}>
                        Política {sugerenciaPolitica.pct} %
                      </Button>
                    )}
                  </div>
                  <p id="importe-devolucion-ayuda" className="text-xs text-muted-foreground">
                    {importeTexto && !importeValido ? (
                      <span className="text-destructive">Pon un importe entre 0,01 € y {euros(cobro.disponible_cent)}.</span>
                    ) : sugerenciaPolitica ? (
                      `Si cancelara hoy (faltan ${info.politica.dias_hasta_carrera} días), su política de cancelación daría el ${sugerenciaPolitica.pct} %: quedan ${euros(sugerenciaPolitica.cent)} por devolver hasta ese porcentaje.`
                    ) : (
                      `Como mucho ${euros(cobro.disponible_cent)}.`
                    )}
                  </p>
                </div>

                <label className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Checkbox
                    className="mt-0.5"
                    checked={externa}
                    onCheckedChange={(v) => {
                      setExterna(v === true);
                      // Lo hecho fuera normalmente ya se le comunicó por otra vía
                      if (v === true) setNotificar(false);
                    }}
                  />
                  <span>Ya la he devuelto en el portal de Redsys: solo apuntarla (no se pide nada a Redsys)</span>
                </label>

                <div className="space-y-1.5">
                  <Label htmlFor="motivo-devolucion">
                    {externa ? "Fecha o referencia que ves en Canales (obligatorio)" : "Motivo (opcional, solo para el historial)"}
                  </Label>
                  <Textarea
                    id="motivo-devolucion"
                    rows={2}
                    maxLength={500}
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder={externa ? "Ej.: devuelta en Canales el 25/09 a las 12:40" : "Ej.: lesión, cancelación dentro de plazo…"}
                    aria-invalid={!motivoValido}
                  />
                </div>

                {yaAnulada ? (
                  <p className="text-sm text-muted-foreground">
                    La inscripción ya está anulada: quedará como reembolsada.
                  </p>
                ) : (
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={cancelar} onCheckedChange={(v) => setCancelar(v === true)} />
                    Anular la inscripción (libera la plaza)
                  </label>
                )}
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={notificar} onCheckedChange={(v) => setNotificar(v === true)} />
                  Avisar al corredor por email
                </label>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={cerrar}>
                    Cerrar
                  </Button>
                  <Button onClick={continuar} disabled={!importeValido || !motivoValido}>
                    {externa ? "Apuntar devolución" : `Devolver ${importe !== null ? euros(importe) : ""}`}
                  </Button>
                </div>
              </div>
            )}

            {/* Confirmación: el dinero sale de verdad */}
            {paso === "confirmar" && cobro && importe !== null && (
              <div className="space-y-3 border-t pt-4 text-sm">
                {externa ? (
                  <p>
                    Vas a apuntar una devolución de <strong>{euros(importe)}</strong> del cobro {cobro.order_number} que ya
                    hiciste en el portal de Redsys. Camberas no pedirá nada a Redsys.
                  </p>
                ) : (
                  <p>
                    Vas a devolver <strong>{euros(importe)}</strong> a la tarjeta que pagó el cobro {cobro.order_number}.
                    Redsys lo abona en unos días y no se puede deshacer desde Camberas.
                  </p>
                )}
                <ul className="list-disc pl-5 text-muted-foreground">
                  <li>
                    {yaAnulada
                      ? "La inscripción ya está anulada y quedará como reembolsada."
                      : cancelar
                        ? "La inscripción quedará anulada y la plaza libre."
                        : "La inscripción seguirá activa y pagada."}
                  </li>
                  <li>{notificar ? "El corredor recibirá un email." : "No se avisará al corredor."}</li>
                </ul>
                {sinRespuesta && (
                  <Aviso rol="status">
                    No ha llegado respuesta y no sabemos si la petición salió. Pulsa Reintentar: es la misma petición y no
                    se devolverá dos veces. Si cierras, al volver a abrir verás en el historial cómo quedó.
                  </Aviso>
                )}
                <div className="flex justify-end gap-2">
                  {sinRespuesta ? (
                    <Button variant="outline" onClick={cerrar} disabled={enviando}>
                      Cerrar
                    </Button>
                  ) : (
                    <Button variant="outline" onClick={() => setPaso("form")} disabled={enviando}>
                      Volver
                    </Button>
                  )}
                  <Button onClick={enviar} disabled={enviando}>
                    {enviando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {sinRespuesta ? "Reintentar" : externa ? "Sí, apuntarla" : `Sí, devolver ${euros(importe)}`}
                  </Button>
                </div>
              </div>
            )}

            {/* Resultado */}
            {paso === "resultado" && resultado && (
              <div className="space-y-3 border-t pt-4 text-sm" role="status">
                {resultado.estado === "hecha" && (
                  <Linea icono={<CheckCircle2 className="h-5 w-5 text-primary shrink-0" />}>
                    {externa ? "Devolución apuntada." : "Devolución hecha: Redsys la ha aceptado."}
                  </Linea>
                )}
                {resultado.estado === "rechazada" && (
                  <Linea icono={<XCircle className="h-5 w-5 text-destructive shrink-0" />}>
                    Redsys no la ha hecho. {explicar(resultado)} No se ha movido dinero ni se ha tocado la inscripción.
                  </Linea>
                )}
                {resultado.estado === "pendiente" && (
                  <Linea icono={<Loader2 className="h-5 w-5 animate-spin shrink-0" />}>
                    Redsys todavía está contestando. Espera unos segundos: esta pantalla se actualiza sola.
                  </Linea>
                )}
                {resultado.estado === "dudosa" && (
                  <Linea icono={<AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />}>
                    No sabemos si Redsys la ha hecho. {explicar(resultado)} Mírala en el portal de Redsys (Canales) y
                    márcala en el historial de abajo.
                  </Linea>
                )}
                {!resultado.estado && (
                  <Linea icono={<XCircle className="h-5 w-5 text-destructive shrink-0" />}>
                    {MOTIVO_RESERVA[resultado.motivo ?? ""] ?? resultado.error ?? "No se ha podido hacer."}
                  </Linea>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={nuevaDevolucion}>
                    Otra devolución
                  </Button>
                  <Button onClick={cerrar}>Cerrar</Button>
                </div>
              </div>
            )}

            {/* Historial */}
            {info.devoluciones.length > 0 && (
              <div className="space-y-2 border-t pt-4">
                <p className="text-sm font-medium">Historial de devoluciones</p>
                {errorResolver && (
                  <p className="text-sm text-destructive" role="alert">
                    {errorResolver}
                  </p>
                )}
                {info.devoluciones.map((d) => (
                  <div key={d.id} className="rounded-md border p-2.5 text-sm space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span>
                        <strong>{euros(d.importe_cent)}</strong> · pedida el {fecha(d.created_at, true)}
                        {d.origen === "externa" && " · apuntada a mano"}
                      </span>
                      <EstadoBadge d={d} />
                    </div>
                    <div className="text-muted-foreground">
                      Cobro {d.order_number}
                      {d.ds_authorisation_code && ` · autorización ${d.ds_authorisation_code}`}
                      {d.resuelta_at && ` · resuelta el ${fecha(d.resuelta_at, true)}`}
                      {d.estado === "hecha" && (d.cancelar ? " · anuló la inscripción" : " · sin anular")}
                    </div>
                    {d.motivo && <div className="text-muted-foreground">{d.motivo}</div>}
                    {(d.error_code || (d.estado === "rechazada" && d.ds_response)) && (
                      <div className="text-muted-foreground">{explicar(d)}</div>
                    )}
                    {sinConfirmar(d) &&
                      (resolviendo?.id === d.id ? (
                        <div className="space-y-2 pt-1">
                          <p>
                            {resolviendo.estado === "hecha"
                              ? `¿Confirmas que en Canales aparece esta devolución de ${euros(d.importe_cent)}? ${
                                  d.cancelar ? "Anulará la inscripción" : "No anulará la inscripción"
                                }${d.notificar ? " y avisará al corredor por email" : ""}.`
                              : `¿Confirmas que en Canales NO aparece esta devolución de ${euros(d.importe_cent)}? Quedará como no hecha y se podrá pedir otra.`}
                          </p>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={resolver} disabled={enviando}>
                              {enviando && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                              Confirmar
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setResolviendo(null)} disabled={enviando}>
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2 pt-1">
                          <Button size="sm" variant="outline" onClick={() => setResolviendo({ id: d.id, estado: "hecha" })}>
                            Sí se hizo
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setResolviendo({ id: d.id, estado: "rechazada" })}>
                            No se hizo
                          </Button>
                        </div>
                      ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Aviso({ children, rol }: { children: ReactNode; rol?: "status" | "alert" }) {
  return (
    <div className="flex gap-2 rounded-md border border-amber-500 p-3 text-sm" role={rol}>
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
      <span>{children}</span>
    </div>
  );
}

function Linea({ icono, children }: { icono: ReactNode; children: ReactNode }) {
  return (
    <div className="flex gap-2">
      {icono}
      <span>{children}</span>
    </div>
  );
}
