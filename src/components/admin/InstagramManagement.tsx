/**
 * Panel › Instagram: la cuenta de Camberas desde el panel de admin.
 *
 * - Conexión: comprueba que el token y la cuenta (secrets de Meta) funcionan
 *   y enseña el cupo de publicaciones del día.
 * - Carteles de grupetta: el admin ve las de todos los capos (el capo solo
 *   las suyas, en /grupetta/capo) y puede publicar su cartel.
 * - Historias en directo: el cronometraje publica solo «primero en meta» y
 *   «podio provisional» (DirectoInstagram).
 * - Webs propias: el Instagram de cada club leído para su web (caché de
 *   instagram-feed), con el motivo cuando Meta no lo da.
 * - Historial: todo lo publicado, con el error de Meta cuando falla.
 *
 * Alta en Meta: docs/instagram-alta-meta.md.
 */

import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Image as ImageIcon, Instagram, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { rpcSinTipos, tablaSinTipos } from "@/eventos/rpc";
import { formatFechaHoraInstante } from "@/lib/timezoneUtils";
import { estadoInstagram, fechaLarga, pieGrupetta, type EstadoCuenta, type Publicacion } from "@/lib/instagram";
import { DirectoInstagram } from "@/components/admin/instagram/DirectoInstagram";

const CartelRuta = lazy(() => import("@/components/CartelRuta").then((m) => ({ default: m.CartelRuta })));

interface GrupettaIG {
  race_id: string;
  nombre: string;
  slug: string | null;
  join_code: string | null;
  fecha: string;
  hora: string | null;
  lugar: string | null;
  publicada: boolean;
  imagen: string | null;
  gpx: string | null;
  capo: string | null;
}

type FilaHistorial = Publicacion & { races: { name: string } | null };

const NOMBRE_TIPO: Record<Publicacion["tipo"], string> = {
  cartel_grupetta: "Cartel de grupetta",
  resultados: "Resultados",
  historia: "Historia",
  otro: "Otro",
};

export function InstagramManagement() {
  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Instagram className="h-6 w-6" /> Instagram
        </h2>
        <p className="text-muted-foreground">
          Publicaciones en la cuenta de Camberas. Solo los administradores publican. El cartel de
          resultados está en Resultados › Cartel para redes.
        </p>
      </div>
      <Conexion />
      <CartelesGrupetta />
      <DirectoInstagram />
      <WebsPropias />
      <Historial />
    </div>
  );
}

// ── Conexión ───────────────────────────────────────────────────────────

