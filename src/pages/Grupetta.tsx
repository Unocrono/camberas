/**
 * Grupetta — grupos autoservicio (máx. 20) sobre la infraestructura de carreras.
 * - Unirse: sin registro (código + nombre → token → abre la app).
 * - Capo: cuenta instantánea; crea su grupetta con FICHA (fecha, hora y punto
 *   de encuentro, GPX, imagen) y la publica cuando está lista. "Mis grupettas"
 *   es su mini-panel.
 */
import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Crown, Bike, Copy, MapPin, Check, Upload, Image as ImageIcon } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import planGrupetta from "@/assets/plan-grupetta.svg";
import type { Session } from "@supabase/supabase-js";

interface MiGrupetta {
  race_id: string;
  distance_id: string;
  nombre: string;
  join_code: string;
  slug: string;
  fecha: string;
  hora_punto: string | null;
  publicada: boolean;
  imagen: string | null;
  gpx: string | null;
  miembros: number;
}

interface UnionResultado {
  token: string;
  bib: number;
  nombre_grupo: string;
  slug: string;
}

const Grupetta = () => {
  const [params] = useSearchParams();
  const { toast } = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [cargando, setCargando] = useState(false);

  // Unirse
  const [codigo, setCodigo] = useState(params.get("c")?.toUpperCase() ?? "");
  const [nombreMiembro, setNombreMiembro] = useState("");
  const [aceptaDescargo, setAceptaDescargo] = useState(false);
  const [union, setUnion] = useState<UnionResultado | null>(null);

  // Capo: crear
  const [nombreGrupo, setNombreGrupo] = useState("");
  const [fechaSalida, setFechaSalida] = useState(new Date().toISOString().slice(0, 10));
  const [horaPunto, setHoraPunto] = useState("");
  const [misGrupettas, setMisGrupettas] = useState<MiGrupetta[]>([]);
  const [subiendo, setSubiendo] = useState<string | null>(null); // race_id en subida

  // Capo: auth
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombreCapo, setNombreCapo] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const cargarMisGrupettas = useCallback(async () => {
    const { data, error } = await supabase.rpc("mis_grupettas");
    if (!error) setMisGrupettas((data as unknown as MiGrupetta[]) ?? []);
  }, []);

  useEffect(() => {
    if (session) cargarMisGrupettas();
    else setMisGrupettas([]);
  }, [session, cargarMisGrupettas]);

  const copiar = (texto: string) => {
    navigator.clipboard.writeText(texto);
    toast({ title: "Copiado al portapapeles" });
  };

  const urlUnion = (code: string) => `https://camberas.com/grupetta?c=${code}`;
  const urlMapa = (slug: string) => `https://camberas.com/${slug}/gps`;

  // ── Unirse ──
  const unirse = async () => {
    setCargando(true);
    try {
      const { data, error } = await supabase.rpc("unirse_grupetta", {
        p_code: codigo,
        p_nombre: nombreMiembro,
        p_acepta: aceptaDescargo,
      });
      if (error) throw error;
      const res = data as unknown as UnionResultado;
      setUnion(res);
      setTimeout(() => {
        window.location.href = `https://camberas.com/activar.html?t=${res.token}`;
      }, 1500);
    } catch (e: any) {
      toast({ title: "No se pudo unir", description: e.message, variant: "destructive" });
    } finally {
      setCargando(false);
    }
  };

  // ── Capo: crear ──
  const crear = async () => {
    setCargando(true);
    try {
      const { error } = await supabase.rpc("crear_grupetta", {
        p_nombre: nombreGrupo,
        p_fecha: fechaSalida,
        p_hora_punto: horaPunto || null,
      });
      if (error) throw error;
      toast({
        title: "🎉 Grupetta creada (en borrador)",
        description: "Completa la ficha si quieres y pulsa PUBLICAR para abrir las uniones.",
      });
      setNombreGrupo("");
      setHoraPunto("");
      await cargarMisGrupettas();
    } catch (e: any) {
      toast({ title: "No se pudo crear", description: e.message, variant: "destructive" });
    } finally {
      setCargando(false);
    }
  };

  // ── Capo: ficha ──
  const actualizar = async (raceId: string, campos: Record<string, unknown>) => {
    try {
      const { error } = await supabase.rpc("actualizar_grupetta", {
        p_race_id: raceId,
        ...campos,
      });
      if (error) throw error;
      await cargarMisGrupettas();
      return true;
    } catch (e: any) {
      toast({ title: "No se pudo actualizar", description: e.message, variant: "destructive" });
      return false;
    }
  };

  const subirArchivo = async (
    g: MiGrupetta,
    file: File,
    bucket: "race-gpx" | "race-images",
    campo: "p_gpx_url" | "p_imagen_url"
  ) => {
    setSubiendo(g.race_id);
    try {
      const ext = file.name.split(".").pop() || (bucket === "race-gpx" ? "gpx" : "jpg");
      const ruta = `grupetta/${g.race_id}.${ext}`;
      const { error: upErr } = await supabase.storage.from(bucket).upload(ruta, file, {
        upsert: true,
        contentType: bucket === "race-gpx" ? "application/gpx+xml" : file.type,
      });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from(bucket).getPublicUrl(ruta);
      const ok = await actualizar(g.race_id, { [campo]: data.publicUrl });
      if (ok) toast({ title: bucket === "race-gpx" ? "Ruta GPX subida 🗺️" : "Imagen subida 🖼️" });
    } catch (e: any) {
      toast({ title: "No se pudo subir", description: e.message, variant: "destructive" });
    } finally {
      setSubiendo(null);
    }
  };

  // ── Capo: auth ──
  const altaCapo = async () => {
    setCargando(true);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { first_name: nombreCapo, last_name: "", is_organizer: false, is_capo: true },
          emailRedirectTo: `${window.location.origin}/grupetta`,
        },
      });
      if (error) throw error;
      try {
        await supabase.functions.invoke("send-welcome-email", {
          body: { email, firstName: nombreCapo },
        });
      } catch (emailErr) {
        console.error("Failed to send welcome email:", emailErr);
      }
      toast({
        title: "¡Cuenta de Capo creada! 👑",
        description:
          "Te hemos enviado un email de bienvenida. Confirma tu correo si te lo pide y ya puedes crear tu grupetta.",
      });
    } catch (e: any) {
      toast({ title: "No se pudo crear la cuenta", description: e.message, variant: "destructive" });
    } finally {
      setCargando(false);
    }
  };

  const login = async () => {
    setCargando(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (e: any) {
      toast({ title: "No se pudo iniciar sesión", description: e.message, variant: "destructive" });
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="pt-24 pb-16">
        <div className="container max-w-3xl mx-auto px-4">
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

          <div className="space-y-8">
            {/* ── Unirse ── */}
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
                    <Bike className="h-5 w-5 text-primary" /> Únete
                  </CardTitle>
                  <CardDescription>Sin registro: el código del grupo y tu nombre.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid md:grid-cols-2 gap-3">
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
                      <Label>Tu nombre</Label>
                      <Input
                        value={nombreMiembro}
                        onChange={(e) => setNombreMiembro(e.target.value)}
                        maxLength={40}
                        placeholder="Ej: Bernar"
                      />
                    </div>
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
                      : participo voluntariamente, bajo mi responsabilidad, y exonero al
                      capo y a Camberas.
                    </span>
                  </label>
                  <Button
                    className="w-full"
                    onClick={unirse}
                    disabled={cargando || !codigo || !nombreMiembro || !aceptaDescargo}
                  >
                    {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : "UNIRME"}
                  </Button>
                  <ul className="flex flex-wrap gap-x-6 gap-y-1 pt-1">
                    {["Mapa en vivo: os veis todos", "Funciona con la pantalla apagada", "Sin registros"].map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* ── Zona del Capo ── */}
            <Card className="border-2 border-secondary/60">
              <CardHeader>
                <CardTitle className="font-archivo uppercase text-xl flex items-center gap-2">
                  <Crown className="h-5 w-5 text-secondary" /> Zona del Capo
                </CardTitle>
                <CardDescription>
                  Crea tu grupetta con su ficha (fecha, punto de encuentro, ruta, imagen) y
                  publícala cuando esté lista. Máximo 3 activas.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!session ? (
                  <Tabs defaultValue="login">
                    <TabsList className="grid grid-cols-2 w-full">
                      <TabsTrigger value="login">Ya soy Capo</TabsTrigger>
                      <TabsTrigger value="alta">Hazme Capo</TabsTrigger>
                    </TabsList>
                    <TabsContent value="login" className="space-y-3 pt-3">
                      <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
                      <Input type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} />
                      <Button className="w-full" onClick={login} disabled={cargando || !email || !password}>
                        {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : "INICIAR SESIÓN"}
                      </Button>
                    </TabsContent>
                    <TabsContent value="alta" className="space-y-3 pt-3">
                      <Input placeholder="Tu nombre" value={nombreCapo} onChange={(e) => setNombreCapo(e.target.value)} />
                      <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
                      <Input type="password" placeholder="Contraseña (mín. 8 caracteres)" value={password} onChange={(e) => setPassword(e.target.value)} />
                      <Button
                        variant="secondary"
                        className="w-full"
                        onClick={altaCapo}
                        disabled={cargando || !email || !password || !nombreCapo}
                      >
                        {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : "👑 CREAR MI CUENTA DE CAPO"}
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        Alta instantánea, sin revisión. Solo para crear y gestionar tus grupettas.
                      </p>
                    </TabsContent>
                  </Tabs>
                ) : (
                  <div className="space-y-6">
                    {/* Crear nueva */}
                    <div className="space-y-3 border rounded-xl p-4">
                      <p className="font-semibold text-sm">✨ Nueva grupetta</p>
                      <div className="grid md:grid-cols-2 gap-3">
                        <div>
                          <Label>Nombre</Label>
                          <Input
                            value={nombreGrupo}
                            onChange={(e) => setNombreGrupo(e.target.value)}
                            maxLength={60}
                            placeholder="Ej: Dominguera de Loiu"
                          />
                        </div>
                        <div>
                          <Label>Fecha de salida</Label>
                          <Input
                            type="date"
                            value={fechaSalida}
                            min={new Date().toISOString().slice(0, 10)}
                            onChange={(e) => setFechaSalida(e.target.value)}
                          />
                        </div>
                      </div>
                      <div>
                        <Label>Hora y punto de encuentro (opcional)</Label>
                        <Input
                          value={horaPunto}
                          onChange={(e) => setHoraPunto(e.target.value)}
                          maxLength={120}
                          placeholder="Ej: 09:00 · Bar La Plaza, Loiu"
                        />
                      </div>
                      <Button
                        variant="secondary"
                        className="w-full"
                        onClick={crear}
                        disabled={cargando || nombreGrupo.trim().length < 3}
                      >
                        {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : "CREAR GRUPETTA (en borrador)"}
                      </Button>
                    </div>

                    {/* Mis grupettas */}
                    {misGrupettas.length > 0 && (
                      <div className="space-y-4">
                        <p className="font-semibold text-sm">👑 Mis grupettas</p>
                        {misGrupettas.map((g) => (
                          <div key={g.race_id} className="border rounded-xl p-4 space-y-3">
                            <div className="flex items-start justify-between gap-2 flex-wrap">
                              <div>
                                <p className="font-archivo uppercase">{g.nombre}</p>
                                <p className="text-sm text-muted-foreground">
                                  {new Date(g.fecha + "T00:00:00").toLocaleDateString("es-ES", {
                                    weekday: "long", day: "numeric", month: "long",
                                  })}
                                  {g.hora_punto && g.hora_punto !== "Grupetta" ? ` · ${g.hora_punto}` : ""}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant={g.publicada ? "default" : "outline"}>
                                  {g.publicada ? "Publicada" : "Borrador"}
                                </Badge>
                                <Badge variant="outline">{g.miembros}/20</Badge>
                              </div>
                            </div>

                            <p className="font-archivo text-4xl tracking-[0.3em] text-center text-secondary">
                              {g.join_code}
                            </p>

                            <div className="grid grid-cols-2 gap-2">
                              <Button size="sm" onClick={() => copiar(urlUnion(g.join_code))}>
                                <Copy className="h-4 w-4 mr-1" /> Enlace de unión
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => copiar(urlMapa(g.slug))}>
                                <MapPin className="h-4 w-4 mr-1" /> Enlace del mapa
                              </Button>

                              <Button size="sm" variant="outline" asChild disabled={subiendo === g.race_id}>
                                <label className="cursor-pointer">
                                  <Upload className="h-4 w-4 mr-1" />
                                  {g.gpx ? "Cambiar GPX" : "Subir ruta GPX"}
                                  <input
                                    type="file"
                                    accept=".gpx"
                                    className="hidden"
                                    onChange={(e) => {
                                      const f = e.target.files?.[0];
                                      if (f) subirArchivo(g, f, "race-gpx", "p_gpx_url");
                                      e.target.value = "";
                                    }}
                                  />
                                </label>
                              </Button>
                              <Button size="sm" variant="outline" asChild disabled={subiendo === g.race_id}>
                                <label className="cursor-pointer">
                                  <ImageIcon className="h-4 w-4 mr-1" />
                                  {g.imagen ? "Cambiar imagen" : "Subir imagen"}
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                      const f = e.target.files?.[0];
                                      if (f) subirArchivo(g, f, "race-images", "p_imagen_url");
                                      e.target.value = "";
                                    }}
                                  />
                                </label>
                              </Button>
                            </div>

                            <Button
                              className="w-full"
                              variant={g.publicada ? "outline" : "default"}
                              onClick={() => actualizar(g.race_id, { p_publicada: !g.publicada })}
                            >
                              {g.publicada ? "Pasar a borrador (cierra las uniones)" : "🚀 PUBLICAR (abre las uniones)"}
                            </Button>
                            {g.gpx && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <Check className="h-3 w-3 text-primary" /> Ruta cargada — los miembros la
                                verán en su app y en el mapa del grupo
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <button
                      className="text-xs text-muted-foreground underline"
                      onClick={() => supabase.auth.signOut()}
                    >
                      Cerrar sesión
                    </button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <p className="text-center text-sm text-muted-foreground mt-10">
            Los miembros necesitan la app <span className="text-foreground font-semibold">Camberas Track</span> (gratuita).
            El mapa del grupo se abre en cualquier navegador — también para los que se quedan en casa.
          </p>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Grupetta;
