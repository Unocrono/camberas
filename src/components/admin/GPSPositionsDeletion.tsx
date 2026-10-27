import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Trash2, ChevronLeft, ChevronRight, Loader2, Search, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

/**
 * Borrado de posiciones GPS (admin).
 *
 * Hasta el 27-oct-2026 leía gps_tracking y moto_gps_tracking, la tubería
 * anterior a la app: estaban vacías y el panel decía «no se encontraron
 * lecturas» para cualquier carrera. La app Camberas Track escribe en
 * gps_positions desde julio, una fila por posición con su token (dorsal) y el
 * event_id de la distancia. Aquí se filtra por distancia (event_id) y por tipo
 * de dorsal: corredor, moto (race_motos) u organización (es_organizacion).
 *
 * El admin lee por la política «Admins read gps_positions» y borra por
 * «Admins delete gps_positions» (migración 20261028000000).
 */

interface Race {
  id: string;
  name: string;
  date: string;
}

interface RaceDistance {
  id: string;
  name: string;
  race_id: string;
}

interface Moto {
  id: string;
  name: string;
  token_id: string | null;
}

type TipoDorsal = 'corredor' | 'moto' | 'organizacion';

interface Dorsal {
  token_id: string;
  bib_number: string;
  participant_name: string;
  tipo: TipoDorsal;
}

interface GPSReading {
  id: string;
  token_id: string;
  lat: number;
  lng: number;
  timestamp: string;
  battery: number | null;
}

type TrackingType = 'all' | 'runners' | 'motos' | 'organizacion';

// Lo mínimo que usamos del constructor de consultas de supabase-js. Se tipa
// así, y no con el genérico real, porque PostgrestFilterBuilder hace que tsc
// se pierda («type instantiation is excessively deep») al inferirlo.
type Filtrable = {
  in: (col: string, vals: string[]) => Filtrable;
  eq: (col: string, val: string) => Filtrable;
  not: (col: string, op: string, val: string) => Filtrable;
};

const PAGE_SIZE = 100;

