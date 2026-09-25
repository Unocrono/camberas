import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CreditCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useTenant } from "@/tenant/TenantContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DynamicRegistrationForm } from "@/components/DynamicRegistrationForm";
import { RedsysPaymentForm } from "@/components/payment/RedsysPaymentForm";
import type { EventoPublico, Prueba } from "./tipos";

/**
 * Diálogo de inscripción de la web de la carrera. Es el flujo de INVITADO de
 * RaceDetail.tsx (l. 465-590) sacado a un componente para que lo use
 * cualquier plantilla: formulario dinámico, cupón validado en servidor,
 * guest-register y pago Redsys que vuelve a la web de la carrera.
 *
 * Sin sesión a propósito: la web de la carrera no tiene cuentas (bajo dominio
 * propio la sesión de camberas.com no existe). En camberas.com, quien tenga
 * cuenta puede inscribirse "con su cuenta" desde la ficha clásica, y aquí se
 * le ofrece ese enlace.
 */
interface Props {
  evento: EventoPublico;
  prueba: Prueba;
  abierto: boolean;
  onOpenChange: (abierto: boolean) => void;
  /** Cupón que venía en el enlace (?cupon=): se aplica solo al abrir */
  cuponInicial?: string;
  /** Inscripción gratuita completada (las de pago terminan en /inscripcion/ok) */
  onInscrito?: (registrationId: string) => void;
}

interface CuponAplicado {
  code: string;
  couponId?: string;
  discount?: number;
}

