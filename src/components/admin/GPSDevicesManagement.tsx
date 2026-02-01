import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { 
  Radio, 
  Plus, 
  Pencil, 
  Trash2, 
  Loader2, 
  Wifi, 
  WifiOff, 
  Battery, 
  BatteryLow,
  BatteryWarning,
  Clock,
  RefreshCw,
  Signal,
  SignalLow,
  SignalZero
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

interface GPSDevice {
  id: string;
  imei: string;
  device_name: string | null;
  device_model: string | null;
  race_id: string | null;
  race_moto_id: string | null;
  registration_id: string | null;
  active: boolean | null;
  battery_level: number | null;
  last_seen_at: string | null;
  update_frequency: number | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface RaceMoto {
  id: string;
  name: string;
  color: string;
  race_id: string;
}

interface Race {
  id: string;
  name: string;
}

interface GPSDevicesManagementProps {
  selectedRaceId?: string;
}

export function GPSDevicesManagement({ selectedRaceId }: GPSDevicesManagementProps) {
  const { toast } = useToast();
  const [devices, setDevices] = useState<GPSDevice[]>([]);
  const [motos, setMotos] = useState<RaceMoto[]>([]);
  const [races, setRaces] = useState<Race[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<GPSDevice | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [formData, setFormData] = useState({
    imei: "",
    device_name: "",
    device_model: "GL320M",
    race_id: "",
    race_moto_id: "",
    active: true,
    update_frequency: 5,
    notes: "",
  });

  useEffect(() => {
    fetchDevices();
    fetchRaces();
  }, [selectedRaceId]);

  useEffect(() => {
    if (formData.race_id) {
      fetchMotos(formData.race_id);
    } else {
      setMotos([]);
    }
  }, [formData.race_id]);

  const fetchDevices = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("gps_devices")
        .select("*")
        .order("created_at", { ascending: false });

      if (selectedRaceId) {
        query = query.eq("race_id", selectedRaceId);
      }

      const { data, error } = await query;
      if (error) throw error;
      setDevices(data || []);
    } catch (error: any) {
      console.error("Error fetching devices:", error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los dispositivos",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchRaces = async () => {
    try {
      const { data, error } = await supabase
        .from("races")
        .select("id, name")
        .order("date", { ascending: false });

      if (error) throw error;
      setRaces(data || []);
    } catch (error: any) {
      console.error("Error fetching races:", error);
    }
  };

  const fetchMotos = async (raceId: string) => {
    try {
      const { data, error } = await supabase
        .from("race_motos")
        .select("id, name, color, race_id")
        .eq("race_id", raceId)
        .order("moto_order", { ascending: true });

      if (error) throw error;
      setMotos(data || []);
    } catch (error: any) {
      console.error("Error fetching motos:", error);
    }
  };

  const handleOpenDialog = (device?: GPSDevice) => {
    if (device) {
      setSelectedDevice(device);
      setFormData({
        imei: device.imei,
        device_name: device.device_name || "",
        device_model: device.device_model || "GL320M",
        race_id: device.race_id || "",
        race_moto_id: device.race_moto_id || "",
        active: device.active ?? true,
        update_frequency: device.update_frequency || 5,
        notes: device.notes || "",
      });
      if (device.race_id) {
        fetchMotos(device.race_id);
      }
    } else {
      setSelectedDevice(null);
      setFormData({
        imei: "",
        device_name: "",
        device_model: "GL320M",
        race_id: selectedRaceId || "",
        race_moto_id: "",
        active: true,
        update_frequency: 5,
        notes: "",
      });
      if (selectedRaceId) {
        fetchMotos(selectedRaceId);
      }
    }
    setDialogOpen(true);
  };

  const validateIMEI = (imei: string): boolean => {
    return /^\d{15}$/.test(imei);
  };

  const handleSave = async () => {
    if (!formData.imei.trim()) {
      toast({
        title: "Error",
        description: "El IMEI es obligatorio",
        variant: "destructive",
      });
      return;
    }

    if (!validateIMEI(formData.imei)) {
      toast({
        title: "Error",
        description: "El IMEI debe tener exactamente 15 dígitos",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const deviceData = {
        imei: formData.imei.trim(),
        device_name: formData.device_name.trim() || null,
        device_model: formData.device_model || "GL320M",
        race_id: formData.race_id || null,
        race_moto_id: formData.race_moto_id || null,
        active: formData.active,
        update_frequency: formData.update_frequency,
        notes: formData.notes.trim() || null,
      };

      if (selectedDevice) {
        const { error } = await supabase
          .from("gps_devices")
          .update(deviceData)
          .eq("id", selectedDevice.id);

        if (error) throw error;

        toast({
          title: "Dispositivo actualizado",
          description: "El dispositivo GPS se ha actualizado correctamente",
        });
      } else {
        const { error } = await supabase
          .from("gps_devices")
          .insert(deviceData);

        if (error) throw error;

        toast({
          title: "Dispositivo creado",
          description: "El dispositivo GPS se ha registrado correctamente",
        });
      }

      setDialogOpen(false);
      fetchDevices();
    } catch (error: any) {
      console.error("Error saving device:", error);
      toast({
        title: "Error",
        description: error.message || "No se pudo guardar el dispositivo",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedDevice) return;

    try {
      const { error } = await supabase
        .from("gps_devices")
        .delete()
        .eq("id", selectedDevice.id);

      if (error) throw error;

      toast({
        title: "Dispositivo eliminado",
        description: "El dispositivo GPS se ha eliminado correctamente",
      });

      setDeleteDialogOpen(false);
      setSelectedDevice(null);
      fetchDevices();
    } catch (error: any) {
      console.error("Error deleting device:", error);
      toast({
        title: "Error",
        description: error.message || "No se pudo eliminar el dispositivo",
        variant: "destructive",
      });
    }
  };

  const handleToggleActive = async (device: GPSDevice) => {
    try {
      const { error } = await supabase
        .from("gps_devices")
        .update({ active: !device.active })
        .eq("id", device.id);

      if (error) throw error;

      setDevices(devices.map(d => 
        d.id === device.id ? { ...d, active: !d.active } : d
      ));

      toast({
        title: device.active ? "Dispositivo desactivado" : "Dispositivo activado",
      });
    } catch (error: any) {
      console.error("Error toggling device status:", error);
      toast({
        title: "Error",
        description: "No se pudo cambiar el estado",
        variant: "destructive",
      });
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchDevices();
    setRefreshing(false);
  };

  const getConnectionStatus = (lastSeenAt: string | null) => {
    if (!lastSeenAt) return { status: "never", label: "Sin conexión", color: "destructive" as const };
    
    const lastSeen = new Date(lastSeenAt);
    const now = new Date();
    const diffMinutes = (now.getTime() - lastSeen.getTime()) / (1000 * 60);
    
    if (diffMinutes < 5) return { status: "online", label: "Conectado", color: "default" as const };
    if (diffMinutes < 30) return { status: "recent", label: "Reciente", color: "secondary" as const };
    return { status: "offline", label: "Desconectado", color: "destructive" as const };
  };

  const getBatteryIcon = (level: number | null) => {
    if (level === null) return <Battery className="h-4 w-4 text-muted-foreground" />;
    if (level < 20) return <BatteryLow className="h-4 w-4 text-destructive" />;
    if (level < 50) return <BatteryWarning className="h-4 w-4 text-yellow-500" />;
    return <Battery className="h-4 w-4 text-green-500" />;
  };

  const getSignalIcon = (lastSeenAt: string | null) => {
    const status = getConnectionStatus(lastSeenAt);
    if (status.status === "online") return <Signal className="h-4 w-4 text-green-500" />;
    if (status.status === "recent") return <SignalLow className="h-4 w-4 text-yellow-500" />;
    return <SignalZero className="h-4 w-4 text-destructive" />;
  };

  const getMotoName = (motoId: string | null) => {
    if (!motoId) return null;
    const moto = motos.find(m => m.id === motoId);
    return moto?.name;
  };

  const getRaceName = (raceId: string | null) => {
    if (!raceId) return "Sin carrera";
    const race = races.find(r => r.id === raceId);
    return race?.name || "Carrera desconocida";
  };

  // Stats for dashboard
  const stats = {
    total: devices.length,
    active: devices.filter(d => d.active).length,
    online: devices.filter(d => getConnectionStatus(d.last_seen_at).status === "online").length,
    lowBattery: devices.filter(d => d.battery_level !== null && d.battery_level < 20).length,
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Radio className="h-6 w-6" />
            Dispositivos GPS Hardware
          </h2>
          <p className="text-muted-foreground">
            Gestiona los dispositivos Queclink GL320M conectados
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
          <Button onClick={() => handleOpenDialog()}>
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Dispositivo
          </Button>
        </div>
      </div>

      {/* Dashboard Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <Radio className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Activos</p>
                <p className="text-2xl font-bold">{stats.active}</p>
              </div>
              <Wifi className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Conectados</p>
                <p className="text-2xl font-bold">{stats.online}</p>
              </div>
              <Signal className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Batería baja</p>
                <p className="text-2xl font-bold">{stats.lowBattery}</p>
              </div>
              <BatteryLow className="h-8 w-8 text-destructive" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Devices Table */}
      {devices.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Radio className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No hay dispositivos registrados</h3>
            <p className="text-muted-foreground text-center mb-4">
              Añade dispositivos GPS Queclink para recibir datos de posición
            </p>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              Registrar primer dispositivo
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Dispositivos registrados ({devices.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Estado</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>IMEI</TableHead>
                    <TableHead>Moto asignada</TableHead>
                    <TableHead>Batería</TableHead>
                    <TableHead>Última conexión</TableHead>
                    <TableHead>Activo</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {devices.map((device) => {
                    const connStatus = getConnectionStatus(device.last_seen_at);
                    // Find moto for this device from any race
                    const deviceMoto = device.race_moto_id ? 
                      motos.find(m => m.id === device.race_moto_id) : null;
                    
                    return (
                      <TableRow key={device.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getSignalIcon(device.last_seen_at)}
                            <Badge variant={connStatus.color}>
                              {connStatus.label}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{device.device_name || "Sin nombre"}</p>
                            <p className="text-xs text-muted-foreground">{device.device_model}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                            {device.imei}
                          </code>
                        </TableCell>
                        <TableCell>
                          {deviceMoto ? (
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-3 h-3 rounded-full" 
                                style={{ backgroundColor: deviceMoto.color }}
                              />
                              <span>{deviceMoto.name}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">Sin asignar</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {getBatteryIcon(device.battery_level)}
                            <span className="text-sm">
                              {device.battery_level !== null ? `${device.battery_level}%` : "-"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {device.last_seen_at ? (
                            <div className="flex items-center gap-1 text-sm">
                              <Clock className="h-3 w-3" />
                              {formatDistanceToNow(new Date(device.last_seen_at), { 
                                addSuffix: true, 
                                locale: es 
                              })}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">Nunca</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={device.active ?? false}
                            onCheckedChange={() => handleToggleActive(device)}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenDialog(device)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setSelectedDevice(device);
                                setDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {selectedDevice ? "Editar Dispositivo GPS" : "Nuevo Dispositivo GPS"}
            </DialogTitle>
            <DialogDescription>
              {selectedDevice 
                ? "Modifica la configuración del dispositivo GPS"
                : "Registra un nuevo dispositivo Queclink GL320M"
              }
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="imei">IMEI *</Label>
              <Input
                id="imei"
                placeholder="123456789012345"
                maxLength={15}
                value={formData.imei}
                onChange={(e) => setFormData({ ...formData, imei: e.target.value.replace(/\D/g, "") })}
              />
              <p className="text-xs text-muted-foreground">
                15 dígitos del identificador del dispositivo
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="device_name">Nombre</Label>
              <Input
                id="device_name"
                placeholder="GPS Moto 1"
                value={formData.device_name}
                onChange={(e) => setFormData({ ...formData, device_name: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="device_model">Modelo</Label>
              <Select 
                value={formData.device_model} 
                onValueChange={(val) => setFormData({ ...formData, device_model: val })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GL320M">Queclink GL320M</SelectItem>
                  <SelectItem value="GL300">Queclink GL300</SelectItem>
                  <SelectItem value="Other">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="race_id">Carrera</Label>
              <Select 
                value={formData.race_id || "none"} 
                onValueChange={(val) => setFormData({ ...formData, race_id: val === "none" ? "" : val, race_moto_id: "" })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona una carrera" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin carrera</SelectItem>
                  {races.map((race) => (
                    <SelectItem key={race.id} value={race.id}>
                      {race.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {formData.race_id && (
              <div className="grid gap-2">
                <Label htmlFor="race_moto_id">Moto asignada</Label>
                <Select 
                  value={formData.race_moto_id || "none"} 
                  onValueChange={(val) => setFormData({ ...formData, race_moto_id: val === "none" ? "" : val })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona una moto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin asignar</SelectItem>
                    {motos.map((moto) => (
                      <SelectItem key={moto.id} value={moto.id}>
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: moto.color }}
                          />
                          {moto.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="update_frequency">Frecuencia de actualización (seg)</Label>
              <Input
                id="update_frequency"
                type="number"
                min={5}
                max={300}
                value={formData.update_frequency}
                onChange={(e) => setFormData({ ...formData, update_frequency: parseInt(e.target.value) || 5 })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="notes">Notas</Label>
              <Textarea
                id="notes"
                placeholder="Notas adicionales..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="active">Dispositivo activo</Label>
              <Switch
                id="active"
                checked={formData.active}
                onCheckedChange={(checked) => setFormData({ ...formData, active: checked })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {selectedDevice ? "Guardar cambios" : "Crear dispositivo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar dispositivo?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el dispositivo "{selectedDevice?.device_name || selectedDevice?.imei}". 
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
    </div>
  );
}
