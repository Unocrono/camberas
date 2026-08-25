/**
 * Retomar un pago que se quedó a medias.
 *
 * Aquí aterriza quien pulsa el botón del email que manda la Edge Function
 * `recuperar-pagos`. La identidad es el token del enlace, no una sesión: el
 * invitado sin cuenta es justo el que más se queda a medias.
 *
 * Los datos y el estado los decide la RPC `recuperacion_pago_info`, que
 * recalcula en el momento qué inscripciones siguen sin pagar — entre el
 * aviso y el clic pueden haber pagado, haberse llenado el recorrido o
 * haberse cerrado las inscripciones.
 *
 * Excepción de los equipos: el lote lo cobra `team-init-payment`, que exige
 * la sesión del capitán. Ahí sí hace falta iniciar sesión.
 */
import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock,
  Loader2,
  MapPin,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { RedsysPaymentForm } from "@/components/payment/RedsysPaymentForm";

type Estado =
  | "ok"
  | "pagado"
  | "cancelado"
  | "caducado"
  | "cerrado"
  | "completo"
  | "no_existe";

interface Info {
  estado: Estado;
  tipo: "individual" | "equipo";
  nombre: string | null;
  race_name: string;
  race_slug: string | null;
  race_date: string;
  race_location: string | null;
  distance_name: string;
  team_name: string | null;
  es_capitan: boolean;
  n_corredores: number;
  registration_ids: string[] | null;
}

const fechaLarga = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

/** Mensaje de cada final que no es "puedes pagar" */
const DESENLACES: Record<
  Exclude<Estado, "ok">,
  { titulo: string; texto: string; tono: "bien" | "aviso" }
> = {
  pagado: {
    titulo: "Esta inscripción ya está pagada",
    texto:
      "No hay nada pendiente. Si acabas de pagar, el correo de confirmación puede tardar unos minutos en llegar.",
    tono: "bien",
  },
  cancelado: {
    titulo: "Esta inscripción está cancelada",
    texto:
      "Ya no hay ningún pago pendiente. Si fue un error y sigues queriendo correr, escribe a la organización o inscríbete de nuevo.",
    tono: "aviso",
  },
  caducado: {
    titulo: "El enlace ha caducado",
    texto:
      "Este aviso tenía fecha de caducidad. Si sigues queriendo correr, puedes inscribirte de nuevo desde la página de la carrera.",
    tono: "aviso",
  },
  cerrado: {
    titulo: "Las inscripciones ya están cerradas",
    texto: "El plazo de esta carrera ha terminado y no se pueden completar más pagos.",
    tono: "aviso",
  },
  completo: {
    titulo: "El recorrido se ha completado",
    texto:
      "Mientras el pago estaba a medias se han agotado las plazas. Sentimos el aviso: no llegamos a tiempo.",
    tono: "aviso",
  },
  no_existe: {
    titulo: "Este enlace no es válido",
    texto: "Comprueba que has copiado la dirección entera desde el correo.",
    tono: "aviso",
  },
};

/**
 * Marco de la página. A nivel de módulo a propósito: declarado dentro del
 * componente sería un tipo nuevo en cada render, React remontaría el
 * subárbol y RedsysPaymentForm pediría un intent de pago cada vez.
 */
const Marco = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen flex flex-col">
    <Navbar />
    <main className="flex-1 container mx-auto px-4 py-12 max-w-xl">{children}</main>
    <Footer />
  </div>
);

