/**
 * Grupetta — página del PARTICIPANTE: unirse con el código del grupo.
 * (La gestión del Capo vive aparte en /grupetta/capo para que cada público
 * tenga su camino sin interferencias.)
 */
import { useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Crown, Bike, MapPin, Check } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import planGrupetta from "@/assets/plan-grupetta.svg";

interface UnionResultado {
  token: string;
  bib: number;
  nombre_grupo: string;
  slug: string;
}

const Grupetta = () => {
  const [params] = useSearchParams();
  const { toast } = useToast();
  const [cargando, setCargando] = useState(false);

  const [codigo, setCodigo] = useState(params.get("c")?.toUpperCase() ?? "");
  const [nombreMiembro, setNombreMiembro] = useState("");
  const [aceptaDescargo, setAceptaDescargo] = useState(false);
  const [union, setUnion] = useState<UnionResultado | null>(null);

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
