/**
 * Bloque «Publicar en Instagram» para un cartel ya dibujado en lienzos.
 *
 * Solo lo monta el panel de admin: la cuenta es la de Camberas, y la función
 * instagram-publicar vuelve a comprobar que quien publica es admin. Un lienzo
 * sale como foto; varios, como carrusel (Instagram los recorta todos al
 * formato del primero: que sean del mismo tamaño).
 */

import { useEffect, useState } from "react";
import { ExternalLink, Instagram, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { tablaSinTipos } from "@/eventos/rpc";
import { formatFechaHoraInstante } from "@/lib/timezoneUtils";
import { MAX_PIE, publicarLienzos, type Publicacion, type TipoPublicacion } from "@/lib/instagram";

interface PublicarInstagramProps {
  /** Se llama al pulsar, cuando los lienzos ya están dibujados */
  lienzos: () => (HTMLCanvasElement | null | undefined)[];
  tipo: TipoPublicacion;
  raceId?: string | null;
  pieInicial: string;
}

export function PublicarInstagram({ lienzos, tipo, raceId, pieInicial }: PublicarInstagramProps) {
  const { toast } = useToast();
  const [pie, setPie] = useState(pieInicial);
  const [confirmar, setConfirmar] = useState(false);
  const [publicando, setPublicando] = useState(false);
  // null = aún no; '' = publicado pero Meta no dio el enlace
  const [enlace, setEnlace] = useState<string | null>(null);
  const [anterior, setAnterior] = useState<Publicacion | null>(null);

  useEffect(() => setPie(pieInicial), [pieInicial]);

  // ¿Ya se publicó esto? Un segundo carrusel igual, otro día, sería ruido
  useEffect(() => {
    if (!raceId) return;
    let cancelado = false;
    tablaSinTipos("instagram_publicaciones")
      .select("id, publicada_at, created_at, permalink")
      .eq("race_id", raceId)
      .eq("tipo", tipo)
      .eq("estado", "publicada")
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }: { data: Publicacion[] | null }) => {
        if (!cancelado) setAnterior(data?.[0] ?? null);
      });
    return () => {
      cancelado = true;
    };
  }, [raceId, tipo, enlace]);

  const publicar = async () => {
    setConfirmar(false);
    setPublicando(true);
    try {
      const piezas = lienzos().filter((l): l is HTMLCanvasElement => !!l);
      const r = await publicarLienzos(piezas, tipo, pie.trim(), raceId);
      setEnlace(r.permalink ?? "");
      toast({
        title: "Publicado en Instagram",
        description: piezas.length > 1 ? `Carrusel de ${piezas.length} imágenes` : undefined,
      });
    } catch (e) {
      toast({ title: "No se pudo publicar", description: (e as Error).message, variant: "destructive" });
    } finally {
      setPublicando(false);
    }
  };

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Instagram className="h-4 w-4" /> Instagram de Camberas
      </p>

      {anterior && enlace === null && (
        <p className="text-xs text-muted-foreground">
          Ya se publicó el {formatFechaHoraInstante(anterior.publicada_at ?? anterior.created_at)}.{" "}
          {anterior.permalink && (
            <a href={anterior.permalink} target="_blank" rel="noopener noreferrer" className="underline">
              Verlo
            </a>
          )}
        </p>
      )}

      <Textarea
        value={pie}
        onChange={(e) => setPie(e.target.value)}
        rows={6}
        maxLength={MAX_PIE}
        aria-label="Pie de la publicación"
      />
      <p className="flex justify-between gap-2 text-xs text-muted-foreground">
        <span>Los enlaces del pie no se pueden pulsar en Instagram.</span>
        <span className="tabular-nums">
          {pie.length}/{MAX_PIE}
        </span>
      </p>

      <Button className="w-full" onClick={() => setConfirmar(true)} disabled={publicando}>
        {publicando ? (
          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
        ) : (
          <Instagram className="h-4 w-4 mr-1" />
        )}
        {publicando ? "Publicando…" : "Publicar en Instagram"}
      </Button>

      {enlace !== null && (
        <p className="text-sm">
          Publicado.{" "}
          {enlace && (
            <a href={enlace} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline">
              Ver en Instagram <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </p>
      )}

      <AlertDialog open={confirmar} onOpenChange={setConfirmar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Publicar en el Instagram de Camberas?</AlertDialogTitle>
            <AlertDialogDescription>
              Sale al momento y lo verán sus seguidores. Para quitarlo habrá que borrarlo desde la
              app de Instagram.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={publicar}>Publicar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
