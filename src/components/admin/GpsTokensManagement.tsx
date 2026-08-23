/**
 * Dorsales GPS (QR) — tokens de corredor por evento.
 * Crear, listar, revocar y sacar el QR de activación de cada dorsal
 * (patrón token de la casa: la identidad es el DORSAL, no la persona).
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { QrCode, Loader2, Copy } from "lucide-react";
import { qrConLogo } from "@/lib/qrConLogo";

interface TokenRow {
  token_row_id: string;
  distance_id: string;
  evento: string;
  bib: string;
  nombre: string;
  token: string;
  activo: boolean;
  device_id: string | null;
  intervalo: number | null;
  name_tv: string | null;
}

const urlActivacion = (token: string) => `https://camberas.com/activar.html?t=${token}`;

export function GpsTokensManagement({ selectedRaceId }: { selectedRaceId: string }) {
  const { toast } = useToast();
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [distances, setDistances] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [bib, setBib] = useState("");
  const [nombre, setNombre] = useState("");
  const [distId, setDistId] = useState("");
  const [intervalo, setIntervalo] = useState("");
  const [creando, setCreando] = useState(false);
  const [qrRow, setQrRow] = useState<TokenRow | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");

  const cargar = useCallback(async () => {
    setLoading(true);
    const [t, d] = await Promise.all([
      supabase.rpc("tokens_corredores_carrera" as never, { p_race_id: selectedRaceId } as never),
      supabase.from("race_distances").select("id, name").eq("race_id", selectedRaceId)
        .order("display_order", { ascending: true, nullsFirst: false }),
    ]);
    setTokens(((t.data as unknown) as TokenRow[]) ?? []);
    const dists = d.data ?? [];
    setDistances(dists);
    if (!distId && dists.length > 0) setDistId(dists[0].id);
    setLoading(false);
  }, [selectedRaceId, distId]);

  useEffect(() => {
    if (selectedRaceId) cargar();
  }, [selectedRaceId, cargar]);

  const crear = async () => {
    setCreando(true);
    try {
      const { error } = await supabase.rpc("generar_token_corredor" as never, {
        p_distance_id: distId, p_bib: bib, p_nombre: nombre || null,
        p_intervalo: intervalo ? parseInt(intervalo) : null,
      } as never);
      if (error) throw error;
      toast({ title: `Dorsal ${bib} creado 🎽` });
      setBib(""); setNombre(""); setIntervalo("");
      await cargar();
    } catch (e: any) {
      toast({ title: "No se pudo crear", description: e.message, variant: "destructive" });
    } finally {
      setCreando(false);
    }
  };

  /**
   * La etiqueta de Estado parece informativa pero es un interruptor, y
   * revocar deja el QR de ese dorsal inservible al instante. Los dorsales
   * demo de las tiendas se desactivaron DOS veces así (21 y 22-ago), y la
   * segunda costó el rechazo de Google Play. Ahora hay que confirmar.
   */
  const revocar = async (row: TokenRow) => {
    const aviso = row.activo
      ? `¿Revocar el dorsal ${row.bib}${row.nombre ? " (" + row.nombre + ")" : ""}?

Su QR y su enlace DEJAN DE FUNCIONAR de inmediato, y el móvil que lo lleve
vinculado no podrá seguir enviando.`
      : `¿Reactivar el dorsal ${row.bib}${row.nombre ? " (" + row.nombre + ")" : ""}?`;
    if (!window.confirm(aviso)) return;

    const { error } = await supabase.rpc("revocar_token_corredor" as never, {
      p_token_row_id: row.token_row_id,
    } as never);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else {
      toast({ title: row.activo ? `Dorsal ${row.bib} revocado` : `Dorsal ${row.bib} reactivado` });
      await cargar();
    }
  };

  const cambiarIntervalo = async (row: TokenRow) => {
    const v = window.prompt(
      `Intervalo de envio GPS del dorsal ${row.bib} (segundos, 1-120).
Vacio = por defecto (15 s, o 2 s si es mototv).
El movil lo recoge al RE-ESCANEAR su QR.`,
      row.intervalo != null ? String(row.intervalo) : ""
    );
    if (v === null) return;
    const num = v.trim() === "" ? null : parseInt(v);
    if (num !== null && (isNaN(num) || num < 1 || num > 120)) {
      toast({ title: "Intervalo no valido (1-120 s)", variant: "destructive" });
      return;
    }
    const { error } = await supabase.rpc("cambiar_intervalo_token" as never, {
      p_token_row_id: row.token_row_id, p_intervalo: num,
    } as never);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Intervalo actualizado - re-escanear el QR en el movil" }); await cargar(); }
  };

  // Gallo = corredor que sale en el grafismo. La regla de la casa:
  // name_tv define quien va a TV (igual que en las motos). Al marcarlo
  // se propone tambien el intervalo de 5 s del streaming.
  const marcarGallo = async (row: TokenRow) => {
    const nombre = window.prompt(
      `Nombre corto para TV del dorsal ${row.bib} (ej: R.PEREZ).
Vacio = quitar del grafismo.`,
      row.name_tv ?? ""
    );
    if (nombre === null) return;
    const esGallo = nombre.trim() !== "";
    const { error } = await supabase.rpc("marcar_gallo" as never, {
      p_token_row_id: row.token_row_id,
      p_name_tv: nombre.trim() || null,
      p_intervalo: esGallo && (row.intervalo == null || row.intervalo > 5) ? 5 : null,
    } as never);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else {
      toast({
        title: esGallo
          ? `${row.bib} al grafismo como "${nombre.trim().toUpperCase()}" (5 s) 📺`
          : `${row.bib} fuera del grafismo`,
        description: esGallo ? "El movil recoge el intervalo al re-escanear su QR" : undefined,
      });
      await cargar();
    }
  };

  const abrirQr = async (row: TokenRow) => {
    setQrRow(row);
    setQrDataUrl(await qrConLogo(urlActivacion(row.token)));
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2"><QrCode className="h-6 w-6" /> Dorsales GPS (QR)</h2>
        <p className="text-muted-foreground">Cada dorsal tiene su token: repártelo como QR y el corredor se vincula sin cuentas</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Nuevo dorsal</CardTitle>
          <CardDescription>Se crea con su token listo para el QR</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Select value={distId} onValueChange={setDistId}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Evento" /></SelectTrigger>
            <SelectContent>
              {distances.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input className="w-24" placeholder="Dorsal" value={bib} onChange={(e) => setBib(e.target.value)} />
          <Input className="flex-1 min-w-[160px]" placeholder="Nombre (opcional)" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          <Input className="w-32" type="number" min={1} max={120} placeholder="Interv. (15s)" value={intervalo} onChange={(e) => setIntervalo(e.target.value)} title="Segundos entre posiciones GPS (vacio = 15 s)" />
          <Button onClick={crear} disabled={creando || !bib.trim() || !distId}>
            {creando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Crear"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Dorsales ({tokens.length})</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dorsal</TableHead><TableHead>Nombre</TableHead>
                <TableHead>Evento</TableHead><TableHead>Intervalo</TableHead><TableHead>TV</TableHead><TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tokens.map((row) => (
                <TableRow key={row.token_row_id}>
                  <TableCell className="font-bold">{row.bib}</TableCell>
                  <TableCell>{row.nombre}</TableCell>
                  <TableCell><Badge variant="outline">{row.evento}</Badge></TableCell>
                  <TableCell>
                    <Badge variant="outline" className="cursor-pointer" onClick={() => cambiarIntervalo(row)}
                      title="Clic para cambiar el intervalo de envio">
                      {row.intervalo != null ? `${row.intervalo} s` : "15 s"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={row.name_tv ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => marcarGallo(row)}
                      title="Clic para poner o quitar del grafismo de TV"
                    >
                      {row.name_tv ?? "—"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={row.activo ? "default" : "secondary"}
                      className="cursor-pointer"
                      title={row.activo ? "Clic para REVOCAR este dorsal" : "Clic para reactivarlo"}
                      onClick={() => revocar(row)}
                    >
                      {row.activo ? (row.device_id ? "Vinculado" : "Activo") : "Revocado"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => abrirQr(row)} title="QR de activación">
                      <QrCode className={`h-4 w-4 ${row.activo ? "text-primary" : ""}`} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!qrRow} onOpenChange={(o) => !o && setQrRow(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" /> Dorsal {qrRow?.bib}
              {qrRow && <Badge variant="secondary">{qrRow.nombre}</Badge>}
            </DialogTitle>
            <DialogDescription>Escanéalo con Camberas Track para vincular el dorsal</DialogDescription>
          </DialogHeader>
          {qrDataUrl && <img src={qrDataUrl} alt="QR" className="mx-auto rounded-lg border w-64 h-64" />}
          <Button
            variant="outline"
            onClick={() => {
              if (qrRow) {
                navigator.clipboard.writeText(urlActivacion(qrRow.token));
                toast({ title: "Enlace de activación copiado" });
              }
            }}
          >
            <Copy className="h-4 w-4 mr-1" /> Copiar enlace de activación
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
