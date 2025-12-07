import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { Plus, Trash2, MapPin, Pencil, Map as MapIcon, Navigation, GripVertical } from "lucide-react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface TimingPoint {
  id: string;
  race_id: string;
  name: string;
  notes: string | null;
  latitude: number | null;
  longitude: number | null;
  point_order: number;
  created_at: string;
}

interface TimingPointsManagementProps {
  selectedRaceId: string;
}

interface SortableRowProps {
  point: TimingPoint;
  onEdit: (point: TimingPoint) => void;
  onDelete: (point: TimingPoint) => void;
}

function SortableRow({ point, onEdit, onDelete }: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: point.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <TableRow ref={setNodeRef} style={style}>
      <TableCell className="w-10">
        <Button
          variant="ghost"
          size="icon"
          className="cursor-grab active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </Button>
      </TableCell>
      <TableCell className="w-16 text-center font-medium">{point.point_order}</TableCell>
      <TableCell className="font-medium">{point.name}</TableCell>
      <TableCell className="text-muted-foreground text-sm">
        {point.notes || "-"}
      </TableCell>
      <TableCell className="text-sm">
        {point.latitude && point.longitude ? (
          <span className="text-muted-foreground">
            {point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}
          </span>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>
      <TableCell>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onEdit(point)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(point)}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function TimingPointsManagement({ selectedRaceId }: TimingPointsManagementProps) {
  const [timingPoints, setTimingPoints] = useState<TimingPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState<TimingPoint | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [showFormMap, setShowFormMap] = useState(false);

  const mapContainer = useRef<HTMLDivElement>(null);
  const formMapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const formMap = useRef<mapboxgl.Map | null>(null);
  const formMarker = useRef<mapboxgl.Marker | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);

  const [formData, setFormData] = useState({
    name: "",
    notes: "",
    latitude: "",
    longitude: "",
    point_order: "",
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    fetchMapboxToken();
  }, []);

  useEffect(() => {
    if (selectedRaceId) {
      fetchTimingPoints();
    }
  }, [selectedRaceId]);

  useEffect(() => {
    if (showMap && mapboxToken && mapContainer.current && !map.current) {
      initializeMap();
    }
  }, [showMap, mapboxToken]);

  useEffect(() => {
    if (map.current && timingPoints.length > 0) {
      updateMapMarkers();
    }
  }, [timingPoints, map.current]);

  useEffect(() => {
    if (showFormMap && mapboxToken && formMapContainer.current && !formMap.current) {
      initializeFormMap();
    }
    return () => {
      if (formMap.current && !showFormMap) {
        formMap.current.remove();
        formMap.current = null;
        formMarker.current = null;
      }
    };
  }, [showFormMap, mapboxToken]);

  useEffect(() => {
    if (!isDialogOpen) {
      setShowFormMap(false);
      if (formMap.current) {
        formMap.current.remove();
        formMap.current = null;
        formMarker.current = null;
      }
    }
  }, [isDialogOpen]);

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

  const fetchTimingPoints = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("timing_points")
        .select("*")
        .eq("race_id", selectedRaceId)
        .order("point_order", { ascending: true });

      if (error) throw error;
      setTimingPoints(data || []);
    } catch (error) {
      console.error("Error fetching timing points:", error);
      toast.error("Error al cargar los puntos de cronometraje");
    } finally {
      setLoading(false);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = timingPoints.findIndex((p) => p.id === active.id);
      const newIndex = timingPoints.findIndex((p) => p.id === over.id);

      const newOrder = arrayMove(timingPoints, oldIndex, newIndex);
      setTimingPoints(newOrder);

      // Update order in database
      try {
        const updates = newOrder.map((point, index) => ({
          id: point.id,
          race_id: point.race_id,
          name: point.name,
          notes: point.notes,
          latitude: point.latitude,
          longitude: point.longitude,
          point_order: index + 1,
        }));

        for (const update of updates) {
          const { error } = await supabase
            .from("timing_points")
            .update({ point_order: update.point_order })
            .eq("id", update.id);

          if (error) throw error;
        }

        toast.success("Orden actualizado");
      } catch (error) {
        console.error("Error updating order:", error);
        toast.error("Error al actualizar el orden");
        fetchTimingPoints();
      }
    }
  };

  const initializeMap = () => {
    if (!mapContainer.current || !mapboxToken) return;

    mapboxgl.accessToken = mapboxToken;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/outdoors-v12",
      center: [-3.7038, 40.4168],
      zoom: 10,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    map.current.on("load", () => {
      updateMapMarkers();
    });
  };

  const initializeFormMap = () => {
    if (!formMapContainer.current || !mapboxToken) return;

    mapboxgl.accessToken = mapboxToken;

    const initialLat = formData.latitude ? parseFloat(formData.latitude) : 40.4168;
    const initialLng = formData.longitude ? parseFloat(formData.longitude) : -3.7038;

    formMap.current = new mapboxgl.Map({
      container: formMapContainer.current,
      style: "mapbox://styles/mapbox/outdoors-v12",
      center: [initialLng, initialLat],
      zoom: formData.latitude && formData.longitude ? 14 : 6,
    });

    formMap.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    if (formData.latitude && formData.longitude) {
      formMarker.current = new mapboxgl.Marker({ color: "hsl(var(--primary))" })
        .setLngLat([initialLng, initialLat])
        .addTo(formMap.current);
    }

    formMap.current.on("click", (e) => {
      const { lng, lat } = e.lngLat;

      setFormData((prev) => ({
        ...prev,
        latitude: lat.toFixed(6),
        longitude: lng.toFixed(6),
      }));

      if (formMarker.current) {
        formMarker.current.setLngLat([lng, lat]);
      } else if (formMap.current) {
        formMarker.current = new mapboxgl.Marker({ color: "hsl(var(--primary))" })
          .setLngLat([lng, lat])
          .addTo(formMap.current);
      }
    });
  };

  const updateMapMarkers = () => {
    if (!map.current) return;

    markers.current.forEach((marker) => marker.remove());
    markers.current = [];

    const pointsWithCoords = timingPoints.filter(
      (tp) => tp.latitude !== null && tp.longitude !== null
    );

    pointsWithCoords.forEach((point, index) => {
      const el = document.createElement("div");
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
      el.textContent = (index + 1).toString();

      const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(`
        <div style="padding: 8px;">
          <strong>${point.point_order}. ${point.name}</strong>
          ${point.notes ? `<br><span style="color: #666; font-size: 12px;">${point.notes}</span>` : ""}
        </div>
      `);

      const marker = new mapboxgl.Marker(el)
        .setLngLat([point.longitude!, point.latitude!])
        .setPopup(popup)
        .addTo(map.current!);

      markers.current.push(marker);
    });

    if (pointsWithCoords.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      pointsWithCoords.forEach((p) => {
        bounds.extend([p.longitude!, p.latitude!]);
      });
      map.current.fitBounds(bounds, { padding: 50 });
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      notes: "",
      latitude: "",
      longitude: "",
      point_order: "",
    });
    setSelectedPoint(null);
    setIsEditing(false);
  };

  const handleOpenDialog = (point?: TimingPoint) => {
    if (point) {
      setFormData({
        name: point.name,
        notes: point.notes || "",
        latitude: point.latitude?.toString() || "",
        longitude: point.longitude?.toString() || "",
        point_order: point.point_order?.toString() || "",
      });
      setSelectedPoint(point);
      setIsEditing(true);
    } else {
      // Set next order for new point
      const maxOrder = timingPoints.length > 0 
        ? Math.max(...timingPoints.map(p => p.point_order)) 
        : 0;
      setFormData({
        name: "",
        notes: "",
        latitude: "",
        longitude: "",
        point_order: (maxOrder + 1).toString(),
      });
      setSelectedPoint(null);
      setIsEditing(false);
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const latitude = formData.latitude ? parseFloat(formData.latitude) : null;
    const longitude = formData.longitude ? parseFloat(formData.longitude) : null;
    const pointOrder = formData.point_order ? parseInt(formData.point_order) : 1;

    // Check for duplicate order (excluding current point if editing)
    const existingWithOrder = timingPoints.find(
      p => p.point_order === pointOrder && (!isEditing || p.id !== selectedPoint?.id)
    );
    
    if (existingWithOrder) {
      toast.error(`El orden ${pointOrder} ya está en uso por "${existingWithOrder.name}"`);
      return;
    }

    if (isEditing && selectedPoint) {
      const { error } = await supabase
        .from("timing_points")
        .update({
          name: formData.name,
          notes: formData.notes || null,
          latitude,
          longitude,
          point_order: pointOrder,
        })
        .eq("id", selectedPoint.id);

      if (error) {
        toast.error("Error al actualizar el punto de cronometraje");
        console.error(error);
        return;
      }
      toast.success("Punto de cronometraje actualizado");
    } else {
      const { error } = await supabase
        .from("timing_points")
        .insert({
          race_id: selectedRaceId,
          name: formData.name,
          notes: formData.notes || null,
          latitude,
          longitude,
          point_order: pointOrder,
        });

      if (error) {
        toast.error("Error al crear el punto de cronometraje");
        console.error(error);
        return;
      }
      toast.success("Punto de cronometraje creado");
    }

    setIsDialogOpen(false);
    resetForm();
    fetchTimingPoints();
  };

  const handleDeleteClick = (point: TimingPoint) => {
    setSelectedPoint(point);
    setIsDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!selectedPoint) return;

    const { error } = await supabase
      .from("timing_points")
      .delete()
      .eq("id", selectedPoint.id);

    if (error) {
      toast.error("Error al eliminar el punto de cronometraje");
      console.error(error);
      return;
    }

    toast.success("Punto de cronometraje eliminado");
    setIsDeleteDialogOpen(false);
    setSelectedPoint(null);
    fetchTimingPoints();
  };

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocalización no disponible");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude.toFixed(6);
        const lng = position.coords.longitude.toFixed(6);

        setFormData((prev) => ({
          ...prev,
          latitude: lat,
          longitude: lng,
        }));

        if (formMap.current) {
          formMap.current.flyTo({
            center: [parseFloat(lng), parseFloat(lat)],
            zoom: 15,
          });

          if (formMarker.current) {
            formMarker.current.setLngLat([parseFloat(lng), parseFloat(lat)]);
          } else {
            formMarker.current = new mapboxgl.Marker({ color: "hsl(var(--primary))" })
              .setLngLat([parseFloat(lng), parseFloat(lat)])
              .addTo(formMap.current);
          }
        }

        toast.success("Ubicación obtenida");
      },
      (error) => {
        toast.error("Error al obtener ubicación");
        console.error(error);
      }
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Puntos de Cronometraje
        </CardTitle>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowMap(!showMap)}
          >
            <MapIcon className="h-4 w-4 mr-1" />
            {showMap ? "Ocultar Mapa" : "Ver Mapa"}
          </Button>
          <Button size="sm" onClick={() => handleOpenDialog()}>
            <Plus className="h-4 w-4 mr-1" />
            Añadir Punto
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {showMap && mapboxToken && (
          <div
            ref={mapContainer}
            className="w-full h-64 rounded-lg mb-4 border"
          />
        )}

        {loading ? (
          <p className="text-muted-foreground text-center py-4">Cargando...</p>
        ) : timingPoints.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">
            No hay puntos de cronometraje definidos
          </p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead className="w-16 text-center">Orden</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Notas</TableHead>
                  <TableHead>Coordenadas</TableHead>
                  <TableHead className="w-24">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <SortableContext
                  items={timingPoints.map((p) => p.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {timingPoints.map((point) => (
                    <SortableRow
                      key={point.id}
                      point={point}
                      onEdit={handleOpenDialog}
                      onDelete={handleDeleteClick}
                    />
                  ))}
                </SortableContext>
              </TableBody>
            </Table>
          </DndContext>
        )}

        {/* Add/Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>
                {isEditing ? "Editar" : "Nuevo"} Punto de Cronometraje
              </DialogTitle>
              <DialogDescription>
                Define un lugar físico donde se registrarán tiempos
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-4 gap-4">
                <div className="col-span-3 space-y-2">
                  <Label htmlFor="name">Nombre *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="Ej: Plaza Mayor, Meta, Km 10..."
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="point_order">Orden *</Label>
                  <Input
                    id="point_order"
                    type="number"
                    min="1"
                    value={formData.point_order}
                    onChange={(e) =>
                      setFormData({ ...formData, point_order: e.target.value })
                    }
                    placeholder="1"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notas</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                  placeholder="Descripción o indicaciones adicionales"
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label>Ubicación</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={getCurrentLocation}
                    >
                      <Navigation className="h-4 w-4 mr-1" />
                      Mi ubicación
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowFormMap(!showFormMap)}
                    >
                      <MapIcon className="h-4 w-4 mr-1" />
                      {showFormMap ? "Ocultar" : "Mapa"}
                    </Button>
                  </div>
                </div>

                {showFormMap && mapboxToken && (
                  <div
                    ref={formMapContainer}
                    className="w-full h-48 rounded-lg border"
                  />
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="latitude">Latitud</Label>
                    <Input
                      id="latitude"
                      type="number"
                      step="any"
                      value={formData.latitude}
                      onChange={(e) =>
                        setFormData({ ...formData, latitude: e.target.value })
                      }
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
                      onChange={(e) =>
                        setFormData({ ...formData, longitude: e.target.value })
                      }
                      placeholder="-3.7038"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit">
                  {isEditing ? "Actualizar" : "Crear"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Dialog */}
        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar punto de cronometraje?</AlertDialogTitle>
              <AlertDialogDescription>
                Se eliminará "{selectedPoint?.name}". Esta acción no se puede deshacer.
                Los checkpoints y lecturas asociados perderán la referencia a este punto.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
