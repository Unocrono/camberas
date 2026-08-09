/**
 * Zona del Capo — gestión de grupettas (separada de la página de unirse
 * para que cada público tenga su camino sin interferencias).
 * Alta/login de Capo, crear con ficha (fecha, hora y punto, GPX, imagen)
 * y "Mis grupettas" con publicación.
 */
import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Crown, Copy, MapPin, Check, Upload, Image as ImageIcon, Bike, Trash2, ChevronDown, ChevronUp, QrCode } from "lucide-react";
import { qrConLogo } from "@/lib/qrConLogo";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { parseGpxFile } from "@/lib/gpxParser";
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
  hora: string | null;
  lugar: string | null;
  publicada: boolean;
  imagen: string | null;
  gpx: string | null;
  distancia: number | null;
  desnivel: number | null;
  miembros: number;
  inscritos: { dorsal: string; nombre: string }[];
}

/** Km y desnivel positivo de un GPX (para no pedírselos al capo) */
const statsFromGpx = (gpxText: string): { km: number; desnivel: number } | null => {
  try {
    const gpx = parseGpxFile(gpxText);
    const toRad = (d: number) => (d * Math.PI) / 180;
    let km = 0;
    let up = 0;
    for (const track of gpx.tracks) {
      const pts = track.points;
      for (let i = 1; i < pts.length; i++) {
        const dLat = toRad(pts[i].lat - pts[i - 1].lat);
        const dLon = toRad(pts[i].lon - pts[i - 1].lon);
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos(toRad(pts[i - 1].lat)) * Math.cos(toRad(pts[i].lat)) * Math.sin(dLon / 2) ** 2;
        km += 2 * 6371 * Math.asin(Math.sqrt(a));
        const e0 = pts[i - 1].ele;
        const e1 = pts[i].ele;
        if (e0 != null && e1 != null && e1 - e0 > 1) up += e1 - e0;
      }
    }
    if (km <= 0) return null;
    return { km: Math.round(km * 10) / 10, desnivel: Math.round(up) };
  } catch {
    return null;
  }
};

