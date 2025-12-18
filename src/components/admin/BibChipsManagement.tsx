import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Loader2, Plus, Pencil, Trash2, Search, Cpu } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface BibChip {
  id: string;
  race_id: string;
  race_distance_id: string;
  bib_number: number;
  chip_code: string;
  chip_code_2: string | null;
  chip_code_3: string | null;
  chip_code_4: string | null;
  chip_code_5: string | null;
  created_at: string;
  updated_at: string;
  race_distances?: {
    name: string;
    distance_km: number;
  };
}

interface RaceDistance {
  id: string;
  name: string;
  distance_km: number;
}

interface BibChipsManagementProps {
  selectedRaceId: string;
  selectedDistanceId?: string;
}

export function BibChipsManagement({ selectedRaceId, selectedDistanceId }: BibChipsManagementProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [bibChips, setBibChips] = useState<BibChip[]>([]);
  const [distances, setDistances] = useState<RaceDistance[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDistanceId, setFilterDistanceId] = useState<string>(selectedDistanceId || "");
  
  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingChip, setEditingChip] = useState<BibChip | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [chipToDelete, setChipToDelete] = useState<BibChip | null>(null);
  const [saving, setSaving] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    race_distance_id: "",
    bib_number: "",
    chip_code: "",
    chip_code_2: "",
    chip_code_3: "",
    chip_code_4: "",
    chip_code_5: "",
  });

  useEffect(() => {
    if (selectedRaceId) {
      fetchDistances();
      fetchBibChips();
    }
  }, [selectedRaceId]);

  useEffect(() => {
    if (selectedDistanceId) {
      setFilterDistanceId(selectedDistanceId);
    }
  }, [selectedDistanceId]);

  const fetchDistances = async () => {
    try {
      const { data, error } = await supabase
        .from("race_distances")
        .select("id, name, distance_km")
        .eq("race_id", selectedRaceId)
        .order("distance_km", { ascending: false });

      if (error) throw error;
      setDistances(data || []);
    } catch (error: any) {
      console.error("Error fetching distances:", error);
    }
  };

  const fetchBibChips = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("bib_chips")
        .select(`
          *,
          race_distances(name, distance_km)
        `)
        .eq("race_id", selectedRaceId)
        .order("bib_number", { ascending: true });

      const { data, error } = await query;

      if (error) throw error;
      setBibChips(data || []);
    } catch (error: any) {
      console.error("Error fetching bib chips:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los chips",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setEditingChip(null);
    setFormData({
      race_distance_id: filterDistanceId || (distances[0]?.id || ""),
      bib_number: "",
      chip_code: "",
      chip_code_2: "",
      chip_code_3: "",
      chip_code_4: "",
      chip_code_5: "",
    });
    setDialogOpen(true);
  };

  const handleOpenEdit = (chip: BibChip) => {
    setEditingChip(chip);
    setFormData({
      race_distance_id: chip.race_distance_id,
      bib_number: chip.bib_number.toString(),
      chip_code: chip.chip_code,
      chip_code_2: chip.chip_code_2 || "",
      chip_code_3: chip.chip_code_3 || "",
      chip_code_4: chip.chip_code_4 || "",
      chip_code_5: chip.chip_code_5 || "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.race_distance_id || !formData.bib_number || !formData.chip_code) {
      toast({
        title: "Error",
        description: "Evento, dorsal y chip principal son obligatorios",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const chipData = {
        race_id: selectedRaceId,
        race_distance_id: formData.race_distance_id,
        bib_number: parseInt(formData.bib_number),
        chip_code: formData.chip_code.trim(),
        chip_code_2: formData.chip_code_2.trim() || null,
        chip_code_3: formData.chip_code_3.trim() || null,
        chip_code_4: formData.chip_code_4.trim() || null,
        chip_code_5: formData.chip_code_5.trim() || null,
      };

      if (editingChip) {
        const { error } = await supabase
          .from("bib_chips")
          .update(chipData)
          .eq("id", editingChip.id);

        if (error) throw error;
        toast({ title: "Chip actualizado correctamente" });
      } else {
        const { error } = await supabase
          .from("bib_chips")
          .insert(chipData);

        if (error) {
          if (error.code === "23505") {
            throw new Error("Ya existe un registro de chips para este dorsal en este evento");
          }
          throw error;
        }

        // También actualizar el chip principal en registrations
        const { error: regError } = await supabase
          .from("registrations")
          .update({ chip_code: chipData.chip_code })
          .eq("race_distance_id", formData.race_distance_id)
          .eq("bib_number", chipData.bib_number);

        if (regError) {
          console.warn("No se pudo actualizar chip en registration:", regError);
        }

        toast({ title: "Chip creado correctamente" });
      }

      setDialogOpen(false);
      fetchBibChips();
    } catch (error: any) {
      console.error("Error saving chip:", error);
      toast({
        title: "Error",
        description: error.message || "No se pudo guardar el chip",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!chipToDelete) return;

    try {
      const { error } = await supabase
        .from("bib_chips")
        .delete()
        .eq("id", chipToDelete.id);

      if (error) throw error;

      toast({ title: "Chip eliminado correctamente" });
      setDeleteDialogOpen(false);
      setChipToDelete(null);
      fetchBibChips();
    } catch (error: any) {
      console.error("Error deleting chip:", error);
      toast({
        title: "Error",
        description: "No se pudo eliminar el chip",
        variant: "destructive",
      });
    }
  };

  const filteredChips = bibChips.filter((chip) => {
    const matchesSearch =
      searchTerm === "" ||
      chip.bib_number.toString().includes(searchTerm) ||
      chip.chip_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      chip.chip_code_2?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      chip.chip_code_3?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      chip.chip_code_4?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      chip.chip_code_5?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesDistance =
      filterDistanceId === "" || chip.race_distance_id === filterDistanceId;

    return matchesSearch && matchesDistance;
  });

  const countChips = (chip: BibChip) => {
    let count = 1; // chip_code siempre existe
    if (chip.chip_code_2) count++;
    if (chip.chip_code_3) count++;
    if (chip.chip_code_4) count++;
    if (chip.chip_code_5) count++;
    return count;
  };

  if (!selectedRaceId) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Selecciona una carrera para gestionar los chips</p>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Cpu className="h-5 w-5" />
              Gestión de Chips RFID
            </CardTitle>
            <CardDescription>
              Asigna chips RFID a los dorsales por evento
            </CardDescription>
          </div>
          <Button onClick={handleOpenCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Añadir Chip
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por dorsal o chip..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={filterDistanceId} onValueChange={setFilterDistanceId}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Todos los eventos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Todos los eventos</SelectItem>
              {distances.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name} ({d.distance_km}km)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : filteredChips.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {searchTerm || filterDistanceId
              ? "No se encontraron chips con esos filtros"
              : "No hay chips asignados. Añade el primero."}
          </div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">Dorsal</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead>Chip Principal</TableHead>
                  <TableHead className="hidden md:table-cell">Chips Adicionales</TableHead>
                  <TableHead className="w-[80px] text-center">Total</TableHead>
                  <TableHead className="w-[100px]">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredChips.map((chip) => (
                  <TableRow key={chip.id}>
                    <TableCell className="font-bold">#{chip.bib_number}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {chip.race_distances?.name || "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{chip.chip_code}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {chip.chip_code_2 && (
                          <Badge variant="secondary" className="font-mono text-xs">
                            {chip.chip_code_2}
                          </Badge>
                        )}
                        {chip.chip_code_3 && (
                          <Badge variant="secondary" className="font-mono text-xs">
                            {chip.chip_code_3}
                          </Badge>
                        )}
                        {chip.chip_code_4 && (
                          <Badge variant="secondary" className="font-mono text-xs">
                            {chip.chip_code_4}
                          </Badge>
                        )}
                        {chip.chip_code_5 && (
                          <Badge variant="secondary" className="font-mono text-xs">
                            {chip.chip_code_5}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge>{countChips(chip)}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenEdit(chip)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setChipToDelete(chip);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="mt-4 text-sm text-muted-foreground">
          {filteredChips.length} chip(s) encontrado(s)
        </div>
      </CardContent>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingChip ? "Editar Chips" : "Añadir Chips"}
            </DialogTitle>
            <DialogDescription>
              Asigna hasta 5 chips RFID a un dorsal
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="distance">Evento *</Label>
                <Select
                  value={formData.race_distance_id}
                  onValueChange={(v) => setFormData({ ...formData, race_distance_id: v })}
                  disabled={!!editingChip}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    {distances.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bib">Dorsal *</Label>
                <Input
                  id="bib"
                  type="number"
                  value={formData.bib_number}
                  onChange={(e) => setFormData({ ...formData, bib_number: e.target.value })}
                  placeholder="123"
                  disabled={!!editingChip}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="chip1">Chip Principal *</Label>
              <Input
                id="chip1"
                value={formData.chip_code}
                onChange={(e) => setFormData({ ...formData, chip_code: e.target.value })}
                placeholder="ABC123456"
                className="font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="chip2">Chip 2</Label>
                <Input
                  id="chip2"
                  value={formData.chip_code_2}
                  onChange={(e) => setFormData({ ...formData, chip_code_2: e.target.value })}
                  placeholder="Opcional"
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="chip3">Chip 3</Label>
                <Input
                  id="chip3"
                  value={formData.chip_code_3}
                  onChange={(e) => setFormData({ ...formData, chip_code_3: e.target.value })}
                  placeholder="Opcional"
                  className="font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="chip4">Chip 4</Label>
                <Input
                  id="chip4"
                  value={formData.chip_code_4}
                  onChange={(e) => setFormData({ ...formData, chip_code_4: e.target.value })}
                  placeholder="Opcional"
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="chip5">Chip 5</Label>
                <Input
                  id="chip5"
                  value={formData.chip_code_5}
                  onChange={(e) => setFormData({ ...formData, chip_code_5: e.target.value })}
                  placeholder="Opcional"
                  className="font-mono"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingChip ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar chips?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán todos los chips asignados al dorsal #{chipToDelete?.bib_number}.
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
