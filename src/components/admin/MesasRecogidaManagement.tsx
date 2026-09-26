import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, Copy, ExternalLink, FileSpreadsheet, Loader2, Plus, Search, Ticket, X } from "lucide-react";
import * as XLSX from "xlsx";
import { mesaAtendiendo, numerarMesas, textoMesa as textoMesaComun } from "@/lib/mesasRecogida";
import { hoyLocal } from "@/lib/timezoneUtils";

/**
 * Mesas de recogida de dorsales.
 *
 * Mismo patrón que las pantallas de seguimiento: cada mesa es un PUESTO con
 * su token, no una persona con contraseña. Se genera aquí, se abre la URL en
 * la tablet de la mesa y ese dispositivo queda atendiendo la recogida. La
 * herramienta en sí (/recogida/<token>) es del personal de la mesa — la
 * decisión de agosto: fuera del panel; aquí solo se crean y revocan puestos
 * y se ve el progreso.
 */
const db = supabase as any;

interface Mesa {
  id: string;
  token: string;
  nombre: string;
  activa: boolean;
  last_seen_at: string | null;
  created_at: string;
  entregados: number;
}

interface Props {
  raceId: string;
}

/** ¿La vimos hace poco? (regla común en src/lib/mesasRecogida.ts) */
const enMarcha = mesaAtendiendo;

