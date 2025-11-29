import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Trash2, MapPin, Pencil, Map, Navigation } from "lucide-react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

interface Checkpoint {
  id: string;
  name: string;
  lugar: string | null;
  checkpoint_order: number;
  distance_km: number;
  race_id: string;
  race_distance_id: string | null;
  latitude: number | null;
  longitude: number | null;
}

interface CheckpointsManagementProps {
  selectedRaceId: string;
  selectedDistanceId: string;
}

export function CheckpointsManagement({ selectedRaceId, selectedDistanceId }: CheckpointsManagementProps) {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<Checkpoint | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(false);
  
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);
  
  const [formData, setFormData] = useState({
    name: "",
    lugar: "",
    checkpoint_order: 1,
    distance_km: 0,
    latitude: "",
    longitude: "",
  });

  useEffect(() => {
    fetchMapboxToken();
  }, []);

  useEffect(() => {
    if (selectedDistanceId) {
      fetchCheckpoints();
    }
  }, [selectedDistanceId]);

  useEffect(() => {
    if (showMap && mapboxToken && mapContainer.current && !map.current) {
      initializeMap();
    }
  }, [showMap, mapboxToken]);

  useEffect(() => {
    if (map.current && checkpoints.length > 0) {
      updateMapMarkers();
    }
  }, [checkpoints, map.current]);

  const fetchMapboxToken = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("get-mapbox-token");
      if (error) throw error;
      if (data?.token) {
        setMapboxToken(data.token);
      }
    } catch (error) {
      console.error("Error fetching Mapbox token:", error);
    }
  };

  const initializeMap = () => {
    if (!mapContainer.current || !mapboxToken) return;

    mapboxgl.accessToken = mapboxToken;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/outdoors-v12",
      center: [-3.7038, 40.4168], // Madrid por defecto
      zoom: 10,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    map.current.on("load", () => {
      updateMapMarkers();
    });
  };

  const updateMapMarkers = () => {
    if (!map.current) return;

    // Limpiar marcadores existentes
    markers.current.forEach((marker) => marker.remove());
    markers.current = [];

    const checkpointsWithCoords = checkpoints.filter(
      (cp) => cp.latitude !== null && cp.longitude !== null
    );

    if (checkpointsWithCoords.length === 0) return;

    // Añadir marcadores
    checkpointsWithCoords.forEach((checkpoint) => {
      const el = document.createElement("div");
      el.className = "checkpoint-marker";
      el.style.cssText = `
        width: 30px;
        height: 30px;
        background: hsl(var(--primary));
        border: 3px solid white;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: bold;
        font-size: 12px;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        cursor: pointer;
      `;
      el.innerText = checkpoint.checkpoint_order.toString();

      const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(`
        <div style="padding: 8px;">
          <strong>${checkpoint.name}</strong>
          ${checkpoint.lugar ? `<br><span style="color: #666;">${checkpoint.lugar}</span>` : ""}
          <br><span style="font-size: 12px;">Km ${checkpoint.distance_km}</span>
        </div>
      `);

      const marker = new mapboxgl.Marker(el)
        .setLngLat([checkpoint.longitude!, checkpoint.latitude!])
        .setPopup(popup)
        .addTo(map.current!);

      markers.current.push(marker);
    });

    // Dibujar línea entre checkpoints
    if (checkpointsWithCoords.length > 1) {
      const coordinates = checkpointsWithCoords
        .sort((a, b) => a.checkpoint_order - b.checkpoint_order)
        .map((cp) => [cp.longitude!, cp.latitude!]);

      if (map.current.getSource("route")) {
        (map.current.getSource("route") as mapboxgl.GeoJSONSource).setData({
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates,
          },
        });
      } else {
        map.current.addSource("route", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates,
            },
          },
        });

        map.current.addLayer({
          id: "route",
          type: "line",
          source: "route",
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": "hsl(var(--primary))",
            "line-width": 3,
            "line-dasharray": [2, 2],
          },
        });
      }
    }

    // Ajustar vista a los checkpoints
    const bounds = new mapboxgl.LngLatBounds();
    checkpointsWithCoords.forEach((cp) => {
      bounds.extend([cp.longitude!, cp.latitude!]);
    });
    map.current.fitBounds(bounds, { padding: 50 });
  };

  const fetchCheckpoints = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("race_checkpoints")
      .select("*")
      .eq("race_distance_id", selectedDistanceId)
      .order("checkpoint_order");

    if (error) {
      toast.error("Error al cargar los puntos de control");
      console.error(error);
    } else {
      setCheckpoints(data || []);
    }
    setLoading(false);
  };

  const resetForm = () => {
    setFormData({
      name: "",
      lugar: "",
      checkpoint_order: checkpoints.length + 1,
      distance_km: 0,
      latitude: "",
      longitude: "",
    });
    setSelectedCheckpoint(null);
    setIsEditing(false);
  };

  const handleOpenDialog = (checkpoint?: Checkpoint) => {
    if (checkpoint) {
      setFormData({
        name: checkpoint.name,
        lugar: checkpoint.lugar || "",
        checkpoint_order: checkpoint.checkpoint_order,
        distance_km: checkpoint.distance_km,
        latitude: checkpoint.latitude?.toString() || "",
        longitude: checkpoint.longitude?.toString() || "",
      });
      setSelectedCheckpoint(checkpoint);
      setIsEditing(true);
    } else {
      resetForm();
      setFormData((prev) => ({
        ...prev,
        checkpoint_order: checkpoints.length + 1,
      }));
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const latitude = formData.latitude ? parseFloat(formData.latitude) : null;
    const longitude = formData.longitude ? parseFloat(formData.longitude) : null;

    if (isEditing && selectedCheckpoint) {
      const { error } = await supabase
        .from("race_checkpoints")
        .update({
          name: formData.name,
          lugar: formData.lugar || null,
          checkpoint_order: formData.checkpoint_order,
          distance_km: formData.distance_km,
          latitude,
          longitude,
        })
        .eq("id", selectedCheckpoint.id);

      if (error) {
        toast.error("Error al actualizar el punto de control");
        console.error(error);
        return;
      }
      toast.success("Punto de control actualizado");
    } else {
      const { error } = await supabase.from("race_checkpoints").insert({
        race_id: selectedRaceId,
        race_distance_id: selectedDistanceId,
        name: formData.name,
        lugar: formData.lugar || null,
        checkpoint_order: formData.checkpoint_order,
        distance_km: formData.distance_km,
        latitude,
        longitude,
      });

      if (error) {
        toast.error("Error al crear el punto de control");
        console.error(error);
        return;
      }
      toast.success("Punto de control creado");
    }

    setIsDialogOpen(false);
    resetForm();
    fetchCheckpoints();
  };

  const handleDeleteClick = (checkpoint: Checkpoint) => {
    setSelectedCheckpoint(checkpoint);
    setIsDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!selectedCheckpoint) return;

    const { error } = await supabase
      .from("race_checkpoints")
      .delete()
      .eq("id", selectedCheckpoint.id);

    if (error) {
      toast.error("Error al eliminar el punto de control");
      console.error(error);
      return;
    }

    toast.success("Punto de control eliminado");
    setIsDeleteDialogOpen(false);
    setSelectedCheckpoint(null);
    fetchCheckpoints();
  };

  if (!selectedRaceId) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-muted-foreground">
            Selecciona una carrera para gestionar sus puntos de control
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!selectedDistanceId) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-muted-foreground">
            Selecciona una distancia para gestionar sus puntos de control
          </p>
        </CardContent>
      </Card>
    );
  }

  const checkpointsWithCoords = checkpoints.filter(
    (cp) => cp.latitude !== null && cp.longitude !== null
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Puntos de Control
          </CardTitle>
          <div className="flex gap-2">
            {mapboxToken && checkpointsWithCoords.length > 0 && (
              <Button
                variant="outline"
                onClick={() => setShowMap(!showMap)}
              >
                <Map className="mr-2 h-4 w-4" />
                {showMap ? "Ocultar Mapa" : "Ver Mapa"}
              </Button>
            )}
            <Dialog
              open={isDialogOpen}
              onOpenChange={(open) => {
                setIsDialogOpen(open);
                if (!open) resetForm();
              }}
            >
              <DialogTrigger asChild>
                <Button onClick={() => handleOpenDialog()}>
                  <Plus className="mr-2 h-4 w-4" />
                  Añadir Punto de Control
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>
                    {isEditing ? "Editar Punto de Control" : "Crear Punto de Control"}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="name">Nombre</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Ej: Avituallamiento 1"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="lugar">Lugar</Label>
                    <Input
                      id="lugar"
                      value={formData.lugar}
                      onChange={(e) => setFormData({ ...formData, lugar: e.target.value })}
                      placeholder="Ej: Plaza Mayor"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="order">Orden</Label>
                      <Input
                        id="order"
                        type="number"
                        min="1"
                        value={formData.checkpoint_order}
                        onChange={(e) =>
                          setFormData({ ...formData, checkpoint_order: parseInt(e.target.value) || 1 })
                        }
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="distance">Distancia (km)</Label>
                      <Input
                        id="distance"
                        type="number"
                        step="0.1"
                        min="0"
                        value={formData.distance_km}
                        onChange={(e) =>
                          setFormData({ ...formData, distance_km: parseFloat(e.target.value) || 0 })
                        }
                        required
                      />
                    </div>
                  </div>
                  <div className="border-t pt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Navigation className="h-4 w-4 text-muted-foreground" />
                      <Label className="text-sm font-medium">Coordenadas GPS (opcional)</Label>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="latitude">Latitud</Label>
                        <Input
                          id="latitude"
                          type="number"
                          step="any"
                          value={formData.latitude}
                          onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                          placeholder="40.4168"
                        />
                      </div>
                      <div>
                        <Label htmlFor="longitude">Longitud</Label>
                        <Input
                          id="longitude"
                          type="number"
                          step="any"
                          value={formData.longitude}
                          onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                          placeholder="-3.7038"
                        />
                      </div>
                    </div>
                  </div>
                  <Button type="submit" className="w-full">
                    {isEditing ? "Guardar Cambios" : "Crear Punto de Control"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground py-4">Cargando...</p>
          ) : checkpoints.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">
              No hay puntos de control configurados. Los puntos de control "Salida" y "Meta" se crean
              automáticamente al añadir una distancia.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Orden</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Lugar</TableHead>
                  <TableHead className="text-right">Km</TableHead>
                  <TableHead className="text-center">GPS</TableHead>
                  <TableHead className="w-24 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {checkpoints.map((checkpoint) => (
                  <TableRow key={checkpoint.id}>
                    <TableCell>
                      <Badge variant="outline">{checkpoint.checkpoint_order}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{checkpoint.name}</TableCell>
                    <TableCell className="text-muted-foreground">{checkpoint.lugar || "-"}</TableCell>
                    <TableCell className="text-right">{checkpoint.distance_km}</TableCell>
                    <TableCell className="text-center">
                      {checkpoint.latitude && checkpoint.longitude ? (
                        <Badge variant="secondary" className="text-xs">
                          <Navigation className="h-3 w-3 mr-1" />
                          {checkpoint.latitude.toFixed(4)}, {checkpoint.longitude.toFixed(4)}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleOpenDialog(checkpoint)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="icon"
                          onClick={() => handleDeleteClick(checkpoint)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {showMap && mapboxToken && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Map className="h-5 w-5" />
              Mapa de Puntos de Control
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div ref={mapContainer} className="w-full h-[400px] rounded-lg" />
          </CardContent>
        </Card>
      )}

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar punto de control?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará el punto de control "{selectedCheckpoint?.name}". Esta acción no se
              puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