const ETIQUETA: Record<TipoDorsal, { icono: string; texto: string; clase: string }> = {
  corredor: { icono: '🏃', texto: 'Corredor', clase: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  moto: { icono: '🏍️', texto: 'Moto', clase: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' },
  organizacion: { icono: '🦺', texto: 'Organización', clase: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' },
};

export default function GPSPositionsDeletion() {
  const [races, setRaces] = useState<Race[]>([]);
  const [distances, setDistances] = useState<RaceDistance[]>([]);
  const [motos, setMotos] = useState<Moto[]>([]);
  // Dorsales de la carrera (gps_tokens), por token: para etiquetar cada fila
  // y para separar corredores / motos / organización en los filtros
  const [dorsales, setDorsales] = useState<Map<string, Dorsal>>(new Map());

  const [trackingType, setTrackingType] = useState<TrackingType>('all');
  const [selectedRaceId, setSelectedRaceId] = useState<string>('');
  const [selectedDistanceId, setSelectedDistanceId] = useState<string>('');
  const [selectedMotoId, setSelectedMotoId] = useState<string>('');

  const [readings, setReadings] = useState<GPSReading[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleteSelectedOpen, setIsDeleteSelectedOpen] = useState(false);
  const [isDeleteAllOpen, setIsDeleteAllOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Carreras
  useEffect(() => {
    const fetchRaces = async () => {
      const { data } = await supabase
        .from('races')
        .select('id, name, date')
        .order('date', { ascending: false });
      if (data) setRaces(data);
    };
    fetchRaces();
  }, []);

  // Distancias, motos y dorsales de la carrera elegida
  useEffect(() => {
    if (!selectedRaceId) {
      setDistances([]);
      setMotos([]);
      setDorsales(new Map());
      return;
    }
    const fetchDeLaCarrera = async () => {
      const [{ data: dists }, { data: ms }] = await Promise.all([
        supabase
          .from('race_distances')
          .select('id, name, race_id')
          .eq('race_id', selectedRaceId)
          .order('distance_km'),
        supabase
          .from('race_motos')
          .select('id, name, token_id')
          .eq('race_id', selectedRaceId)
          .order('moto_order'),
      ]);
      setDistances(dists ?? []);
      setMotos(ms ?? []);

      const distanceIds = (dists ?? []).map((d) => d.id);
      if (distanceIds.length === 0) {
        setDorsales(new Map());
        return;
      }
      const { data: tokens } = await supabase
        .from('gps_tokens')
        .select('id, bib_number, participant_name, es_organizacion')
        .in('event_id', distanceIds);
      const motoTokens = new Set((ms ?? []).map((m) => m.token_id).filter(Boolean));
      const mapa = new Map<string, Dorsal>();
      for (const t of tokens ?? []) {
        mapa.set(t.id, {
          token_id: t.id,
          bib_number: t.bib_number ?? '?',
          participant_name: t.participant_name ?? '',
          tipo: motoTokens.has(t.id) ? 'moto' : t.es_organizacion ? 'organizacion' : 'corredor',
        });
      }
      setDorsales(mapa);
    };
    fetchDeLaCarrera();
  }, [selectedRaceId]);

  /**
   * Filtros comunes a la lectura y al borrado masivo, sobre gps_positions:
   * event_id (la distancia; siempre informado y siempre igual al del token)
   * y token_id según el tipo de dorsal. Devuelve null si el filtro no puede
   * dar nada (p. ej. «motos» en una carrera sin motos con token).
   */
  const aplicarFiltros = useCallback((q: Filtrable): Filtrable | null => {
    const distanceIds = distances.map((d) => d.id);
    if (distanceIds.length === 0) return null;
    q = selectedDistanceId ? q.eq('event_id', selectedDistanceId) : q.in('event_id', distanceIds);

    const porTipo = (tipo: TipoDorsal) => [...dorsales.values()].filter((d) => d.tipo === tipo).map((d) => d.token_id);
    if (trackingType === 'motos') {
      if (selectedMotoId) {
        const moto = motos.find((m) => m.id === selectedMotoId);
        if (!moto?.token_id) return null;
        return q.eq('token_id', moto.token_id);
      }
      const ids = porTipo('moto');
      return ids.length ? q.in('token_id', ids) : null;
    }
    if (trackingType === 'organizacion') {
      const ids = porTipo('organizacion');
      return ids.length ? q.in('token_id', ids) : null;
    }
    if (trackingType === 'runners') {
      // Corredores = todo lo que no es moto ni organización (pocos ids)
      const fuera = [...porTipo('moto'), ...porTipo('organizacion')];
      return fuera.length ? q.not('token_id', 'in', `(${fuera.join(',')})`) : q;
    }
    return q;
  }, [distances, dorsales, motos, selectedDistanceId, selectedMotoId, trackingType]);

  // Lecturas, paginadas, con el total exacto
  const fetchReadings = useCallback(async () => {
    if (!selectedRaceId) {
      setReadings([]);
      setTotalCount(0);
      return;
    }
    setLoading(true);
    try {
      const desde = (currentPage - 1) * PAGE_SIZE;
      const base = supabase
        .from('gps_positions')
        .select('id, token_id, lat, lng, timestamp, battery', { count: 'exact' });
      const q = aplicarFiltros(base as unknown as Filtrable) as unknown as typeof base | null;
      if (!q) {
        setReadings([]);
        setTotalCount(0);
        return;
      }
      const { data, count, error } = await q
        .order('timestamp', { ascending: false })
        .range(desde, desde + PAGE_SIZE - 1);
      if (error) throw error;
      setReadings((data ?? []) as GPSReading[]);
      setTotalCount(count ?? 0);
    } catch (error) {
      console.error('Error fetching readings:', error);
      toast.error('Error al cargar las lecturas');
    } finally {
      setLoading(false);
    }
  }, [selectedRaceId, currentPage, aplicarFiltros]);

  const handleApplyFilters = () => {
    setCurrentPage(1);
    setSelectedIds(new Set());
    fetchReadings();
  };

  useEffect(() => {
    if (selectedRaceId) {
      fetchReadings();
    }
  }, [selectedRaceId, currentPage, fetchReadings]);

  const handleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(readings.map((r) => r.id)) : new Set());
  };

  const handleSelectOne = (reading: GPSReading, checked: boolean) => {
    const newSet = new Set(selectedIds);
    if (checked) newSet.add(reading.id);
    else newSet.delete(reading.id);
    setSelectedIds(newSet);
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    setDeleting(true);
    try {
      const ids = [...selectedIds];
      const batchSize = 100;
      for (let i = 0; i < ids.length; i += batchSize) {
        const { error } = await supabase
          .from('gps_positions')
          .delete()
          .in('id', ids.slice(i, i + batchSize));
        if (error) throw error;
      }
      toast.success(`${ids.length} posiciones eliminadas`);
      setSelectedIds(new Set());
      fetchReadings();
    } catch (error) {
      console.error('Error deleting:', error);
      toast.error('Error al eliminar posiciones');
    } finally {
      setDeleting(false);
      setIsDeleteSelectedOpen(false);
    }
  };

  // Borrado de todo lo filtrado: los mismos filtros, en una sola orden al
  // servidor (sin traerse los ids), que devuelve cuántas borró
  const handleDeleteAllFiltered = async () => {
    setDeleting(true);
    try {
      const base = supabase.from('gps_positions').delete({ count: 'exact' });
      const q = aplicarFiltros(base as unknown as Filtrable) as unknown as typeof base | null;
      if (!q) {
        toast.info('No hay posiciones que borrar con estos filtros');
        return;
      }
      const { count, error } = await q;
      if (error) throw error;
      toast.success(`${(count ?? 0).toLocaleString()} posiciones eliminadas`);
      setSelectedIds(new Set());
      setCurrentPage(1);
      fetchReadings();
    } catch (error) {
      console.error('Error deleting all:', error);
      toast.error('Error al eliminar posiciones');
    } finally {
      setDeleting(false);
      setIsDeleteAllOpen(false);
    }
  };

  const formatDateTime = (dateStr: string) =>
    new Date(dateStr).toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trash2 className="h-5 w-5" />
          Borrado de Posiciones GPS
        </CardTitle>
        <CardDescription>
          Posiciones enviadas por la app Camberas Track: corredores, motos y organización
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Filtros */}
        <div className="grid gap-4 p-4 border rounded-lg bg-muted/30">
          <div className="space-y-2">
            <Label>Tipo de dorsal</Label>
            <RadioGroup
              value={trackingType}
              onValueChange={(v) => { setTrackingType(v as TrackingType); setSelectedMotoId(''); }}
              className="flex gap-4 flex-wrap"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="all" id="all" />
                <Label htmlFor="all" className="cursor-pointer">Todos</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="runners" id="runners" />
                <Label htmlFor="runners" className="cursor-pointer">Corredores</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="motos" id="motos" />
                <Label htmlFor="motos" className="cursor-pointer">Motos</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="organizacion" id="organizacion" />
                <Label htmlFor="organizacion" className="cursor-pointer">Organización</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Carrera</Label>
              <Select value={selectedRaceId || 'none'} onValueChange={(v) => {
                setSelectedRaceId(v === 'none' ? '' : v);
                setSelectedDistanceId('');
                setSelectedMotoId('');
                setReadings([]);
                setTotalCount(0);
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar carrera" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Seleccionar carrera</SelectItem>
                  {races.filter((race) => race.id).map((race) => (
                    <SelectItem key={race.id} value={race.id}>
                      {race.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Evento (opcional)</Label>
              <Select value={selectedDistanceId || 'all'} onValueChange={(v) => setSelectedDistanceId(v === 'all' ? '' : v)} disabled={!selectedRaceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos los eventos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los eventos</SelectItem>
                  {distances.filter((d) => d.id).map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {trackingType === 'motos' && (
              <div className="space-y-2">
                <Label>Moto (opcional)</Label>
                <Select value={selectedMotoId || 'all'} onValueChange={(v) => setSelectedMotoId(v === 'all' ? '' : v)} disabled={!selectedRaceId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todas las motos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las motos</SelectItem>
                    {motos.filter((m) => m.id).map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}{m.token_id ? '' : ' (sin dorsal GPS)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <Button onClick={handleApplyFilters} disabled={!selectedRaceId || loading}>
            <Search className="h-4 w-4 mr-2" />
            Aplicar filtros
          </Button>
        </div>

        {/* Acciones */}
        {readings.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setIsDeleteSelectedOpen(true)}
              disabled={selectedIds.size === 0 || deleting}
            >
              {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Eliminar seleccionadas ({selectedIds.size})
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setIsDeleteAllOpen(true)}
              disabled={deleting}
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              Eliminar TODAS ({totalCount.toLocaleString()})
            </Button>
          </div>
        )}

        {/* Tabla */}
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : readings.length > 0 ? (
          <>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedIds.size === readings.length && readings.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Dorsal</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Latitud</TableHead>
                    <TableHead>Longitud</TableHead>
                    <TableHead>Hora</TableHead>
                    <TableHead>Batería</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {readings.map((reading) => {
                    const dorsal = dorsales.get(reading.token_id);
                    const et = ETIQUETA[dorsal?.tipo ?? 'corredor'];
                    return (
                      <TableRow key={reading.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(reading.id)}
                            onCheckedChange={(checked) => handleSelectOne(reading, !!checked)}
                          />
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${et.clase}`}>
                            {et.icono} {et.texto}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono">{dorsal?.bib_number ?? '?'}</TableCell>
                        <TableCell className="text-sm">{dorsal?.participant_name ?? ''}</TableCell>
                        <TableCell className="font-mono text-sm">{reading.lat.toFixed(6)}</TableCell>
                        <TableCell className="font-mono text-sm">{reading.lng.toFixed(6)}</TableCell>
                        <TableCell className="text-sm">{formatDateTime(reading.timestamp)}</TableCell>
                        <TableCell className="text-sm">{reading.battery != null ? `${reading.battery} %` : ''}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Paginación */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Página {currentPage} de {totalPages} ({totalCount.toLocaleString()} posiciones)
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1 || loading}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages || loading}
                >
                  Siguiente
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </>
        ) : selectedRaceId ? (
          <p className="text-center py-8 text-muted-foreground">
            No se encontraron posiciones con los filtros seleccionados
          </p>
        ) : (
          <p className="text-center py-8 text-muted-foreground">
            Selecciona una carrera y aplica los filtros para ver las posiciones
          </p>
        )}

        {/* Borrar seleccionadas */}
        <AlertDialog open={isDeleteSelectedOpen} onOpenChange={setIsDeleteSelectedOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar {selectedIds.size} posiciones?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción no se puede deshacer. Se eliminarán permanentemente las {selectedIds.size} posiciones GPS seleccionadas.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteSelected}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Borrar todo lo filtrado */}
        <AlertDialog open={isDeleteAllOpen} onOpenChange={setIsDeleteAllOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                ¿Eliminar TODAS las {totalCount.toLocaleString()} posiciones?
              </AlertDialogTitle>
              <AlertDialogDescription>
                <strong className="text-destructive">¡ATENCIÓN!</strong> Esta acción eliminará permanentemente TODAS las posiciones GPS que coinciden con los filtros actuales (carrera, evento y tipo de dorsal). Esta operación no se puede deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteAllFiltered}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Eliminar TODO
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