export function MesasRecogidaManagement({ raceId }: Props) {
  const { toast } = useToast();
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [nombre, setNombre] = useState("");
  const [cargando, setCargando] = useState(true);
  const [creando, setCreando] = useState(false);

  const cargar = useCallback(async () => {
    const { data, error } = await db.rpc("mesas_recogida_carrera", { p_race_id: raceId });
    if (!error) setMesas((data ?? []) as Mesa[]);
    setCargando(false);
  }, [raceId]);

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 60_000);
    return () => clearInterval(t);
  }, [cargar]);

  const url = (token: string) => `${window.location.origin}/recogida/${token}`;

  const crear = async () => {
    setCreando(true);
    try {
      const { data, error } = await db.rpc("generar_token_mesa_recogida", {
        p_race_id: raceId,
        p_nombre: nombre.trim() || "Mesa",
      });
      if (error) throw error;
      setNombre("");
      await cargar();
      if (data?.token) {
        window.open(url(data.token), "_blank", "noopener");
      }
    } catch (e: any) {
      toast({ title: "No se pudo crear", description: e.message, variant: "destructive" });
    } finally {
      setCreando(false);
    }
  };

  const revocar = async (m: Mesa) => {
    const { error } = await db.rpc("revocar_token_mesa_recogida", { p_id: m.id });
    if (error) {
      toast({ title: "No se pudo revocar", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: "Mesa revocada",
      description: `"${m.nombre}" deja de funcionar al instante. Sus entregas quedan registradas.`,
    });
    cargar();
  };

  if (cargando) return null;

  const vivas = mesas.filter((m) => m.activa);

  return (
    <div className="space-y-6">
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Ticket className="h-5 w-5" />
          Mesas de recogida de dorsales
        </CardTitle>
        <CardDescription>
          Cada mesa es un enlace sin contraseña para la tablet o el móvil de quien atiende:
          busca al corredor (o escanea su QR), ve los avisos —pendiente de pago, menor,
          ya entregado— y sella la entrega. Se revoca al terminar.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Carpa, Mesa 21K, Feria del corredor…"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && crear()}
          />
          <Button onClick={crear} disabled={creando} className="gap-2 shrink-0">
            {creando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Crear y abrir
          </Button>
        </div>

        {vivas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ninguna mesa creada. Ponle un nombre que diga dónde está y pulsa "Crear y abrir":
            la URL se abre en ventana nueva, lista para la tablet de la mesa.
          </p>
        ) : (
          <div className="space-y-2">
            {vivas.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
              >
                <div className="min-w-0">
                  <p className="font-semibold flex items-center gap-2">
                    {m.nombre}
                    {enMarcha(m.last_seen_at) ? (
                      <Badge variant="default" className="gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                        atendiendo
                      </Badge>
                    ) : (
                      <Badge variant="outline">sin señal</Badge>
                    )}
                    <span className="text-xs text-muted-foreground font-normal">
                      {m.entregados} entregados aquí
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{url(m.token)}</p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Copiar enlace"
                    onClick={() => {
                      navigator.clipboard.writeText(url(m.token));
                      toast({ title: "Enlace copiado" });
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Abrir en ventana nueva"
                    onClick={() => window.open(url(m.token), "_blank", "noopener")}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" title="Revocar" onClick={() => revocar(m)}>
                    <X className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          "Sin señal" significa que esa mesa lleva más de dos minutos sin dar noticias.
          Solo se entrega a inscripciones pagadas; si recoge otra persona, la mesa anota quién.
        </p>
      </CardContent>
    </Card>

    <EntregasDorsal raceId={raceId} mesas={mesas} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dorsales entregados con la app de la mesa: quién, cuándo, en qué mesa y si
// recogió otra persona. Se refresca solo cada minuto, como las mesas.
// ─────────────────────────────────────────────────────────────────────────────

interface Entrega {
  id: string;
  entregado_at: string;
  recogido_por: string | null;
  mesa_id: string | null;
  registrations: {
    bib_number: number | null;
    first_name: string | null;
    last_name: string | null;
    race_distances: { name: string } | null;
  } | null;
}

// PostgREST devuelve como mucho 1.000 filas por consulta: se pide por páginas
const PAGINA = 1000;

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

function EntregasDorsal({ raceId, mesas }: { raceId: string; mesas: Mesa[] }) {
  const { toast } = useToast();
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [mesaFiltro, setMesaFiltro] = useState("todas");

  const cargar = useCallback(async () => {
    const todas: Entrega[] = [];
    for (let desde = 0; ; desde += PAGINA) {
      const { data, error: err } = await supabase
        .from("entregas_dorsal")
        .select(
          "id, entregado_at, recogido_por, mesa_id, " +
            "registrations(bib_number, first_name, last_name, race_distances(name))",
        )
        .eq("race_id", raceId)
        .order("entregado_at", { ascending: false })
        .range(desde, desde + PAGINA - 1);
      if (err) {
        setError(err.message);
        setCargando(false);
        return;
      }
      todas.push(...((data ?? []) as unknown as Entrega[]));
      if (!data || data.length < PAGINA) break;
    }
    setError(null);
    setEntregas(todas);
    setCargando(false);
  }, [raceId]);

  useEffect(() => {
    setCargando(true);
    cargar();
    const t = setInterval(cargar, 60_000);
    return () => clearInterval(t);
  }, [cargar]);

  // Número de cada mesa: la regla común (src/lib/mesasRecogida.ts), la misma
  // que ve la mesa en su pantalla y la app del organizador
  const mesaPorId = useMemo(() => numerarMesas(mesas), [mesas]);

  const textoMesa = (id: string | null) =>
    id && mesaPorId[id] ? textoMesaComun(mesaPorId[id].numero, mesaPorId[id].nombre) : "—";

  const corredor = (e: Entrega) =>
    [e.registrations?.first_name, e.registrations?.last_name].filter(Boolean).join(" ") || "—";

  const filtradas = useMemo(() => {
    const t = texto.trim().toLowerCase();
    return entregas.filter((e) => {
      if (mesaFiltro !== "todas" && e.mesa_id !== mesaFiltro) return false;
      if (!t) return true;
      const dorsal = e.registrations?.bib_number != null ? String(e.registrations.bib_number) : "";
      return (
        dorsal === t ||
        dorsal.startsWith(t) ||
        corredor(e).toLowerCase().includes(t) ||
        (e.recogido_por ?? "").toLowerCase().includes(t)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entregas, texto, mesaFiltro]);

  const descargarExcel = () => {
    const filas = filtradas.map((e) => ({
      Dorsal: e.registrations?.bib_number ?? "",
      Corredor: corredor(e),
      Recorrido: e.registrations?.race_distances?.name ?? "",
      "Entregado": fechaHora(e.entregado_at),
      Mesa: textoMesa(e.mesa_id),
      "Recogió otra persona": e.recogido_por ?? "",
    }));
    const hoja = XLSX.utils.json_to_sheet(filas);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Entregados");
    XLSX.writeFile(libro, `dorsales-entregados-${hoyLocal()}.xlsx`);
    toast({ title: "Excel descargado", description: `${filas.length} entregas` });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5" />
          Dorsales entregados
          {!cargando && <Badge variant="secondary">{entregas.length}</Badge>}
        </CardTitle>
        <CardDescription>
          Los que se han entregado con la app de las mesas: a quién, cuándo, en qué mesa y si recogió otra persona.
          Se actualiza solo cada minuto.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {cargando ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando entregas…
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">No se pudieron cargar las entregas: {error}</p>
        ) : entregas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no se ha entregado ningún dorsal desde las mesas.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <div className="relative min-w-[200px] flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Dorsal o nombre…"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                />
              </div>
              {mesas.length > 1 && (
                <Select value={mesaFiltro} onValueChange={setMesaFiltro}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas las mesas</SelectItem>
                    {mesas.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{textoMesa(m.id)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button variant="outline" className="gap-2" onClick={descargarExcel} disabled={filtradas.length === 0}>
                <FileSpreadsheet className="h-4 w-4" />
                Excel
              </Button>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Dorsal</TableHead>
                    <TableHead>Corredor</TableHead>
                    <TableHead>Recorrido</TableHead>
                    <TableHead>Entregado</TableHead>
                    <TableHead>Mesa</TableHead>
                    <TableHead>Recogió otra persona</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtradas.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-mono font-bold">{e.registrations?.bib_number ?? "—"}</TableCell>
                      <TableCell>{corredor(e)}</TableCell>
                      <TableCell className="text-muted-foreground">{e.registrations?.race_distances?.name ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">{fechaHora(e.entregado_at)}</TableCell>
                      <TableCell className="whitespace-nowrap">{textoMesa(e.mesa_id)}</TableCell>
                      <TableCell className="text-muted-foreground">{e.recogido_por ?? ""}</TableCell>
                    </TableRow>
                  ))}
                  {filtradas.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                        Ninguna entrega coincide con la búsqueda.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
