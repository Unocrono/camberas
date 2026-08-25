/**
 * Recibir un dorsal cedido.
 *
 * Aquí aterriza quien abre por WhatsApp el enlace que le manda el cedente.
 * La identidad es el token, no una sesión: obligarle a crearse una cuenta es
 * la forma más rápida de que vuelva al WhatsApp de siempre, que es justo lo
 * que esto viene a sustituir.
 *
 * Rellena el MISMO formulario que un inscrito normal (DynamicRegistrationForm
 * con el distanceId del recorrido), acepta el reglamento y la protección de
 * datos, y la RPC hace el traspaso. Ese consentimiento es exactamente lo que
 * hoy no existe cuando el dorsal cambia de manos por WhatsApp.
 *
 * Lo que NO se le pregunta son los suplementos ya pagados (autobús, comida,
 * seguro de día): se muestran como lo que hereda. Si alguno no le encaja, la
 * cesión se para y se le manda a la organización — la decisión está tomada
 * y el motivo es el seguro de día, que depende de la persona.
 */
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock,
  Loader2,
  MapPin,
  ShieldCheck,
  Ticket,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { DynamicRegistrationForm } from "@/components/DynamicRegistrationForm";

type Estado =
  | "ok"
  | "completada"
  | "anulada"
  | "caducado"
  | "cerrado"
  | "ya_ha_corrido"
  | "no_existe";

interface Info {
  estado: Estado;
  race_name: string;
  race_slug: string | null;
  race_date: string;
  race_location: string | null;
  race_id: string;
  distance_name: string;
  race_distance_id: string;
  dorsal: number | null;
  cedente_nombre: string | null;
  tasa: number;
  importe_referencia: number | null;
  caduca_at: string;
  servicios: { field_id: string; etiqueta: string; valor: string }[];
  ya_inscrito: boolean;
}

const fechaLarga = (iso: string) =>
  new Date(iso + "T12:00:00").toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

const euros = (n: number) =>
  n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true }) +
  " €";

/** Edad el día de la carrera. La que manda para el tutor es la real, no la de categoría. */
const edadEnCarrera = (nacimiento: string, fechaCarrera: string): number | null => {
  if (!nacimiento) return null;
  const n = new Date(nacimiento);
  const c = new Date(fechaCarrera);
  if (isNaN(n.getTime()) || isNaN(c.getTime())) return null;
  let edad = c.getFullYear() - n.getFullYear();
  const m = c.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && c.getDate() < n.getDate())) edad--;
  return edad;
};

/** Cada final que no es "puedes seguir", con su explicación */
const DESENLACES: Record<Exclude<Estado, "ok">, { titulo: string; texto: string; bien?: boolean }> = {
  completada: {
    titulo: "Esta cesión ya se completó",
    texto: "El dorsal ya tiene nuevo titular. Si has sido tú, revisa tu correo: ahí está el justificante.",
    bien: true,
  },
  anulada: {
    titulo: "La cesión se anuló",
    texto: "Quien te pasó el dorsal canceló la cesión. Si fue un error, tiene que generarte un enlace nuevo.",
  },
  caducado: {
    titulo: "El enlace ha caducado",
    texto:
      "Los enlaces de cesión duran poco a propósito, para que un dorsal no ande dando vueltas por ahí. Pídele otro a quien te lo pasó.",
  },
  cerrado: {
    titulo: "Ya no se puede ceder este dorsal",
    texto: "Ha pasado la fecha límite que puso la organización, o la carrera ya ha empezado.",
  },
  ya_ha_corrido: {
    titulo: "Este dorsal ya ha corrido",
    texto:
      "Hay lecturas de cronometraje asociadas a esta inscripción, así que no se puede cambiar de titular.",
  },
  no_existe: {
    titulo: "Este enlace no es válido",
    texto: "Comprueba que has copiado la dirección entera desde el mensaje.",
  },
};