const RetomarPago = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [info, setInfo] = useState<Info | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagando, setPagando] = useState(false);

  useEffect(() => {
    const cargar = async () => {
      if (!token) {
        setError("Falta el token del enlace");
        setCargando(false);
        return;
      }
      // La RPC no está en types.ts hasta que se regenere: va casteada
      const { data, error: rpcError } = await (supabase as any).rpc("recuperacion_pago_info", {
        p_token: token,
      });
      if (rpcError) {
        setError(rpcError.message);
      } else {
        setInfo(data as Info);
      }
      setCargando(false);
    };
    cargar();
    // El estado del lote depende de quién esté dentro (es_capitan)
  }, [token, user?.id]);

  if (cargando || authLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </main>
        <Footer />
      </div>
    );
  }

  if (error || !info) {
    return (
      <Marco>
        <Card className="border-destructive">
          <CardContent className="py-10 text-center space-y-3">
            <AlertCircle className="h-10 w-10 text-destructive mx-auto" />
            <h1 className="text-xl font-semibold">No hemos podido abrir el enlace</h1>
            <p className="text-muted-foreground">{error ?? "Inténtalo de nuevo en un momento."}</p>
            <Button variant="outline" onClick={() => navigate("/races")}>
              Ver carreras
            </Button>
          </CardContent>
        </Card>
      </Marco>
    );
  }

  const esEquipo = info.tipo === "equipo";

  // Ficha de la carrera, común a todos los desenlaces
  const ficha = (
    <div className="rounded-lg bg-muted/40 p-4 space-y-2 text-sm">
      <p className="font-semibold text-base">{info.race_name}</p>
      <p className="text-muted-foreground">{info.distance_name}</p>
      <p className="flex items-center gap-2 text-muted-foreground">
        <CalendarDays className="h-4 w-4" />
        {fechaLarga(info.race_date)}
      </p>
      {info.race_location && (
        <p className="flex items-center gap-2 text-muted-foreground">
          <MapPin className="h-4 w-4" />
          {info.race_location}
        </p>
      )}
      {esEquipo && (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Users className="h-4 w-4" />
          {info.team_name} · {info.n_corredores}{" "}
          {info.n_corredores === 1 ? "corredor" : "corredores"}
        </p>
      )}
    </div>
  );

  // ── Todo lo que no es "puedes pagar" ───────────────────────────────────
  if (info.estado !== "ok") {
    const d = DESENLACES[info.estado];
    return (
      <Marco>
        <Card>
          <CardContent className="py-10 space-y-5 text-center">
            {d.tono === "bien" ? (
              <CheckCircle2 className="h-12 w-12 text-primary mx-auto" />
            ) : (
              <Clock className="h-12 w-12 text-muted-foreground mx-auto" />
            )}
            <div className="space-y-2">
              <h1 className="text-xl font-semibold">{d.titulo}</h1>
              <p className="text-muted-foreground">{d.texto}</p>
            </div>
            {info.race_name && <div className="text-left">{ficha}</div>}
            {info.race_slug && (
              <Button asChild variant="outline">
                <Link to={`/${info.race_slug}`}>Ir a la carrera</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </Marco>
    );
  }

  // ── El lote de equipo lo cobra el capitán, con su sesión ───────────────
  if (esEquipo && !info.es_capitan) {
    return (
      <Marco>
        <Card>
          <CardContent className="py-10 space-y-5 text-center">
            <Users className="h-12 w-12 text-muted-foreground mx-auto" />
            <div className="space-y-2">
              <h1 className="text-xl font-semibold">
                {user ? "Esta cuenta no es la del capitán" : "Inicia sesión para pagar el lote"}
              </h1>
              <p className="text-muted-foreground">
                {user
                  ? "El pago del equipo solo puede lanzarlo quien lo creó. Entra con la cuenta del capitán y vuelve a abrir el enlace."
                  : "El pago de un equipo va en un solo cargo del capitán, así que necesitamos que entres con su cuenta."}
              </p>
            </div>
            <div className="text-left">{ficha}</div>
            {!user && (
              <Button
                onClick={() => navigate(`/auth?returnTo=${encodeURIComponent(`/retomar-pago/${token}`)}`)}
              >
                Iniciar sesión
              </Button>
            )}
          </CardContent>
        </Card>
      </Marco>
    );
  }

  const ids = info.registration_ids ?? [];

  return (
    <Marco>
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">
            {info.nombre ? `${info.nombre}, te falta un paso` : "Te falta un paso"}
          </h1>
          <p className="text-muted-foreground">
            {esEquipo
              ? "Tus datos y los de tu equipo siguen guardados. Solo queda completar el pago."
              : "Tus datos siguen guardados. Solo queda completar el pago."}
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Lo que estabas contratando</CardTitle>
          </CardHeader>
          <CardContent>{ficha}</CardContent>
        </Card>

        {pagando ? (
          <RedsysPaymentForm
            /* El importe bueno lo devuelve el servidor al firmar; este solo
               es el hueco mientras llega */
            amount={0}
            registrationId={esEquipo ? undefined : ids[0]}
            registrationIds={esEquipo ? ids : undefined}
            description={`${info.race_name} - ${info.distance_name}`}
            isTest={false}
            onCancel={() => setPagando(false)}
          />
        ) : (
          <Button size="lg" className="w-full" onClick={() => setPagando(true)}>
            Completar el pago
          </Button>
        )}

        <p className="text-xs text-muted-foreground text-center">
          El importe que verás es el vigente ahora mismo. Si la carrera tiene tramos de precio y el
          tramo ha cambiado desde que empezaste, manda el de hoy.
        </p>
      </div>
    </Marco>
  );
};

export default RetomarPago;
