/**
 * Grupetta — grupos autoservicio (máx. 20) sobre la infraestructura de carreras.
 * - Unirse: sin registro (código + nombre → token → abre la app).
 * - Crear: requiere cuenta de CAPO (alta instantánea, sin aprobación).
 * La app móvil no cambia: el mapa del grupo es la página /:slug/gps.
 */
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Crown, Bike, Copy, MapPin } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import type { Session } from "@supabase/supabase-js";

interface GrupettaCreada {
  join_code: string;
  slug: string;
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
  const [union, setUnion] = useState<UnionResultado | null>(null);

  // Capo: crear
  const [nombreGrupo, setNombreGrupo] = useState("");
  const [creada, setCreada] = useState<GrupettaCreada | null>(null);

  // Capo: auth
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombreCapo, setNombreCapo] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const copiar = (texto: string) => {
    navigator.clipboard.writeText(texto);
    toast({ title: "Copiado al portapapeles" });
  };

  const unirse = async () => {
    setCargando(true);
    try {
      const { data, error } = await supabase.rpc("unirse_grupetta", {
        p_code: codigo,
        p_nombre: nombreMiembro,
      });
      if (error) throw error;
      const res = data as unknown as UnionResultado;
      setUnion(res);
      // activar.html sabe abrir la app o llevar a la descarga
      setTimeout(() => {
        window.location.href = `https://camberas.com/activar.html?t=${res.token}`;
      }, 1500);
    } catch (e: any) {
      toast({ title: "No se pudo unir", description: e.message, variant: "destructive" });
    } finally {
      setCargando(false);
    }
  };

  const crear = async () => {
    setCargando(true);
    try {
      const { data, error } = await supabase.rpc("crear_grupetta", {
        p_nombre: nombreGrupo,
      });
      if (error) throw error;
      setCreada(data as unknown as GrupettaCreada);
    } catch (e: any) {
      toast({ title: "No se pudo crear", description: e.message, variant: "destructive" });
    } finally {
      setCargando(false);
    }
  };

  const altaCapo = async () => {
    setCargando(true);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: nombreCapo,
            last_name: "",
            is_organizer: false,
            is_capo: true,
          },
          emailRedirectTo: `${window.location.origin}/grupetta`,
        },
      });
      if (error) throw error;
      toast({
        title: "¡Cuenta de Capo creada!",
        description: "Revisa tu email si te pide confirmación, y adelante.",
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

  const urlUnion = creada ? `https://camberas.com/grupetta?c=${creada.join_code}` : "";
  const urlMapa = (slug: string) => `https://camberas.com/${slug}/gps`;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 container max-w-2xl mx-auto px-4 py-10 space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-black tracking-widest">
            GRUPE<span className="text-primary">TTA</span>
          </h1>
          <p className="text-muted-foreground mt-2">
            Sal en grupo, vuelve en grupo — la grupetta entera en un mapa.
          </p>
        </div>

        {/* ── Unirse (sin registro) ── */}
        {union ? (
          <Card className="border-green-600">
            <CardHeader>
              <CardTitle>✅ ¡Dentro! Eres el dorsal {union.bib}</CardTitle>
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
              <CardTitle className="flex items-center gap-2">
                <Bike className="h-5 w-5" /> Únete a una grupetta
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
              <Button className="w-full" onClick={unirse} disabled={cargando || !codigo || !nombreMiembro}>
                {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : "UNIRME"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── Zona del Capo ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-amber-500" /> Zona del Capo
            </CardTitle>
            <CardDescription>
              El capo crea la grupetta y reparte el código. Cuenta gratuita e instantánea —
              máximo 3 grupettas activas.
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
                  <Button className="w-full" onClick={altaCapo} disabled={cargando || !email || !password || !nombreCapo}>
                    {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : "👑 CREAR MI CUENTA DE CAPO"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Alta instantánea, sin revisión. Solo para crear y gestionar tus grupettas.
                  </p>
                </TabsContent>
              </Tabs>
            ) : creada ? (
              <div className="space-y-3">
                <p className="font-semibold">🎉 Grupetta creada. Comparte el código:</p>
                <p className="text-4xl font-black tracking-[0.4em] text-center text-primary py-2">
                  {creada.join_code}
                </p>
                <Button className="w-full" onClick={() => copiar(urlUnion)}>
                  <Copy className="h-4 w-4 mr-2" /> Copiar enlace de unión (para el WhatsApp)
                </Button>
                <Button variant="outline" className="w-full" onClick={() => copiar(urlMapa(creada.slug))}>
                  <MapPin className="h-4 w-4 mr-2" /> Copiar enlace del mapa del grupo
                </Button>
                <p className="text-xs text-muted-foreground">
                  Tú también: únete arriba con el código para salir en el mapa. El grupo admite
                  uniones durante 48 horas.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <Label>Nombre de la grupetta</Label>
                  <Input
                    value={nombreGrupo}
                    onChange={(e) => setNombreGrupo(e.target.value)}
                    maxLength={60}
                    placeholder="Ej: Dominguera de Loiu"
                  />
                </div>
                <Button className="w-full" onClick={crear} disabled={cargando || nombreGrupo.trim().length < 3}>
                  {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : "CREAR GRUPETTA"}
                </Button>
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

        <p className="text-center text-xs text-muted-foreground">
          Los miembros necesitan la app Camberas Track (gratuita). El mapa del grupo se abre
          en cualquier navegador — también para los que se quedan en casa.
        </p>
      </main>
      <Footer />
    </div>
  );
};

export default Grupetta;
