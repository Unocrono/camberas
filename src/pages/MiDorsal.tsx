/**
 * Mi dorsal — la página del corredor, con su QR para la recogida.
 *
 * Llega aquí desde el enlace del email de pago confirmado. La URL lleva el
 * token de SU inscripción (registrations.token_inscripcion): la enseña en el
 * móvil y en la mesa de recogida escanean el QR — que lleva esta misma URL,
 * la regla de la casa (docs/tokens-camberas.md): URL, no UUID pelado.
 *
 * Enseña lo justo: nombre de pila, carrera, recorrido y dorsal. Ni email,
 * ni DNI, ni teléfono — la RPC mi_dorsal_info no los devuelve.
 */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { qrConLogo } from "@/lib/qrConLogo";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

const db = supabase as any;

interface Info {
  estado: "ok" | "pendiente_pago" | "no_existe";
  nombre: string;
  dorsal: number | null;
  race_name: string;
  race_date: string;
  race_location: string | null;
  recorrido: string;
  entregado: boolean;
  entregado_at: string | null;
}

const MiDorsal = () => {
  const { token } = useParams();
  const [info, setInfo] = useState<Info | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const cargar = async () => {
      if (!token) return;
      const { data } = await db.rpc("mi_dorsal_info", { p_token: token });
      setInfo(data as Info | null);
      setCargando(false);
      if ((data as Info | null)?.estado === "ok") {
        // El QR lleva esta misma URL: quien lo escanee con la cámara del
        // sistema también aterriza aquí
        setQr(await qrConLogo(window.location.href));
      }
    };
    cargar();
  }, [token]);

  if (cargando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!info || info.estado === "no_existe") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <AlertCircle className="h-14 w-14 text-destructive" />
        <h1 className="text-2xl font-bold">Enlace no válido</h1>
        <p className="text-muted-foreground max-w-md">
          Comprueba que has abierto la dirección entera desde tu email de confirmación.
        </p>
      </div>
    );
  }

  const fecha = new Date(info.race_date + "T12:00:00").toLocaleDateString("es-ES", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div className="min-h-screen bg-background flex flex-col items-center px-5 py-8">
      <div className="w-full max-w-sm space-y-5 text-center">
        <div>
          <p className="text-sm text-muted-foreground">Hola, {info.nombre}</p>
          <h1 className="font-archivo text-2xl uppercase mt-1">{info.race_name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {info.recorrido} · {fecha}
            {info.race_location ? ` · ${info.race_location}` : ""}
          </p>
        </div>

        {info.estado === "pendiente_pago" ? (
          <div className="rounded-2xl border border-border bg-card p-6 space-y-2">
            <AlertCircle className="h-10 w-10 mx-auto text-secondary" />
            <p className="font-semibold">Tu inscripción está pendiente de pago</p>
            <p className="text-sm text-muted-foreground">
              Cuando el pago esté confirmado, aquí aparecerán tu dorsal y tu código
              para la recogida.
            </p>
          </div>
        ) : (
          <>
            <div className="rounded-2xl bg-primary text-primary-foreground py-6">
              <p className="text-xs uppercase tracking-widest opacity-80">Dorsal</p>
              <p className="text-7xl font-bold font-mono leading-none mt-1">
                {info.dorsal ?? "—"}
              </p>
            </div>

            {info.entregado ? (
              <p className="flex items-center justify-center gap-2 rounded-xl bg-primary/10 text-primary px-4 py-3 font-semibold">
                <CheckCircle2 className="h-5 w-5" />
                Dorsal ya recogido
              </p>
            ) : (
              <div className="rounded-2xl border border-border bg-white p-5 space-y-3">
                {qr ? (
                  <img src={qr} alt="Tu código para la recogida de dorsales" className="w-full" />
                ) : (
                  <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary" />
                )}
                <p className="text-sm text-neutral-600">
                  Enseña este código en la <strong>mesa de recogida de dorsales</strong>:
                  te atienden en segundos.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default MiDorsal;
