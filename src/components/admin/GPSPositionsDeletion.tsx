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
  race_id: string;
}

interface GPSReading {
  id: string;
  type: 'runner' | 'moto';
  identifier: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  race_id: string;
}

const PAGE_SIZE = 100;

export default function GPSPositionsDeletion() {
  const [races, setRaces] = useState<Race[]>([]);
  const [distances, setDistances] = useState<RaceDistance[]>([]);
  const [motos, setMotos] = useState<Moto[]>([]);
  
  const [trackingType, setTrackingType] = useState<'all' | 'runners' | 'motos'>('all');
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

  // Load races
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

  // Load distances when race changes
  useEffect(() => {
    if (!selectedRaceId) {
      setDistances([]);
      return;
    }
    const fetchDistances = async () => {
      const { data } = await supabase
        .from('race_distances')
        .select('id, name, race_id')
        .eq('race_id', selectedRaceId)
        .order('distance_km');
      if (data) setDistances(data);
    };
    fetchDistances();
  }, [selectedRaceId]);

  // Load motos when race changes
  useEffect(() => {
    if (!selectedRaceId) {
      setMotos([]);
      return;
    }
    const fetchMotos = async () => {
      const { data } = await supabase
        .from('race_motos')
        .select('id, name, race_id')
        .eq('race_id', selectedRaceId)
        .order('moto_order');
      if (data) setMotos(data);
    };
    fetchMotos();
  }, [selectedRaceId]);

  // Fetch readings with pagination
  const fetchReadings = useCallback(async () => {
    if (!selectedRaceId) {
      setReadings([]);
      setTotalCount(0);
      return;
    }

    setLoading(true);
    const offset = (currentPage - 1) * PAGE_SIZE;
    const combinedReadings: GPSReading[] = [];
    let totalRunners = 0;
    let totalMotos = 0;

    try {
      // Fetch runner GPS if applicable
      if (trackingType === 'all' || trackingType === 'runners') {
        let runnerQuery = supabase
          .from('gps_tracking')
          .select('id, latitude, longitude, timestamp, race_id, registration_id', { count: 'exact' })
          .eq('race_id', selectedRaceId);

        if (selectedDistanceId) {
          // Get registrations for this distance
          const { data: regs } = await supabase
            .from('registrations')
            .select('id, bib_number')
            .eq('race_distance_id', selectedDistanceId);
          
          if (regs && regs.length > 0) {
            const regIds = regs.map(r => r.id);
            runnerQuery = runnerQuery.in('registration_id', regIds);
          }
        }

        const { count: runnerCount } = await runnerQuery;
        totalRunners = runnerCount || 0;

        if (trackingType === 'runners' || (trackingType === 'all' && offset < totalRunners)) {
          const runnerOffset = trackingType === 'all' ? offset : offset;
          const runnerLimit = trackingType === 'all' ? Math.min(PAGE_SIZE, totalRunners - offset) : PAGE_SIZE;
          
          if (runnerLimit > 0 && runnerOffset < totalRunners) {
            let dataQuery = supabase
              .from('gps_tracking')
              .select(`
                id, latitude, longitude, timestamp, race_id,
                registrations!inner(bib_number)
              `)
              .eq('race_id', selectedRaceId)
              .order('timestamp', { ascending: false })
              .range(runnerOffset, runnerOffset + runnerLimit - 1);

            if (selectedDistanceId) {
              const { data: regs } = await supabase
                .from('registrations')
                .select('id')
                .eq('race_distance_id', selectedDistanceId);
              if (regs && regs.length > 0) {
                dataQuery = dataQuery.in('registration_id', regs.map(r => r.id));
              }
            }

            const { data: runnerData } = await dataQuery;
            if (runnerData) {
              runnerData.forEach((r: any) => {
                combinedReadings.push({
                  id: r.id,
                  type: 'runner',
                  identifier: `#${r.registrations?.bib_number || '?'}`,
                  latitude: r.latitude,
                  longitude: r.longitude,
                  timestamp: r.timestamp,
                  race_id: r.race_id
                });
              });
            }
          }
        }
      }

      // Fetch moto GPS if applicable
      if (trackingType === 'all' || trackingType === 'motos') {
        let motoQuery = supabase
          .from('moto_gps_tracking')
          .select('id', { count: 'exact' })
          .eq('race_id', selectedRaceId);

        if (selectedMotoId) {
          motoQuery = motoQuery.eq('moto_id', selectedMotoId);
        }

        const { count: motoCount } = await motoQuery;
        totalMotos = motoCount || 0;

        const motoOffset = trackingType === 'motos' ? offset : Math.max(0, offset - totalRunners);
        const remainingSlots = PAGE_SIZE - combinedReadings.length;
        
        if (remainingSlots > 0 && (trackingType === 'motos' || (trackingType === 'all' && offset + PAGE_SIZE > totalRunners))) {
          let dataQuery = supabase
            .from('moto_gps_tracking')
            .select(`
              id, latitude, longitude, timestamp, race_id, moto_id,
              race_motos!inner(name)
            `)
            .eq('race_id', selectedRaceId)
            .order('timestamp', { ascending: false })
            .range(trackingType === 'motos' ? offset : motoOffset, (trackingType === 'motos' ? offset : motoOffset) + remainingSlots - 1);

          if (selectedMotoId) {
            dataQuery = dataQuery.eq('moto_id', selectedMotoId);
          }

          const { data: motoData } = await dataQuery;
          if (motoData) {
            motoData.forEach((m: any) => {
              combinedReadings.push({
                id: m.id,
                type: 'moto',
                identifier: m.race_motos?.name || 'Moto',
                latitude: m.latitude,
                longitude: m.longitude,
                timestamp: m.timestamp,
                race_id: m.race_id
              });
            });
          }
        }
      }

      // Set total count based on type
      if (trackingType === 'runners') {
        setTotalCount(totalRunners);
      } else if (trackingType === 'motos') {
        setTotalCount(totalMotos);
      } else {
        setTotalCount(totalRunners + totalMotos);
      }

      setReadings(combinedReadings);
    } catch (error) {
      console.error('Error fetching readings:', error);
      toast.error('Error al cargar las lecturas');
    } finally {
      setLoading(false);
    }
  }, [selectedRaceId, selectedDistanceId, selectedMotoId, trackingType, currentPage]);

  const handleApplyFilters = () => {
    setCurrentPage(1);
    setSelectedIds(new Set());
    fetchReadings();
  };

  useEffect(() => {
    if (selectedRaceId) {
      fetchReadings();
    }
  }, [currentPage, fetchReadings]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(readings.map(r => `${r.type}:${r.id}`)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (reading: GPSReading, checked: boolean) => {
    const key = `${reading.type}:${reading.id}`;
    const newSet = new Set(selectedIds);
    if (checked) {
      newSet.add(key);
    } else {
      newSet.delete(key);
    }
    setSelectedIds(newSet);
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    
    setDeleting(true);
    try {
      const runnerIds: string[] = [];
      const motoIds: string[] = [];
      
      selectedIds.forEach(key => {
        const [type, id] = key.split(':');
        if (type === 'runner') runnerIds.push(id);
        else if (type === 'moto') motoIds.push(id);
      });

      // Delete in batches of 100
      const batchSize = 100;
      
      for (let i = 0; i < runnerIds.length; i += batchSize) {
        const batch = runnerIds.slice(i, i + batchSize);
        const { error } = await supabase
          .from('gps_tracking')
          .delete()
          .in('id', batch);
        if (error) throw error;
      }

      for (let i = 0; i < motoIds.length; i += batchSize) {
        const batch = motoIds.slice(i, i + batchSize);
        const { error } = await supabase
          .from('moto_gps_tracking')
          .delete()
          .in('id', batch);
        if (error) throw error;
      }

      toast.success(`${selectedIds.size} registros eliminados`);
      setSelectedIds(new Set());
      fetchReadings();
    } catch (error) {
      console.error('Error deleting:', error);
      toast.error('Error al eliminar registros');
    } finally {
      setDeleting(false);
      setIsDeleteSelectedOpen(false);
    }
  };

  const handleDeleteAllFiltered = async () => {
    setDeleting(true);
    try {
      let deletedCount = 0;
      const batchSize = 1000;

      // Delete runner GPS
      if (trackingType === 'all' || trackingType === 'runners') {
        let hasMore = true;
        while (hasMore) {
          let query = supabase
            .from('gps_tracking')
            .select('id')
            .eq('race_id', selectedRaceId)
            .limit(batchSize);

          if (selectedDistanceId) {
            const { data: regs } = await supabase
              .from('registrations')
              .select('id')
              .eq('race_distance_id', selectedDistanceId);
            if (regs && regs.length > 0) {
              query = query.in('registration_id', regs.map(r => r.id));
            }
          }

          const { data: idsToDelete } = await query;
          
          if (!idsToDelete || idsToDelete.length === 0) {
            hasMore = false;
          } else {
            const ids = idsToDelete.map(r => r.id);
            for (let i = 0; i < ids.length; i += 100) {
              const batch = ids.slice(i, i + 100);
              const { error } = await supabase
                .from('gps_tracking')
                .delete()
                .in('id', batch);
              if (error) throw error;
              deletedCount += batch.length;
            }
          }
        }
      }

      // Delete moto GPS
      if (trackingType === 'all' || trackingType === 'motos') {
        let hasMore = true;
        while (hasMore) {
          let query = supabase
            .from('moto_gps_tracking')
            .select('id')
            .eq('race_id', selectedRaceId)
            .limit(batchSize);

          if (selectedMotoId) {
            query = query.eq('moto_id', selectedMotoId);
          }

          const { data: idsToDelete } = await query;
          
          if (!idsToDelete || idsToDelete.length === 0) {
            hasMore = false;
          } else {
            const ids = idsToDelete.map(r => r.id);
            for (let i = 0; i < ids.length; i += 100) {
              const batch = ids.slice(i, i + 100);
              const { error } = await supabase
                .from('moto_gps_tracking')
                .delete()
                .in('id', batch);
              if (error) throw error;
              deletedCount += batch.length;
            }
          }
        }
      }

      toast.success(`${deletedCount} registros eliminados`);
      setSelectedIds(new Set());
      setCurrentPage(1);
      fetchReadings();
    } catch (error) {
      console.error('Error deleting all:', error);
      toast.error('Error al eliminar registros');
    } finally {
      setDeleting(false);
      setIsDeleteAllOpen(false);
    }
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trash2 className="h-5 w-5" />
          Borrado de Posiciones GPS
        </CardTitle>
        <CardDescription>
          Gestiona y elimina lecturas GPS de corredores y motos
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Filters */}
        <div className="grid gap-4 p-4 border rounded-lg bg-muted/30">
          <div className="space-y-2">
            <Label>Tipo de seguimiento</Label>
            <RadioGroup
              value={trackingType}
              onValueChange={(v) => setTrackingType(v as 'all' | 'runners' | 'motos')}
              className="flex gap-4"
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
            </RadioGroup>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Carrera</Label>
              <Select value={selectedRaceId || 'none'} onValueChange={(v) => {
                setSelectedRaceId(v === 'none' ? '' : v);
                setSelectedDistanceId('');
                setSelectedMotoId('');
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar carrera" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Seleccionar carrera</SelectItem>
                  {races.filter(race => race.id).map(race => (
                    <SelectItem key={race.id} value={race.id}>
                      {race.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(trackingType === 'all' || trackingType === 'runners') && (
              <div className="space-y-2">
                <Label>Evento (opcional)</Label>
                <Select value={selectedDistanceId || 'all'} onValueChange={(v) => setSelectedDistanceId(v === 'all' ? '' : v)} disabled={!selectedRaceId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos los eventos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los eventos</SelectItem>
                    {distances.filter(d => d.id).map(d => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {(trackingType === 'all' || trackingType === 'motos') && (
              <div className="space-y-2">
                <Label>Moto (opcional)</Label>
                <Select value={selectedMotoId || 'all'} onValueChange={(v) => setSelectedMotoId(v === 'all' ? '' : v)} disabled={!selectedRaceId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todas las motos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las motos</SelectItem>
                    {motos.filter(m => m.id).map(m => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
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

        {/* Actions */}
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

        {/* Table */}
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
                    <TableHead>ID/Dorsal</TableHead>
                    <TableHead>Latitud</TableHead>
                    <TableHead>Longitud</TableHead>
                    <TableHead>Timestamp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {readings.map((reading) => (
                    <TableRow key={`${reading.type}:${reading.id}`}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(`${reading.type}:${reading.id}`)}
                          onCheckedChange={(checked) => handleSelectOne(reading, !!checked)}
                        />
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                          reading.type === 'runner' 
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' 
                            : 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
                        }`}>
                          {reading.type === 'runner' ? '🏃' : '🏍️'}
                          {reading.type === 'runner' ? 'GPS' : 'Moto'}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono">{reading.identifier}</TableCell>
                      <TableCell className="font-mono text-sm">{reading.latitude.toFixed(6)}</TableCell>
                      <TableCell className="font-mono text-sm">{reading.longitude.toFixed(6)}</TableCell>
                      <TableCell className="text-sm">{formatDateTime(reading.timestamp)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Página {currentPage} de {totalPages} ({totalCount.toLocaleString()} registros)
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1 || loading}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages || loading}
                >
                  Siguiente
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </>
        ) : selectedRaceId ? (
          <p className="text-center py-8 text-muted-foreground">
            No se encontraron lecturas con los filtros seleccionados
          </p>
        ) : (
          <p className="text-center py-8 text-muted-foreground">
            Selecciona una carrera y aplica los filtros para ver las lecturas
          </p>
        )}

        {/* Delete Selected Dialog */}
        <AlertDialog open={isDeleteSelectedOpen} onOpenChange={setIsDeleteSelectedOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar {selectedIds.size} registros?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción no se puede deshacer. Se eliminarán permanentemente las {selectedIds.size} lecturas GPS seleccionadas.
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

        {/* Delete All Dialog */}
        <AlertDialog open={isDeleteAllOpen} onOpenChange={setIsDeleteAllOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                ¿Eliminar TODOS los {totalCount.toLocaleString()} registros?
              </AlertDialogTitle>
              <AlertDialogDescription>
                <strong className="text-destructive">¡ATENCIÓN!</strong> Esta acción eliminará permanentemente TODAS las lecturas GPS que coinciden con los filtros actuales. Esta operación no se puede deshacer.
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