function Conexion() {
  const [cuenta, setCuenta] = useState<EstadoCuenta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const comprobar = async () => {
    setCargando(true);
    setError(null);
    try {
      setCuenta(await estadoInstagram());
    } catch (e) {
      setCuenta(null);
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Conexión</CardTitle>
        <CardDescription>
          Token y cuenta de Meta (secrets <code>INSTAGRAM_TOKEN</code> e <code>INSTAGRAM_USER_ID</code>).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button variant="outline" onClick={comprobar} disabled={cargando}>
          {cargando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
          Comprobar conexión
        </Button>

        {cuenta && (
          <div className="flex items-center gap-3">
            {cuenta.profile_picture_url && (
              <img src={cuenta.profile_picture_url} alt="" className="h-12 w-12 rounded-full border" />
            )}
            <div className="text-sm">
              <p className="font-medium flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4 text-primary" /> @{cuenta.username}
              </p>
              <p className="text-muted-foreground">
                {cuenta.followers_count ?? "?"} seguidores · {cuenta.media_count ?? "?"} publicaciones
                {cuenta.cupo &&
                  ` · ${cuenta.cupo.usadas}${cuenta.cupo.total ? ` de ${cuenta.cupo.total}` : ""} por API en 24 h`}
              </p>
            </div>
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive flex items-start gap-1">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Carteles de grupetta ──────────────────────────────────────────────

function CartelesGrupetta() {
  const [grupettas, setGrupettas] = useState<GrupettaIG[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<GrupettaIG | null>(null);

  useEffect(() => {
    rpcSinTipos<GrupettaIG[]>("grupettas_instagram", {})
      .then((g) => setGrupettas(g ?? []))
      .catch((e) => setError(e.message ?? "No se pudieron cargar las grupettas"));
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Carteles de grupetta</CardTitle>
        <CardDescription>
          Las de todos los capos, desde hace una semana. El cartel sale del GPX: sin ruta no hay cartel.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!grupettas && !error && <Loader2 className="h-5 w-5 animate-spin" />}
        {grupettas?.length === 0 && <p className="text-sm text-muted-foreground">No hay grupettas próximas.</p>}
        <ul className="divide-y">
          {grupettas?.map((g) => (
            <li key={g.race_id} className="py-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium truncate">{g.nombre}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {fechaLarga(g.fecha)}
                  {g.hora && ` · ${g.hora} h`}
                  {g.capo && ` · ${g.capo}`}
                  {!g.publicada && " · sin publicar"}
                </p>
              </div>
              <Button size="sm" variant="outline" disabled={!g.gpx} onClick={() => setAbierta(g)}>
                <ImageIcon className="h-4 w-4 mr-1" /> {g.gpx ? "Cartel" : "Sin GPX"}
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>

      <Dialog open={!!abierta} onOpenChange={(o) => !o && setAbierta(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cartel de {abierta?.nombre}</DialogTitle>
            <DialogDescription>Perfil y mapa del recorrido, en carrusel.</DialogDescription>
          </DialogHeader>
          {abierta?.gpx && (
            <Suspense fallback={<Loader2 className="h-6 w-6 animate-spin mx-auto my-8" />}>
              <CartelRuta
                nombre={abierta.nombre}
                fecha={abierta.fecha}
                hora={abierta.hora}
                lugar={abierta.lugar}
                gpxUrl={abierta.gpx}
                imagenUrl={abierta.imagen}
                instagram={{
                  raceId: abierta.race_id,
                  pie: pieGrupetta({
                    nombre: abierta.nombre,
                    fecha: abierta.fecha,
                    hora: abierta.hora,
                    lugar: abierta.lugar,
                    joinCode: abierta.join_code,
                    publicada: abierta.publicada,
                  }),
                }}
              />
            </Suspense>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ── Webs propias ──────────────────────────────────────────────────────

interface FeedCache {
  usuario: string;
  datos: { publicaciones?: unknown[] } | null;
  error: string | null;
  generado: string;
}

function WebsPropias() {
  const [filas, setFilas] = useState<FeedCache[] | null>(null);

  useEffect(() => {
    tablaSinTipos("instagram_feed_cache")
      .select("usuario, datos, error, generado")
      .order("generado", { ascending: false })
      .limit(50)
      .then(({ data }: { data: FeedCache[] | null }) => setFilas(data ?? []));
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Webs propias</CardTitle>
        <CardDescription>
          El Instagram de cada club, leído para su web con la cuenta de Camberas (se refresca cada hora,
          cuando alguien la visita). Sale el de las carreras que tienen su URL en Web propia › Contenido.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {filas?.length === 0 && (
          <p className="text-sm text-muted-foreground">Ninguna web propia ha pedido todavía su Instagram.</p>
        )}
        <ul className="divide-y">
          {filas?.map((f) => (
            <li key={f.usuario} className="py-2 text-sm flex items-start justify-between gap-3">
              <div className="min-w-0">
                <a
                  href={`https://www.instagram.com/${f.usuario}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium underline-offset-2 hover:underline"
                >
                  @{f.usuario}
                </a>
                {f.error && <p className="text-xs text-destructive break-words">{f.error}</p>}
              </div>
              <div className="text-right shrink-0">
                <Badge variant={f.error ? "destructive" : "default"}>
                  {f.error ? "no se ve" : `${f.datos?.publicaciones?.length ?? 0} publicaciones`}
                </Badge>
                <p className="text-xs text-muted-foreground mt-1">{formatFechaHoraInstante(f.generado)}</p>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// ── Historial ─────────────────────────────────────────────────────────

function Historial() {
  const [filas, setFilas] = useState<FilaHistorial[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data, error } = await tablaSinTipos("instagram_publicaciones")
      .select("id, tipo, formato, race_id, estado, permalink, error, created_at, publicada_at, races(name)")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) setError(error.message);
    else setFilas((data ?? []) as FilaHistorial[]);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-lg">Historial</CardTitle>
          <CardDescription>Las 50 últimas, con el error de Meta cuando falla.</CardDescription>
        </div>
        <Button variant="ghost" size="icon" onClick={cargar} aria-label="Recargar">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {filas?.length === 0 && <p className="text-sm text-muted-foreground">Todavía no se ha publicado nada.</p>}
        <ul className="divide-y">
          {filas?.map((f) => (
            <li key={f.id} className="py-2 text-sm flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium truncate">
                  {NOMBRE_TIPO[f.tipo] ?? f.tipo}
                  {f.races?.name && ` · ${f.races.name}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatFechaHoraInstante(f.publicada_at ?? f.created_at)}
                  {f.formato === "historia" && " · historia"}
                </p>
                {f.error && <p className="text-xs text-destructive break-words">{f.error}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge
                  variant={f.estado === "publicada" ? "default" : f.estado === "error" ? "destructive" : "secondary"}
                >
                  {f.estado}
                </Badge>
                {f.permalink && (
                  <a href={f.permalink} target="_blank" rel="noopener noreferrer" aria-label="Ver en Instagram">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
