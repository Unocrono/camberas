/**
 * Grupetta — página del PARTICIPANTE: unirse con el código del grupo.
 * (La gestión del Capo vive aparte en /grupetta/capo para que cada público
 * tenga su camino sin interferencias.)
 */
import { useState, useEffect, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Crown, Bike, MapPin, Check, Download } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import planGrupetta from "@/assets/plan-grupetta.svg";
import type { Session } from "@supabase/supabase-js";

interface UnionResultado {
  token: string;
  bib: number;
  nombre_grupo: string;
  slug: string;
  guardada?: boolean;
  /** true si ese nombre ya estaba: recupera su dorsal en vez de crear otro */
  reingreso?: boolean;
}

interface MiSalida {
  token_id: string;
  nombre_grupo: string;
  fecha: string;
  slug: string;
  dorsal: string;
  posiciones: number;
}

const Grupetta = () => {
  const [params] = useSearchParams();
  const { toast } = useToast();
  const [cargando, setCargando] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  const [codigo, setCodigo] = useState(params.get("c")?.toUpperCase() ?? "");
  const [nombreMiembro, setNombreMiembro] = useState("");
  const [aceptaDescargo, setAceptaDescargo] = useState(false);
  const [guardarRuta, setGuardarRuta] = useState(true);
  const [union, setUnion] = useState<UnionResultado | null>(null);
  const [misSalidas, setMisSalidas] = useState<MiSalida[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const cargarMisSalidas = useCallback(async () => {
    const { data, error } = await supabase.rpc("mis_salidas");
    if (!error) setMisSalidas((data as unknown as MiSalida[]) ?? []);
  }, []);

  useEffect(() => {
    if (session) cargarMisSalidas();
    else setMisSalidas([]);
  }, [session, cargarMisSalidas]);

  // Descarga el track propio como GPX (las posiciones ya son del usuario)
  const descargarGpx = async (s: MiSalida) => {
    const { data, error } = await supabase
      .from("gps_positions")
      .select("lat,lng,altitude,timestamp")
      .eq("token_id", s.token_id)
      .order("timestamp", { ascending: true });
    if (error || !data?.length) {
      toast({ title: "Sin posiciones que descargar", variant: "destructive" });
      return;
    }
    const pts = data
      .map(
        (p) =>
          `<trkpt lat="${p.lat}" lon="${p.lng}">` +
          (p.altitude != null ? `<ele>${p.altitude}</ele>` : "") +
          `<time>${new Date(p.timestamp).toISOString()}</time></trkpt>`
      )
      .join("\n");
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Camberas Grupetta" xmlns="http://www.topografix.com/GPX/1/1">\n<trk><name>${s.nombre_grupo} — ${s.fecha}</name><trkseg>\n${pts}\n</trkseg></trk>\n</gpx>`;
    const blob = new Blob([gpx], { type: "application/gpx+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `grupetta-${s.fecha}-${s.dorsal}.gpx`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const copiar = (texto: string) => {
    navigator.clipboard.writeText(texto);
    toast({ title: "Copiado al portapapeles" });
  };

  const urlMapa = (slug: string) => `https://camberas.com/${slug}/gps`;

  const unirse = async () => {
    setCargando(true);
    try {
      const { data, error } = await supabase.rpc("unirse_grupetta", {
        p_code: codigo,
        p_nombre: nombreMiembro,
        p_acepta: aceptaDescargo,
        p_guardar: !!session && guardarRuta,
      });
      if (error) throw error;
      const res = data as unknown as UnionResultado;
      setUnion(res);
      if (res.reingreso) {
        toast({
          title: `Ya estabas en el grupo — dorsal ${res.bib}`,
          description: "Recuperas tu dorsal y tu ruta. El enlace anterior deja de valer.",
        });
      }
      setTimeout(() => {
        window.location.href = `https://camberas.com/activar.html?t=${res.token}`;
      }, 1500);
    } catch (e: any) {
      toast({ title: "No se pudo unir", description: e.message, variant: "destructive" });
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="pt-24 pb-16">
        <div className="container max-w-2xl mx-auto px-4">
          {/* Hero */}
          <div className="relative h-56 md:h-72 overflow-hidden rounded-2xl mb-8 group">
            <img
              src={planGrupetta}
              alt="Grupetta"
              className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="absolute bottom-0 left-0 p-6">
              <h1 className="font-archivo text-4xl md:text-5xl uppercase text-white leading-none">
                Grupetta
              </h1>
              <p className="text-white/85 mt-1">Sal en grupo, vuelve en grupo — todos en un mapa.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-8 justify-center">
            <Badge variant="outline">Hasta 20 · controla tu salida y a los tuyos</Badge>
            <Badge variant="outline">Sin publicidad</Badge>
            <Badge variant="outline" className="text-secondary border-secondary">
              Gratis, para siempre
            </Badge>
          </div>

          {/* Unirse */}
          {union ? (
            <Card className="border-2 border-primary shadow-elevated">
              <CardHeader>
                <CardTitle className="font-archivo uppercase text-xl">
                  ✅ ¡Dentro! Dorsal {union.bib}
                </CardTitle>
                <CardDescription>{union.nombre_grupo} — abriendo Camberas Track…</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  className="w-full"
                  onClick={() =>
                    (window.location.href = `https://camberas.com/activar.html?t=${union.token}`)
                  }
                >
                  Abrir la app y vincular mi dorsal
                </Button>
                <Button variant="outline" className="w-full" onClick={() => copiar(urlMapa(union.slug))}>
                  <MapPin className="h-4 w-4 mr-2" /> Copiar enlace del mapa del grupo
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="font-archivo uppercase text-xl flex items-center gap-2">
                  <Bike className="h-5 w-5 text-primary" /> Únete a tu grupetta
                </CardTitle>
                <CardDescription>Sin registro: el código del grupo y tu nombre.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>Código del grupo</Label>
                  <Input
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                    maxLength={6}
                    placeholder="ABC123"
                    className="uppercase tracking-[0.3em] font-bold"
                  />
                </div>
                <div>
                  <Label>Tu nombre (lo verá tu grupo en el mapa)</Label>
                  <Input
                    value={nombreMiembro}
                    onChange={(e) => setNombreMiembro(e.target.value)}
                    maxLength={40}
                    placeholder="Ej: Bernar"
                  />
                </div>
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={aceptaDescargo}
                    onChange={(e) => setAceptaDescargo(e.target.checked)}
                    className="mt-1 h-4 w-4 accent-primary"
                  />
                  <span className="text-muted-foreground">
                    He leído y acepto el{" "}
                    <a
                      href="/descargo-grupetta.html"
                      target="_blank"
                      rel="noreferrer"
                      className="underline text-foreground"
                    >
                      descargo de responsabilidad
                    </a>
                    : participo voluntariamente, bajo mi responsabilidad, y exonero al capo
                    y a Camberas.
                  </span>
                </label>
                {session ? (
                  <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={guardarRuta}
                      onChange={(e) => setGuardarRuta(e.target.checked)}
                      className="mt-1 h-4 w-4 accent-primary"
                    />
                    <span className="text-muted-foreground">
                      💾 Guardar esta ruta en <strong>Mis salidas</strong> (tu track se
                      conservará en tu cuenta y podrás descargarlo en GPX)
                    </span>
                  </label>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    💾 ¿Quieres conservar tus rutas?{" "}
                    <Link to="/auth?returnTo=/grupetta" className="underline text-foreground">
                      Inicia sesión
                    </Link>{" "}
                    antes de unirte y actívalo con una casilla. Sin sesión, tu ruta se borra a
                    los 30 días.
                  </p>
                )}
                <Button
                  className="w-full"
                  onClick={unirse}
                  disabled={cargando || !codigo || !nombreMiembro || !aceptaDescargo}
                >
                  {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : "UNIRME"}
                </Button>
                <ul className="space-y-1 pt-2">
                  {[
                    "Mapa en vivo: os veis todos, también los de casa",
                    "Funciona con la pantalla apagada, sin gastar batería",
                    "Sin registros ni contraseñas — solo tu nombre",
                  ].map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Mis salidas (usuarios con sesión y rutas guardadas) */}
          {session && misSalidas.length > 0 && (
            <Card className="mt-8">
              <CardHeader>
                <CardTitle className="font-archivo uppercase text-xl">💾 Mis salidas</CardTitle>
                <CardDescription>
                  Tus rutas guardadas — consúltalas o descárgalas en GPX cuando quieras.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {misSalidas.map((s) => (
                  <div
                    key={s.token_id}
                    className="flex items-center justify-between gap-2 border rounded-lg p-3 flex-wrap"
                  >
                    <div>
                      <p className="font-semibold text-sm">{s.nombre_grupo}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(s.fecha + "T00:00:00").toLocaleDateString("es-ES", {
                          day: "numeric", month: "long", year: "numeric",
                        })}{" "}
                        · dorsal {s.dorsal} · {s.posiciones} puntos
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" asChild>
                        <a href={urlMapa(s.slug)} target="_blank" rel="noreferrer">
                          <MapPin className="h-4 w-4 mr-1" /> Mapa
                        </a>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={s.posiciones === 0}
                        onClick={() => descargarGpx(s)}
                      >
                        <Download className="h-4 w-4 mr-1" /> GPX
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <p className="text-center text-sm text-muted-foreground mt-8">
            <Crown className="h-4 w-4 inline mr-1 text-secondary" />
            ¿Eres el capo?{" "}
            <Link to="/grupetta/capo" className="underline text-foreground">
              Entra en tu zona para crear y gestionar tu grupetta
            </Link>
          </p>

          <p className="text-center text-xs text-muted-foreground mt-6">
            Necesitas la app <span className="text-foreground font-semibold">Camberas Track</span> (gratuita).
            Al unirte se abrirá sola con tu dorsal de grupo.
          </p>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Grupetta;