/** Por qué se ha parado, en cristiano */
const MOTIVOS: Record<string, string> = {
  falta_consentimiento: "Tienes que aceptar el reglamento y el tratamiento de tus datos.",
  faltan_datos: "Faltan datos obligatorios: nombre, apellidos, email, fecha de nacimiento y sexo.",
  menor_de_14:
    "Con menos de 14 años esta gestión no se puede hacer por internet: tiene que resolverla la organización con la documentación delante.",
  falta_tutor: "Al ser menor de edad hacen falta los datos del padre, madre o tutor, y su aceptación.",
  sin_categoria:
    "Tu edad o tu sexo no encajan en ninguna categoría de este recorrido, así que no puedes heredar este dorsal.",
  ya_inscrito: "Ya tienes una inscripción en esta carrera con ese email o ese documento.",
  caducado: "El enlace ha caducado mientras rellenabas. Pídele otro a quien te lo pasó.",
  cerrado: "Se ha pasado el plazo mientras rellenabas.",
  ya_ha_corrido: "Este dorsal ya tiene lecturas de cronometraje.",
  no_existe: "Este enlace no es válido.",
  inscripcion_ya_no_es_cedible:
    "El titular ha cancelado esta inscripción mientras rellenabas. Habla con quien te pasó el enlace.",
  inscripcion_no_existe: "Esta inscripción ya no existe.",
};

const Marco = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen flex flex-col">
    <Navbar />
    <main className="flex-1 container mx-auto px-4 py-10 max-w-2xl">{children}</main>
    <Footer />
  </div>
);