const GrupettaCapo = () => {
  const { toast } = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [cargando, setCargando] = useState(false);

  // Crear
  const [nombreGrupo, setNombreGrupo] = useState("");
  const [fechaSalida, setFechaSalida] = useState(new Date().toISOString().slice(0, 10));
  const [horaSalida, setHoraSalida] = useState("");
  const [lugarSalida, setLugarSalida] = useState("");
  const [gpxNuevo, setGpxNuevo] = useState<File | null>(null);
  const [misGrupettas, setMisGrupettas] = useState<MiGrupetta[]>([]);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);

  // Auth
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

  // QR de unión: en la salida, el capo lo enseña y el nuevo lo escanea
  const [qrGrupetta, setQrGrupetta] = useState<MiGrupetta | null>(null);
  const [qrImagen, setQrImagen] = useState("");

  const mostrarQr = async (g: MiGrupetta) => {
    setQrGrupetta(g);
    setQrImagen(await qrConLogo(urlUnion(g.join_code)));
  };

  const copiar = (texto: string) => {
    navigator.clipboard.writeText(texto);
    toast({ title: "Copiado al portapapeles" });
  };

  const urlUnion = (code: string) => `https://camberas.com/grupetta?c=${code}`;
  const urlMapa = (slug: string) => `https://camberas.com/${slug}/gps`;

  const crear = async () => {
    setCargando(true);
    try {
      const { data, error } = await supabase.rpc("crear_grupetta", {
        p_nombre: nombreGrupo,
        p_fecha: fechaSalida,
        p_hora: horaSalida || null,
        p_lugar: lugarSalida || null,
      });
      if (error) throw error;

      // El recorrido va en el mismo gesto: se sube y se guardan km y
      // desnivel calculados del propio GPX. Si falla, la grupetta ya
      // está creada — se avisa y el capo puede reintentar desde su ficha.
      const creada = data as unknown as { race_id: string } | null;
      if (gpxNuevo && creada?.race_id) {
        try {
          const ruta = `grupetta/${creada.race_id}.gpx`;
          const { error: upErr } = await supabase.storage
            .from("race-gpx")
            .upload(ruta, gpxNuevo, { upsert: true, contentType: "application/gpx+xml" });
          if (upErr) throw upErr;
          const { data: pub } = supabase.storage.from("race-gpx").getPublicUrl(ruta);
          const stats = statsFromGpx(await gpxNuevo.text());
          await supabase.rpc("actualizar_grupetta", {
            p_race_id: creada.race_id,
            p_gpx_url: pub.publicUrl,
            ...(stats ? { p_distancia_km: stats.km, p_desnivel: stats.desnivel } : {}),
          });
        } catch (e: any) {
          toast({
            title: "Grupetta creada, pero el GPX no subió",
            description: `${e.message}. Puedes cargarlo desde su ficha.`,
            variant: "destructive",
          });
        }
      }

      toast({
        title: "🎉 Grupetta creada (en borrador)",
        description: gpxNuevo
          ? "Con su recorrido cargado. Pulsa PUBLICAR para abrir las uniones."
          : "Completa la ficha si quieres y pulsa PUBLICAR para abrir las uniones.",
      });
      setNombreGrupo("");
      setHoraSalida("");
      setLugarSalida("");
      setGpxNuevo(null);
      await cargarMisGrupettas();
    } catch (e: any) {
      toast({ title: "No se pudo crear", description: e.message, variant: "destructive" });
    } finally {
      setCargando(false);
    }
  };

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

  const borrar = async (g: MiGrupetta) => {
    const aviso =
      g.miembros > 0
        ? `¿Borrar "${g.nombre}"?\n\nSe eliminarán el grupo, su código y las rutas de sus ${g.miembros} miembros (también las guardadas en Mis salidas).\n\nEsta acción no se puede deshacer.`
        : `¿Borrar "${g.nombre}"?\n\nEsta acción no se puede deshacer.`;
    if (!window.confirm(aviso)) return;
    try {
      const { error } = await supabase.rpc("borrar_grupetta", { p_race_id: g.race_id });
      if (error) throw error;
      toast({ title: "Grupetta borrada 🗑️" });
      await cargarMisGrupettas();
    } catch (e: any) {
      toast({ title: "No se pudo borrar", description: e.message, variant: "destructive" });
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

      // Del GPX salen gratis los km y el desnivel — a los campos nativos
      const stats = bucket === "race-gpx" ? statsFromGpx(await file.text()) : null;
      const ok = await actualizar(g.race_id, {
        [campo]: data.publicUrl,
        ...(stats ? { p_distancia_km: stats.km, p_desnivel: stats.desnivel } : {}),
      });
      if (ok)
        toast({
          title:
            bucket === "race-gpx"
              ? stats
                ? `Ruta GPX subida 🗺️ — ${stats.km} km, +${stats.desnivel} m`
                : "Ruta GPX subida 🗺️"
              : "Imagen subida 🖼️",
        });
    } catch (e: any) {
      toast({ title: "No se pudo subir", description: e.message, variant: "destructive" });
    } finally {
      setSubiendo(null);
    }
  };

  const altaCapo = async () => {
    setCargando(true);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { first_name: nombreCapo, last_name: "", is_organizer: false, is_capo: true },
          emailRedirectTo: `${window.location.origin}/grupetta/capo`,
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
          <div className="relative h-48 md:h-60 overflow-hidden rounded-2xl mb-8 group">
            <img
              src={planGrupetta}
              alt="Grupetta"
              className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="absolute bottom-0 left-0 p-6">
              <h1 className="font-archivo text-3xl md:text-4xl uppercase text-white leading-none flex items-center gap-3">
                <Crown className="h-8 w-8 text-secondary" /> Zona del Capo
              </h1>
              <p className="text-white/85 mt-1">Crea tu grupetta, reparte el código, no pierdas a nadie.</p>
            </div>
          </div>

          <Card className="border-2 border-secondary/60">
            <CardHeader>
              <CardDescription>
                Cuenta gratuita e instantánea. Crea tu grupetta con su ficha (fecha, punto de
                encuentro, ruta, imagen) y publícala cuando esté lista. Máximo 3 activas.
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
                          placeholder="Ej: Salida del domingo"
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
                    <div className="grid md:grid-cols-2 gap-3">
                      <div>
                        <Label>Hora de salida (opcional)</Label>
                        <Input
                          type="time"
                          value={horaSalida}
                          onChange={(e) => setHoraSalida(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>Lugar de salida (opcional)</Label>
                        <Input
                          value={lugarSalida}
                          onChange={(e) => setLugarSalida(e.target.value)}
                          maxLength={120}
                          placeholder="Ej: La Plaza"
                        />
                      </div>
                    </div>
                    {/* El recorrido es dato básico, no un extra: se sube aquí
                        y la grupetta queda lista de una sola vez */}
                    <div>
                      <Label>Recorrido GPX (opcional)</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="file"
                          accept=".gpx,application/gpx+xml"
                          onChange={(e) => setGpxNuevo(e.target.files?.[0] ?? null)}
                          className="cursor-pointer"
                        />
                        {gpxNuevo && (
                          <Button variant="ghost" size="sm" onClick={() => setGpxNuevo(null)}>
                            Quitar
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {gpxNuevo
                          ? `${gpxNuevo.name} — los km y el desnivel se calculan solos`
                          : "Los miembros lo verán en su app y en el mapa del grupo"}
                      </p>
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
                                {g.hora ? ` · ${g.hora} h` : ""}
                                {g.lugar && g.lugar !== "Por concretar" ? ` · ${g.lugar}` : ""}
                                {g.distancia && Number(g.distancia) > 0
                                  ? ` · ${Number(g.distancia)} km${g.desnivel ? ` (+${g.desnivel} m)` : ""}`
                                  : ""}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={g.publicada ? "default" : "outline"}>
                                {g.publicada ? "Publicada" : "Borrador"}
                              </Badge>
                              <Badge variant="outline">{g.miembros}/20</Badge>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setAbierta(abierta === g.race_id ? null : g.race_id)}
                              >
                                {abierta === g.race_id ? (
                                  <>Cerrar <ChevronUp className="h-4 w-4 ml-1" /></>
                                ) : (
                                  <>Gestionar <ChevronDown className="h-4 w-4 ml-1" /></>
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
                                onClick={() => borrar(g)}
                                title="Borrar grupetta"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          {abierta === g.race_id && (<>
                          <p className="font-archivo text-4xl tracking-[0.3em] text-center text-secondary">
                            {g.join_code}
                          </p>

                          {/* Editar salida: escribe en los campos nativos del evento */}
                          <form
                            className="border rounded-lg p-3 space-y-2"
                            onSubmit={(e) => {
                              e.preventDefault();
                              const fd = new FormData(e.currentTarget);
                              actualizar(g.race_id, {
                                p_fecha: (fd.get("fecha") as string) || null,
                                p_hora: (fd.get("hora") as string) || null,
                                p_lugar: (fd.get("lugar") as string) || null,
                              }).then((ok) => ok && toast({ title: "Salida actualizada 🕘" }));
                            }}
                          >
                            <p className="font-semibold text-xs uppercase tracking-wide">Editar la salida</p>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label className="text-xs">Fecha</Label>
                                <Input
                                  name="fecha"
                                  type="date"
                                  defaultValue={g.fecha}
                                  min={new Date().toISOString().slice(0, 10)}
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Hora</Label>
                                <Input name="hora" type="time" defaultValue={g.hora ?? ""} />
                              </div>
                            </div>
                            <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
                              <div>
                                <Label className="text-xs">Lugar de salida</Label>
                                <Input
                                  name="lugar"
                                  maxLength={120}
                                  defaultValue={g.lugar === "Por concretar" ? "" : g.lugar ?? ""}
                                  placeholder="Punto de encuentro"
                                />
                              </div>
                              <Button size="sm" type="submit" variant="outline">
                                Guardar
                              </Button>
                            </div>
                          </form>

                          {/* Inscritos: el capo ve quién se ha unido */}
                          {g.inscritos?.length > 0 && (
                            <div className="text-sm border rounded-lg p-3 bg-muted/40">
                              <p className="font-semibold text-xs uppercase tracking-wide mb-1">
                                Inscritos ({g.miembros}/20)
                              </p>
                              <ul className="grid grid-cols-2 gap-x-4">
                                {g.inscritos.map((m) => (
                                  <li key={m.dorsal} className="flex gap-2">
                                    <span className="text-secondary font-mono w-6 text-right">{m.dorsal}</span>
                                    <span className="truncate">{m.nombre}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-2">
                            <Button size="sm" onClick={() => copiar(urlUnion(g.join_code))}>
                              <Copy className="h-4 w-4 mr-1" /> Enlace de unión
                            </Button>
                            <Button size="sm" variant="outline" asChild>
                              <a href={urlMapa(g.slug)} target="_blank" rel="noreferrer">
                                <MapPin className="h-4 w-4 mr-1" /> Abrir mapa
                              </a>
                            </Button>

                            <Button size="sm" variant="secondary" onClick={() => mostrarQr(g)}>
                              <QrCode className="h-4 w-4 mr-1" /> Mostrar QR de unión
                            </Button>

                            <Button size="sm" variant="ghost" onClick={() => copiar(urlMapa(g.slug))}>
                              <Copy className="h-4 w-4 mr-1" /> Copiar enlace del mapa
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
                          </>)}
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

          <p className="text-center text-sm text-muted-foreground mt-8">
            <Bike className="h-4 w-4 inline mr-1" />
            ¿Vienes a unirte a una grupetta?{" "}
            <Link to="/grupetta" className="underline text-foreground">
              Esta es tu página
            </Link>
          </p>
        </div>
      </div>
      <Dialog open={!!qrGrupetta} onOpenChange={(o) => !o && setQrGrupetta(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" /> Únete a {qrGrupetta?.nombre}
            </DialogTitle>
            <DialogDescription>
              Que lo escanee con la cámara del móvil: entra, pone su nombre y ya está en el grupo.
            </DialogDescription>
          </DialogHeader>
          {qrImagen && (
            <img src={qrImagen} alt="QR de unión" className="mx-auto rounded-lg border w-64 h-64" />
          )}
          <p className="text-center text-sm text-muted-foreground">
            O con el código{" "}
            <span className="font-mono font-bold text-foreground">{qrGrupetta?.join_code}</span>{" "}
            en camberas.com/grupetta
          </p>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
};

export default GrupettaCapo;