export function InscripcionDialog({ evento, prueba, abierto, onOpenChange, cuponInicial, onInscrito }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { modo, urlCamberas } = useTenant();

  const [datos, setDatos] = useState<Record<string, unknown>>({});
  const [suplemento, setSuplemento] = useState(0);
  const [camposQueFaltan, setCamposQueFaltan] = useState<string[]>([]);
  const [cuponTexto, setCuponTexto] = useState(cuponInicial ?? "");
  const [cupon, setCupon] = useState<CuponAplicado | null>(null);
  const [cuponError, setCuponError] = useState<string | null>(null);
  const [validandoCupon, setValidandoCupon] = useState(false);
  const [paso, setPaso] = useState<"form" | "pago">("form");
  const [pendiente, setPendiente] = useState<{ id: string; email: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const cuponInicialAplicado = useRef(false);

  const precioBase = prueba.precio ?? 0;
  const descuento = cupon?.discount ?? 0;
  const total = Math.max(0, Math.round((precioBase + suplemento - descuento) * 100) / 100);

  // Al abrir: estado limpio y, si venía cupón en el enlace, se valida solo
  useEffect(() => {
    if (!abierto) return;
    setPaso("form");
    setPendiente(null);
    setCupon(null);
    setCuponError(null);
    setCuponTexto(cuponInicial ?? "");
    if (cuponInicial && !cuponInicialAplicado.current) {
      cuponInicialAplicado.current = true;
      setTimeout(() => aplicarCupon(cuponInicial, false), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, prueba.id]);

  // Si cambian los extras con cupón puesto, el descuento puede variar
  // (cupones sobre el total): se revalida en silencio
  useEffect(() => {
    if (cupon) aplicarCupon(cupon.code, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suplemento]);

  const aplicarCupon = async (codigo: string, silencioso: boolean) => {
    const code = codigo.trim();
    if (!code) return;
    setValidandoCupon(true);
    if (!silencioso) setCuponError(null);
    try {
      const email = String(datos.email || "");
      const { data, error } = await supabase.functions.invoke("validate-coupon", {
        body: {
          code,
          raceId: evento.id,
          distanceId: prueba.id,
          email: /\S+@\S+\.\S+/.test(email) ? email : undefined,
          formData: datos,
        },
      });
      if (error) throw error;
      if (data?.valid) {
        setCupon(data);
        setCuponError(null);
      } else {
        setCupon(null);
        if (!silencioso) setCuponError(data?.reason || "Cupón no válido");
      }
    } catch {
      setCupon(null);
      if (!silencioso) setCuponError("No se pudo validar el cupón, inténtalo de nuevo");
    } finally {
      setValidandoCupon(false);
    }
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (camposQueFaltan.length > 0) {
      toast({ title: "Faltan campos obligatorios", description: camposQueFaltan.join(", "), variant: "destructive" });
      return;
    }
    const email = String(datos.email || "");
    const nombre = String(datos.first_name || "");
    const apellidos = String(datos.last_name || "");
    if (!email || !nombre || !apellidos) {
      toast({ title: "Campos requeridos", description: "Por favor completa todos los campos obligatorios", variant: "destructive" });
      return;
    }
    setEnviando(true);
    try {
      // Todo el flujo corre en servidor (service role): duplicados, dorsal
      // atómico, inscripción y respuestas
      const { data: result, error: fnError } = await supabase.functions.invoke("guest-register", {
        body: { raceId: evento.id, distanceId: prueba.id, formData: datos, couponCode: cupon?.code },
      });

      if (fnError) {
        let mensaje = fnError.message;
        let cuerpo: { error?: string; code?: string; retomarPath?: string } | null = null;
        try {
          cuerpo = await (fnError as { context?: { json?: () => Promise<typeof cuerpo> } }).context?.json?.() ?? null;
          if (cuerpo?.error) mensaje = cuerpo.error;
        } catch {
          /* mensaje genérico */
        }
        // Empezó y no llegó a pagar: se le lleva a terminarlo (vive en camberas.com)
        if (cuerpo?.code === "PENDIENTE" && cuerpo?.retomarPath) {
          toast({ title: "Ya habías empezado", description: "Te llevamos a terminar el pago que dejaste a medias." });
          window.location.assign(urlCamberas(cuerpo.retomarPath));
          return;
        }
        toast({ title: "Error al inscribirse", description: mensaje, variant: "destructive" });
        return;
      }

      if (!result.isFree) {
        setPendiente({ id: result.registrationId, email });
        setPaso("pago");
        return;
      }

      // Gratuita: ya está confirmada — email y cerrar
      try {
        await supabase.functions.invoke("send-registration-confirmation", {
          body: {
            userEmail: email,
            userName: `${nombre} ${apellidos}`,
            raceName: evento.nombre,
            raceDate: evento.fecha,
            raceLocation: evento.lugar?.nombre ?? "",
            distanceName: prueba.nombre,
            price: 0,
            isGuest: true,
          },
        });
      } catch (err) {
        console.error("No se pudo enviar el email de confirmación:", err);
      }
      toast({ title: "¡Inscripción completada!", description: `Te has inscrito correctamente. Revisa tu email (${email}).` });
      setDatos({});
      onOpenChange(false);
      onInscrito?.(result.registrationId);
    } catch (err) {
      toast({ title: "Error al inscribirse", description: err instanceof Error ? err.message : "Inténtalo de nuevo", variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  };

  const enlaceConCuenta = modo === "camberas" && user ? `/race/${evento.slug}?inscribir=${prueba.id}` : null;

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {paso === "pago" && (
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setPaso("form")} aria-label="Volver al formulario">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            {paso === "form" ? `Inscripción · ${prueba.nombre}` : `Pago · ${prueba.nombre}`}
          </DialogTitle>
          <DialogDescription>
            {paso === "form"
              ? "Completa tus datos para inscribirte. Recibirás la confirmación por email."
              : "Completa el pago con tarjeta para confirmar tu inscripción"}
          </DialogDescription>
        </DialogHeader>

        {paso === "form" ? (
          <>
            {enlaceConCuenta && (
              <div className="bg-muted/50 p-4 rounded-lg border border-border text-sm text-muted-foreground">
                Tienes sesión iniciada.{" "}
                <a href={enlaceConCuenta} className="underline text-foreground">
                  Inscríbete con tu cuenta
                </a>{" "}
                para que la inscripción aparezca en tu perfil.
              </div>
            )}

            <form onSubmit={enviar} className="space-y-6 mt-4">
              <DynamicRegistrationForm
                raceId={evento.id}
                distanceId={prueba.id}
                formData={datos}
                onChange={(campo, valor) => setDatos((prev) => ({ ...prev, [campo]: valor }))}
                onSupplementChange={setSuplemento}
                onMissingRequiredChange={setCamposQueFaltan}
                prefillFromProfile={false}
              />

              <div className="pt-4 border-t border-border">
                {precioBase + suplemento > 0 && (
                  <div className="mb-3">
                    {!cupon ? (
                      <>
                        <div className="flex gap-2">
                          <Input
                            value={cuponTexto}
                            onChange={(e) => setCuponTexto(e.target.value)}
                            placeholder="¿Tienes un código de descuento?"
                            className="uppercase"
                            maxLength={60}
                          />
                          <Button type="button" variant="outline" onClick={() => aplicarCupon(cuponTexto, false)} disabled={validandoCupon || !cuponTexto.trim()}>
                            {validandoCupon ? "..." : "Aplicar"}
                          </Button>
                        </div>
                        {cuponError && <p className="mt-1 text-sm text-destructive">{cuponError}</p>}
                      </>
                    ) : (
                      <div className="flex items-center justify-between rounded-md border border-border bg-muted/50 px-3 py-2 text-sm">
                        <span>
                          Cupón <strong>{cupon.code}</strong> aplicado
                        </span>
                        <Button type="button" variant="ghost" size="sm" className="h-auto p-0 text-muted-foreground" onClick={() => { setCupon(null); setCuponTexto(""); }}>
                          Quitar
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {(suplemento !== 0 || descuento > 0) && (
                  <div className="mb-2 space-y-1 text-sm text-muted-foreground">
                    <div className="flex justify-between"><span>Inscripción</span><span>{precioBase} €</span></div>
                    {suplemento !== 0 && (
                      <div className="flex justify-between"><span>Extras</span><span>{suplemento > 0 ? "+" : ""}{suplemento} €</span></div>
                    )}
                    {descuento > 0 && (
                      <div className="flex justify-between text-primary"><span>Descuento ({cupon?.code})</span><span>−{descuento} €</span></div>
                    )}
                  </div>
                )}
                <div className="flex justify-between items-center mb-4">
                  <span className="text-sm text-muted-foreground">Precio total:</span>
                  <span className="text-2xl font-bold">{total} €</span>
                </div>

                <Button type="submit" className="w-full" disabled={enviando}>
                  {enviando ? "Procesando..." : total > 0 ? (
                    <>
                      <CreditCard className="h-4 w-4 mr-2" />
                      Continuar al pago
                    </>
                  ) : (
                    "Confirmar inscripción"
                  )}
                </Button>
              </div>
            </form>
          </>
        ) : (
          <div className="py-4">
            <RedsysPaymentForm
              amount={total}
              registrationId={pendiente?.id}
              description={`${evento.nombre} - ${prueba.nombre}`}
              userEmail={pendiente?.email}
              onError={(mensaje) => toast({ title: "Error en el pago", description: mensaje, variant: "destructive" })}
              onCancel={() => {
                setPaso("form");
                toast({ title: "Pago cancelado", description: "Tu inscripción queda pendiente de pago." });
              }}
              isTest={false}
              retorno="web"
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