const CederDorsal = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [info, setInfo] = useState<Info | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<Record<string, any>>({});
  const [campos, setCampos] = useState<{ id: string; field_name: string }[]>([]);
  const [tutor, setTutor] = useState({ nombre: "", dni: "", telefono: "", email: "", acepta: false });
  const [aceptaReglamento, setAceptaReglamento] = useState(false);
  const [aceptaPrivacidad, setAceptaPrivacidad] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState<{ dorsal: number | null; sinCuenta: boolean } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    const cargar = async () => {
      if (!token) {
        setError("Falta el token del enlace");
        setCargando(false);
        return;
      }
      const { data, error: rpcError } = await (supabase as any).rpc("cesion_info", { p_token: token });
      if (rpcError) setError(rpcError.message);
      else setInfo(data as unknown as Info);
      setCargando(false);
    };
    cargar();
  }, [token, user?.id]);

  // Mapa nombre → id de los campos del formulario. DynamicRegistrationForm
  // trabaja por field_name y la RPC espera field_id, así que hace falta el
  // puente. Misma consulta que usa el propio formulario, para no desalinearse.
  useEffect(() => {
    if (!info?.race_distance_id) return;
    supabase
      .from("registration_form_fields")
      .select("id, field_name")
      .eq("is_visible", true)
      .eq("race_distance_id", info.race_distance_id)
      .then(({ data }) => setCampos(data ?? []));
  }, [info?.race_distance_id]);

  const edad = useMemo(
    () => (info ? edadEnCarrera(formData.birth_date, info.race_date) : null),
    [formData.birth_date, info],
  );
  const esMenor = edad !== null && edad < 18;
  const menorDe14 = edad !== null && edad < 14;

  const onChange = (campo: string, valor: any) =>
    setFormData((prev) => ({ ...prev, [campo]: valor }));

  const enviar = async () => {
    if (!info || !token) return;
    setAviso(null);
    setEnviando(true);
    try {
      const datos = {
        first_name: formData.first_name ?? "",
        last_name: formData.last_name ?? "",
        email: (formData.email ?? "").toLowerCase(),
        phone: formData.phone ?? "",
        // El campo del formulario se llama document_number; la columna, dni_passport
        dni_passport: formData.document_number ?? formData.dni_passport ?? "",
        birth_date: formData.birth_date ?? "",
        gender: formData.gender ?? "",
        address: formData.address ?? "",
        city: formData.city ?? "",
        province: formData.province ?? "",
        autonomous_community: formData.autonomous_community ?? "",
        country: formData.country ?? "",
        club: formData.club ?? "",
        team: formData.team ?? "",
        tshirt_size: formData.tshirt_size ?? "",
      };

      const respuestas = campos
        .filter((c) => formData[c.field_name] !== undefined && formData[c.field_name] !== null)
        .map((c) => ({ field_id: c.id, field_value: String(formData[c.field_name]) }));

      const { data, error: rpcError } = await (supabase as any).rpc("cesion_aceptar", {
        p_token: token,
        p_datos: datos,
        p_respuestas: respuestas,
        p_acepta_reglamento: aceptaReglamento,
        p_acepta_privacidad: aceptaPrivacidad,
        p_tutor: esMenor ? tutor : null,
      });
      if (rpcError) throw rpcError;

      const r = data as unknown as {
        ok: boolean;
        motivo?: string;
        campos?: string;
        siguiente?: string;
        dorsal?: number;
        sin_cuenta?: boolean;
      };

      if (!r.ok) {
        if (r.motivo === "suplemento_distinto") {
          setAviso(
            `Has elegido algo distinto de lo que ya está pagado (${r.campos}). Eso no se puede ` +
              `resolver desde aquí: escribe a la organización de la carrera y lo arreglan contigo.`,
          );
        } else {
          setAviso(MOTIVOS[r.motivo ?? ""] ?? "No se ha podido completar la cesión.");
        }
        return;
      }

      setHecho({ dorsal: r.dorsal ?? info.dorsal, sinCuenta: r.sin_cuenta === true });
    } catch (e: any) {
      toast({
        title: "No se ha podido completar",
        description: e.message ?? "Inténtalo de nuevo en un momento.",
        variant: "destructive",
      });
    } finally {
      setEnviando(false);
    }
  };

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
      {info.dorsal != null && (
        <p className="flex items-center gap-2 font-semibold">
          <Ticket className="h-4 w-4" />
          Dorsal {info.dorsal}
        </p>
      )}
    </div>
  );

  // ── Ya está hecho ──────────────────────────────────────────────────────
  if (hecho) {
    return (
      <Marco>
        <Card>
          <CardContent className="py-10 space-y-5 text-center">
            <CheckCircle2 className="h-14 w-14 text-primary mx-auto" />
            <div className="space-y-2">
              <h1 className="text-2xl font-bold">
                {hecho.dorsal != null ? `Ya eres el dorsal ${hecho.dorsal}` : "El dorsal ya es tuyo"}
              </h1>
              <p className="text-muted-foreground">
                La inscripción está a tu nombre. Te llega un justificante por email.
              </p>
            </div>
            <div className="text-left">{ficha}</div>
            {hecho.sinCuenta && (
              <p className="text-sm text-muted-foreground">
                Gestionarás esta inscripción por email. Si te creas una cuenta con esa misma
                dirección, la verás también en tu panel.
              </p>
            )}
            {info.race_slug && (
              <Button asChild>
                <Link to={`/${info.race_slug}`}>Ver la carrera</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </Marco>
    );
  }

  // ── Todo lo que no es "puedes seguir" ──────────────────────────────────
  if (info.estado !== "ok") {
    const d = DESENLACES[info.estado];
    return (
      <Marco>
        <Card>
          <CardContent className="py-10 space-y-5 text-center">
            {d.bien ? (
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

  return (
    <Marco>
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">
            {info.cedente_nombre
              ? `${info.cedente_nombre} te cede su dorsal`
              : "Te ceden un dorsal"}
          </h1>
          <p className="text-muted-foreground">
            Rellena tus datos y la plaza pasa a tu nombre. El dorsal no cambia.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Lo que recibes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {ficha}

            {info.servicios.length > 0 && (
              <div className="rounded-lg border border-border p-4 space-y-2">
                <p className="text-sm font-semibold">Ya está pagado e incluido</p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  {info.servicios.map((s) => (
                    <li key={s.field_id}>
                      {s.etiqueta}: <span className="text-foreground">{s.valor}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  Esto lo heredas tal cual. Si algo de esto no te vale —por ejemplo el seguro de
                  día si tú ya tienes licencia—, no sigas por aquí: escribe a la organización.
                </p>
              </div>
            )}

            {info.importe_referencia != null && (
              <p className="text-xs text-muted-foreground">
                La inscripción costó {euros(Number(info.importe_referencia))}. Camberas no mueve ese
                dinero: si tenéis que ajustar cuentas, hacedlo entre vosotros.
              </p>
            )}

            {info.ya_inscrito && (
              <p className="text-sm rounded-lg bg-amber-50 text-amber-900 p-3">
                Ya tienes otra inscripción en esta carrera con tu cuenta. Puedes seguir, pero esta
                plaza la gestionarás por email en vez de desde tu panel.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Tus datos</CardTitle>
          </CardHeader>
          <CardContent>
            <DynamicRegistrationForm
              raceId={info.race_id}
              distanceId={info.race_distance_id}
              formData={formData}
              onChange={onChange}
              prefillFromProfile={!!user}
            />
          </CardContent>
        </Card>

        {/* Menores: sin esto el acta no se sostiene, porque quien acepta no puede aceptar */}
        {esMenor && (
          <Card className={menorDe14 ? "border-destructive" : undefined}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" />
                {menorDe14 ? "Menor de 14 años" : `Menor de edad (${edad} años)`}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {menorDe14 ? (
                <p className="text-sm text-muted-foreground">
                  Con menos de 14 años esta gestión no puede hacerse por internet. Escribe a la
                  organización de la carrera y la resuelven con la documentación delante.
                </p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Al ser menor de edad, quien acepta el reglamento es tu padre, madre o tutor.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="tutor-nombre">Nombre y apellidos</Label>
                      <Input id="tutor-nombre" value={tutor.nombre}
                        onChange={(e) => setTutor({ ...tutor, nombre: e.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="tutor-dni">DNI</Label>
                      <Input id="tutor-dni" value={tutor.dni}
                        onChange={(e) => setTutor({ ...tutor, dni: e.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="tutor-tel">Teléfono</Label>
                      <Input id="tutor-tel" value={tutor.telefono}
                        onChange={(e) => setTutor({ ...tutor, telefono: e.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor="tutor-email">Email</Label>
                      <Input id="tutor-email" type="email" value={tutor.email}
                        onChange={(e) => setTutor({ ...tutor, email: e.target.value })} />
                    </div>
                  </div>
                  <label className="flex items-start gap-3 text-sm">
                    <Checkbox checked={tutor.acepta}
                      onCheckedChange={(v) => setTutor({ ...tutor, acepta: v === true })} />
                    <span>
                      Como padre, madre o tutor, autorizo la participación y acepto el reglamento
                      en su nombre.
                    </span>
                  </label>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {!menorDe14 && (
          <Card>
            <CardContent className="py-5 space-y-3">
              <label className="flex items-start gap-3 text-sm">
                <Checkbox checked={aceptaReglamento}
                  onCheckedChange={(v) => setAceptaReglamento(v === true)} />
                <span>
                  He leído y acepto el{" "}
                  <Link to={`/race/${info.race_id}/regulation`} target="_blank"
                    className="underline text-primary">
                    reglamento de la carrera
                  </Link>
                  .
                </span>
              </label>
              <label className="flex items-start gap-3 text-sm">
                <Checkbox checked={aceptaPrivacidad}
                  onCheckedChange={(v) => setAceptaPrivacidad(v === true)} />
                <span>
                  Acepto el tratamiento de mis datos para gestionar esta inscripción, según la{" "}
                  <Link to="/privacy-policy" target="_blank" className="underline text-primary">
                    política de privacidad
                  </Link>
                  .
                </span>
              </label>
            </CardContent>
          </Card>
        )}

        {aviso && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
            {aviso}
          </div>
        )}

        {!menorDe14 && (
          <Button
            size="lg"
            className="w-full"
            disabled={enviando || !aceptaReglamento || !aceptaPrivacidad}
            onClick={enviar}
          >
            {enviando ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Traspasando…
              </>
            ) : (
              "Aceptar el dorsal"
            )}
          </Button>
        )}

        <p className="text-xs text-muted-foreground text-center">
          Al aceptar, la inscripción pasa a tu nombre y quien te la cede deja de figurar en la
          salida. Queda registrado quién cede, quién recibe y cuándo.
        </p>
      </div>
    </Marco>
  );
};

export default CederDorsal;
