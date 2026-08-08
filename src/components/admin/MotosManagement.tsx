import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Badge } from "@/components/ui/badge";
import { Bike, Plus, Pencil, Trash2, Loader2, GripVertical, User, UserPlus, QrCode } from "lucide-react";
import { qrConLogo } from "@/lib/qrConLogo";

interface Moto {
  id: string;
  race_id: string;
  race_distance_id: string | null;
  name: string;
  name_tv: string | null;
  color: string;
  description: string | null;
  user_id: string | null;
  moto_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface RaceDistance {
  id: string;
  name: string;
  distance_km: number;
}

interface UserOption {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email?: string;
}

interface MotosManagementProps {
  selectedRaceId: string;
}

const PRESET_COLORS = [
  "#FF5722", "#E91E63", "#9C27B0", "#673AB7", "#3F51B5",
  "#2196F3", "#03A9F4", "#00BCD4", "#009688", "#4CAF50",
  "#8BC34A", "#CDDC39", "#FFEB3B", "#FFC107", "#FF9800"
];

export function MotosManagement({ selectedRaceId }: MotosManagementProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [motos, setMotos] = useState<Moto[]>([]);
  const [distances, setDistances] = useState<RaceDistance[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedMoto, setSelectedMoto] = useState<Moto | null>(null);
  // Tokens de activación (patrón QR de camberas-track aplicado a las motos)
  const [motoTokens, setMotoTokens] = useState<Record<string, { token: string; bib: string; activo: boolean }>>({});
  const [qrDialogMoto, setQrDialogMoto] = useState<Moto | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [generandoToken, setGenerandoToken] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    name_tv: "",
    color: "#FF5722",
    description: "",
    user_id: "",
    race_distance_id: "",
    is_active: true,
  });
  useEffect(() => {
    if (selectedRaceId) {
      fetchMotos();
      fetchDistances();
      fetchMotoTokens();
    }
  }, [selectedRaceId]);

  const fetchMotoTokens = async () => {
    const { data, error } = await supabase.rpc("tokens_motos_carrera", {
      p_race_id: selectedRaceId,
    });
    if (!error && data) {
      const map: Record<string, { token: string; bib: string; activo: boolean }> = {};
      for (const t of data as any[]) {
        map[t.race_moto_id] = { token: t.token, bib: t.bib, activo: t.activo };
      }
      setMotoTokens(map);
    }
  };

  const generarToken = async (moto: Moto) => {
    setGenerandoToken(true);
    try {
      const { data, error } = await supabase.rpc("generar_token_moto", {
        p_race_moto_id: moto.id,
      });
      if (error) throw error;
      const d = data as any;
      const tok = { token: d.token as string, bib: d.bib as string, activo: true };
      setMotoTokens((prev) => ({ ...prev, [moto.id]: tok }));
      return tok;
    } catch (e: any) {
      toast({ title: "No se pudo generar el token", description: e.message, variant: "destructive" });
      return null;
    } finally {
      setGenerandoToken(false);
    }
  };

  const abrirQr = async (moto: Moto) => {
    let tok = motoTokens[moto.id];
    if (!tok || !tok.activo) {
      const nuevo = await generarToken(moto);
      if (!nuevo) return;
      tok = nuevo;
    }
    setQrDialogMoto(moto);
    setQrDataUrl(await qrConLogo(tok.token));
  };

  const regenerarToken = async () => {
    if (!qrDialogMoto) return;
    const tok = await generarToken(qrDialogMoto);
    if (tok) {
      setQrDataUrl(await qrConLogo(tok.token));
      toast({ title: "Token regenerado — el anterior queda revocado" });
    }
  };

  const fetchMotos = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("race_motos")
        .select("*")
        .eq("race_id", selectedRaceId)
        .order("moto_order", { ascending: true });

      if (error) throw error;
      setMotos(data || []);
    } catch (error: any) {
      console.error("Error fetching motos:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar las motos",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchDistances = async () => {
    try {
      const { data, error } = await supabase
        .from("race_distances")
        .select("id, name, distance_km")
        .eq("race_id", selectedRaceId)
        .order("distance_km", { ascending: true });

      if (error) throw error;
      setDistances(data || []);
    } catch (error: any) {
      console.error("Error fetching distances:", error);
    }
  };

  const handleOpenDialog = (moto?: Moto) => {
    if (moto) {
      setSelectedMoto(moto);
      setFormData({
        name: moto.name,
        name_tv: moto.name_tv || "",
        color: moto.color,
        description: moto.description || "",
        user_id: moto.user_id || "",
        race_distance_id: moto.race_distance_id || "",
        is_active: moto.is_active,
      });
    } else {
      setSelectedMoto(null);
      setFormData({
        name: "",
        name_tv: "",
        color: PRESET_COLORS[motos.length % PRESET_COLORS.length],
        description: "",
        user_id: "",
        race_distance_id: distances.length > 0 ? distances[0].id : "",
        is_active: true,
      });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast({
        title: "Error",
        description: "El nombre de la moto es obligatorio",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const motoData = {
        race_id: selectedRaceId,
        race_distance_id: formData.race_distance_id || null,
        name: formData.name.trim(),
        name_tv: formData.name_tv.trim() || null,
        color: formData.color,
        description: formData.description.trim() || null,
        is_active: formData.is_active,
      };

      if (selectedMoto) {
        // Update existing moto
        const { error } = await supabase
          .from("race_motos")
          .update(motoData)
          .eq("id", selectedMoto.id);

        if (error) throw error;

        toast({
          title: "Moto actualizada",
          description: "La moto se ha actualizado correctamente",
        });
      } else {
        // Create new moto
        const newOrder = motos.length > 0 ? Math.max(...motos.map(m => m.moto_order)) + 1 : 1;
        const { error } = await supabase
          .from("race_motos")
          .insert({ ...motoData, moto_order: newOrder });

        if (error) throw error;

        toast({
          title: "Moto creada",
          description: "La moto se ha creado correctamente",
        });
      }

      setDialogOpen(false);
      fetchMotos();
    } catch (error: any) {
      console.error("Error saving moto:", error);
      toast({
        title: "Error",
        description: error.message || "No se pudo guardar la moto",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedMoto) return;

    try {
      const { error } = await supabase
        .from("race_motos")
        .delete()
        .eq("id", selectedMoto.id);

      if (error) throw error;

      toast({
        title: "Moto eliminada",
        description: "La moto se ha eliminado correctamente",
      });

      setDeleteDialogOpen(false);
      setSelectedMoto(null);
      fetchMotos();
    } catch (error: any) {
      console.error("Error deleting moto:", error);
      toast({
        title: "Error",
        description: error.message || "No se pudo eliminar la moto",
        variant: "destructive",
      });
    }
  };

  const handleToggleActive = async (moto: Moto) => {
    try {
      const { error } = await supabase
        .from("race_motos")
        .update({ is_active: !moto.is_active })
        .eq("id", moto.id);

      if (error) throw error;

      setMotos(motos.map(m => 
        m.id === moto.id ? { ...m, is_active: !m.is_active } : m
      ));

      toast({
        title: moto.is_active ? "Moto desactivada" : "Moto activada",
        description: `La moto ${moto.name} ha sido ${moto.is_active ? "desactivada" : "activada"}`,
      });
    } catch (error: any) {
      console.error("Error toggling moto status:", error);
      toast({
        title: "Error",
        description: "No se pudo cambiar el estado de la moto",
        variant: "destructive",
      });
    }
  };

  const getDistanceName = (distanceId: string | null) => {
    if (!distanceId) return "Sin asignar";
    const distance = distances.find(d => d.id === distanceId);
    if (!distance) return "Desconocido";
    return `${distance.name} (${distance.distance_km}km)`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Bike className="h-6 w-6" />
            GPS Organización
          </h2>
          <p className="text-muted-foreground">
            Los dispositivos GPS de la organización (motos, ambulancia, cierre…) — cada uno se vincula con su QR, sin usuarios
          </p>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo GPS
        </Button>
      </div>

      {motos.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Bike className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No hay GPS de Organización configurados</h3>
            <p className="text-muted-foreground text-center mb-4">
              Añade los dispositivos GPS de la organización para esta carrera
            </p>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              Crear el primer GPS
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>GPS de Organización ({motos.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Nombre TV</TableHead>
                  <TableHead>Recorrido</TableHead>
                  <TableHead>Color</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {motos.map((moto) => (
                  <TableRow key={moto.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                        <span className="font-medium">{moto.moto_order}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{moto.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {moto.name_tv || "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {getDistanceName(moto.race_distance_id)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-6 h-6 rounded-full border border-border"
                          style={{ backgroundColor: moto.color }}
                        />
                        <span className="text-xs text-muted-foreground">{moto.color}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={moto.is_active ? "default" : "secondary"}
                        className="cursor-pointer"
                        onClick={() => handleToggleActive(moto)}
                      >
                        {moto.is_active ? "Activa" : "Inactiva"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => abrirQr(moto)}
                          title={motoTokens[moto.id]?.activo ? "Ver QR de activación" : "Generar token y QR"}
                        >
                          <QrCode className={`h-4 w-4 ${motoTokens[moto.id]?.activo ? "text-primary" : ""}`} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenDialog(moto)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedMoto(moto);
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
          </CardContent>
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedMoto ? "Editar GPS" : "Nuevo GPS"}
            </DialogTitle>
            <DialogDescription>
              {selectedMoto
                ? "Modifica los datos del dispositivo"
                : "Añade un nuevo dispositivo GPS de la organización"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre *</Label>
              <Input
                id="name"
                placeholder="Ej: Moto Cabeza de Carrera"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="name_tv">Nombre para TV</Label>
              <Input
                id="name_tv"
                placeholder="Ej: Moto1, Moto2"
                value={formData.name_tv}
                onChange={(e) => setFormData({ ...formData, name_tv: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Nombre corto para mostrar en el grafismo de TV
              </p>
            </div>

            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      formData.color === color
                        ? "border-primary scale-110"
                        : "border-transparent hover:border-muted-foreground"
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => setFormData({ ...formData, color })}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Label htmlFor="custom-color" className="text-xs">Personalizado:</Label>
                <Input
                  id="custom-color"
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="w-12 h-8 p-1 cursor-pointer"
                />
                <span className="text-xs text-muted-foreground">{formData.color}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="race_distance_id">Recorrido *</Label>
              <Select
                value={formData.race_distance_id || "none"}
                onValueChange={(value) => setFormData({ ...formData, race_distance_id: value === "none" ? "" : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un recorrido" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin asignar</SelectItem>
                  {distances.map((distance) => (
                    <SelectItem key={distance.id} value={distance.id}>
                      {distance.name} ({distance.distance_km}km)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Recorrido que sigue esta moto para calcular distancia restante
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descripción</Label>
              <Textarea
                id="description"
                placeholder="Ej: Moto que va delante del pelotón principal"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="is_active">Activa</Label>
                <p className="text-xs text-muted-foreground">
                  Las motos inactivas no se muestran en el mapa
                </p>
              </div>
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {selectedMoto ? "Guardar cambios" : "Crear moto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar moto?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará la moto "{selectedMoto?.name}" y todos sus datos asociados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* QR de activación de la moto (patrón token de camberas-track) */}
      <Dialog open={!!qrDialogMoto} onOpenChange={(o) => !o && setQrDialogMoto(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              {qrDialogMoto?.name}
              {qrDialogMoto && motoTokens[qrDialogMoto.id] && (
                <Badge variant="secondary">{motoTokens[qrDialogMoto.id].bib}</Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              Escanéalo con la app Camberas Motos para vincular esta moto.
              Sin usuarios ni contraseñas: el token identifica a la MOTO.
            </DialogDescription>
          </DialogHeader>
          {qrDataUrl && (
            <img src={qrDataUrl} alt="QR de activación" className="mx-auto rounded-lg border w-64 h-64" />
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                if (qrDialogMoto && motoTokens[qrDialogMoto.id]) {
                  navigator.clipboard.writeText(motoTokens[qrDialogMoto.id].token);
                  toast({ title: "Token copiado al portapapeles" });
                }
              }}
            >
              Copiar token
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={regenerarToken}
              disabled={generandoToken}
            >
              {generandoToken ? <Loader2 className="h-4 w-4 animate-spin" /> : "Regenerar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
