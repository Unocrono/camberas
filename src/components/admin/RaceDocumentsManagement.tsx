import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  AlertTriangle,
  Download,
  FolderCheck,
  ListChecks,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";

// El bucket race-documents es PRIVADO (pólizas, permisos, posibles datos
// personales): descarga SIEMPRE por createSignedUrl, nunca getPublicUrl.

// Tablas nuevas aún sin tipos generados
const db = supabase as any;

interface Requirement {
  id: string;
  race_id: string;
  category: string;
  title: string;
  description: string | null;
  days_before_race: number;
  is_required: boolean;
  display_order: number;
}

interface RaceDocument {
  id: string;
  race_id: string;
  requirement_id: string | null;
  category: string;
  title: string;
  file_path: string | null;
  file_name: string | null;
  status: string;
  issue_date: string | null;
  expiry_date: string | null;
  notes: string | null;
}

interface RaceDocumentsManagementProps {
  raceId: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  permiso_municipal: "Permiso municipal",
  juegos_espectaculos: "Juegos y Espectáculos",
  etraza_dgt: "ETRAZA / DGT",
  seguro_rc: "Seguro RC",
  seguro_accidentes: "Seguro accidentes",
  plan_seguridad: "Plan de seguridad",
  medioambiental: "Medioambiental",
  federacion: "Federación",
  proteccion_datos: "Protección de datos",
  otros: "Otros",
};

const STATUS_LABELS: Record<string, string> = {
  pendiente: "Pendiente",
  subido: "Subido",
  en_revision: "En revisión",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
  caducado: "Caducado",
};

const emptyForm = {
  title: "",
  category: "otros",
  requirement_id: "",
  status: "pendiente",
  issue_date: "",
  expiry_date: "",
  notes: "",
};

/** caducado se deriva en cliente: la BD lo persiste en la fase de cron */
const effectiveStatus = (doc: RaceDocument): string => {
  if (doc.expiry_date && doc.expiry_date < new Date().toISOString().slice(0, 10)) {
    return "caducado";
  }
  return doc.status;
};

const statusBadge = (status: string) => {
  switch (status) {
    case "aprobado":
      return <Badge className="bg-green-600 hover:bg-green-600">{STATUS_LABELS[status]}</Badge>;
    case "en_revision":
      return <Badge className="bg-amber-500 hover:bg-amber-500">{STATUS_LABELS[status]}</Badge>;
    case "subido":
      return <Badge variant="outline">{STATUS_LABELS[status]}</Badge>;
    case "rechazado":
    case "caducado":
      return <Badge variant="destructive">{STATUS_LABELS[status]}</Badge>;
    default:
      return <Badge variant="secondary">{STATUS_LABELS[status] ?? status}</Badge>;
  }
};

export function RaceDocumentsManagement({ raceId }: RaceDocumentsManagementProps) {
  const { toast } = useToast();
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [documents, setDocuments] = useState<RaceDocument[]>([]);
  const [raceDate, setRaceDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RaceDocument | null>(null);
  const [deleting, setDeleting] = useState<RaceDocument | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (raceId) fetchAll();
  }, [raceId]);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [reqRes, docRes, raceRes] = await Promise.all([
        db
          .from("race_document_requirements")
          .select("*")
          .eq("race_id", raceId)
          .order("display_order"),
        db
          .from("race_documents")
          .select("*")
          .eq("race_id", raceId)
          .order("created_at"),
        supabase.from("races").select("date").eq("id", raceId).single(),
      ]);
      if (reqRes.error) throw reqRes.error;
      if (docRes.error) throw docRes.error;
      setRequirements(reqRes.data || []);
      setDocuments(docRes.data || []);
      setRaceDate(raceRes.data?.date ?? null);
    } catch (error: any) {
      console.error("Error fetching documents:", error);
      toast({
        title: "Error",
        description: "No se pudo cargar la documentación",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSeed = async () => {
    try {
      setSeeding(true);
      const { data, error } = await db.rpc("seed_requisitos_documentales", {
        p_race_id: raceId,
      });
      if (error) throw error;
      toast({
        title: "Checklist cargado",
        description:
          data > 0
            ? `${data} requisitos añadidos`
            : "El checklist ya estaba cargado",
      });
      fetchAll();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSeeding(false);
    }
  };

  const docsFor = (requirementId: string) =>
    documents.filter((d) => d.requirement_id === requirementId);

  const orphanDocs = documents.filter((d) => !d.requirement_id);

  /** fecha límite del requisito contra la fecha real de la carrera */
  const deadlineFor = (req: Requirement): Date | null => {
    if (!raceDate) return null;
    const d = new Date(raceDate);
    d.setDate(d.getDate() - req.days_before_race);
    return d;
  };

  const isFulfilled = (req: Requirement) =>
    docsFor(req.id).some((d) => effectiveStatus(d) === "aprobado");

  const requiredReqs = requirements.filter((r) => r.is_required);
  const fulfilledCount = requiredReqs.filter(isFulfilled).length;
  const progressPct =
    requiredReqs.length > 0 ? Math.round((fulfilledCount / requiredReqs.length) * 100) : 0;

  const openCreate = (requirement?: Requirement) => {
    setEditing(null);
    setFile(null);
    setFormData({
      ...emptyForm,
      requirement_id: requirement?.id ?? "",
      category: requirement?.category ?? "otros",
      title: requirement ? requirement.title : "",
    });
    setDialogOpen(true);
  };

  const openEdit = (doc: RaceDocument) => {
    setEditing(doc);
    setFile(null);
    setFormData({
      title: doc.title,
      category: doc.category,
      requirement_id: doc.requirement_id ?? "",
      status: doc.status,
      issue_date: doc.issue_date ?? "",
      expiry_date: doc.expiry_date ?? "",
      notes: doc.notes ?? "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.title.trim()) {
      toast({
        title: "Faltan datos",
        description: "El documento necesita un título",
        variant: "destructive",
      });
      return;
    }
    try {
      setSaving(true);

      let filePath = editing?.file_path ?? null;
      let fileName = editing?.file_name ?? null;
      let mimeType: string | null = null;
      let sizeBytes: number | null = null;

      if (file) {
        const path = `${raceId}/${crypto.randomUUID()}-${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("race-documents")
          .upload(path, file, { cacheControl: "3600", upsert: false });
        if (uploadError) throw uploadError;
        filePath = path;
        fileName = file.name;
        mimeType = file.type || null;
        sizeBytes = file.size;
      }

      const { data: userData } = await supabase.auth.getUser();
      const row: Record<string, unknown> = {
        race_id: raceId,
        requirement_id: formData.requirement_id || null,
        category: formData.category,
        title: formData.title.trim(),
        file_path: filePath,
        file_name: fileName,
        status: file && formData.status === "pendiente" ? "subido" : formData.status,
        issue_date: formData.issue_date || null,
        expiry_date: formData.expiry_date || null,
        notes: formData.notes.trim() || null,
        uploaded_by: userData.user?.id ?? null,
      };
      if (mimeType) row.mime_type = mimeType;
      if (sizeBytes != null) row.size_bytes = sizeBytes;

      const { error } = editing
        ? await db.from("race_documents").update(row).eq("id", editing.id)
        : await db.from("race_documents").insert(row);
      if (error) throw error;

      toast({
        title: editing ? "Documento actualizado" : "Documento guardado",
        description: formData.title,
      });
      setDialogOpen(false);
      fetchAll();
    } catch (error: any) {
      toast({ title: "Error al guardar", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async (doc: RaceDocument) => {
    if (!doc.file_path) return;
    const { data, error } = await supabase.storage
      .from("race-documents")
      .createSignedUrl(doc.file_path, 60);
    if (error || !data?.signedUrl) {
      toast({
        title: "Error",
        description: "No se pudo generar el enlace de descarga",
        variant: "destructive",
      });
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      if (deleting.file_path) {
        await supabase.storage.from("race-documents").remove([deleting.file_path]);
      }
      const { error } = await db.from("race_documents").delete().eq("id", deleting.id);
      if (error) throw error;
      toast({ title: "Documento eliminado", description: deleting.title });
      fetchAll();
    } catch (error: any) {
      toast({ title: "Error al borrar", description: error.message, variant: "destructive" });
    }
    setDeleting(null);
  };

  const fmtDate = (d: Date | string | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("es-ES");
  };

  const renderDocRow = (doc: RaceDocument) => (
    <div
      key={doc.id}
      className="flex items-center justify-between gap-2 py-2 border-t first:border-t-0"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{doc.title}</p>
        <p className="text-xs text-muted-foreground">
          {doc.file_name ?? "Sin archivo"}
          {doc.expiry_date && ` · caduca ${fmtDate(doc.expiry_date)}`}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {statusBadge(effectiveStatus(doc))}
        {doc.file_path && (
          <Button variant="ghost" size="icon" onClick={() => handleDownload(doc)}>
            <Download className="h-4 w-4" />
          </Button>
        )}
        <Button variant="ghost" size="icon" onClick={() => openEdit(doc)}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => setDeleting(doc)}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold">Documentación de la carrera</h2>
          <p className="text-muted-foreground">
            Permisos, seguros y autorizaciones. Los archivos se guardan en un
            almacén privado: solo tú y el administrador podéis verlos.
          </p>
        </div>
        <div className="flex gap-2">
          {requirements.length === 0 && (
            <Button onClick={handleSeed} disabled={seeding}>
              <ListChecks className="h-4 w-4 mr-2" />
              {seeding ? "Cargando…" : "Cargar checklist estándar"}
            </Button>
          )}
          <Button variant="outline" onClick={() => openCreate()}>
            <Plus className="h-4 w-4 mr-2" />
            Otro documento
          </Button>
        </div>
      </div>

      {requiredReqs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <FolderCheck className="h-5 w-5" />
              Progreso: {fulfilledCount} de {requiredReqs.length} obligatorios aprobados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={progressPct} />
          </CardContent>
        </Card>
      )}

      {requirements.map((req) => {
        const deadline = deadlineFor(req);
        const fulfilled = isFulfilled(req);
        const urgent =
          !fulfilled &&
          deadline != null &&
          deadline.getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000;
        const reqDocs = docsFor(req.id);
        return (
          <Card key={req.id} className={urgent ? "border-amber-500" : undefined}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-base flex items-center gap-2">
                  {req.title}
                  {!req.is_required && (
                    <Badge variant="outline" className="font-normal">
                      Opcional
                    </Badge>
                  )}
                  {urgent && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    Límite: {fmtDate(deadline)}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => openCreate(req)}>
                    <Upload className="h-4 w-4 mr-1" />
                    Subir
                  </Button>
                </div>
              </div>
              {req.description && (
                <CardDescription>{req.description}</CardDescription>
              )}
            </CardHeader>
            {reqDocs.length > 0 && <CardContent>{reqDocs.map(renderDocRow)}</CardContent>}
          </Card>
        );
      })}

      {orphanDocs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Otros documentos</CardTitle>
          </CardHeader>
          <CardContent>{orphanDocs.map(renderDocRow)}</CardContent>
        </Card>
      )}

      {requirements.length === 0 && documents.length === 0 && (
        <Card>
          <CardContent className="text-center py-8 text-muted-foreground">
            <FolderCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>
              Aún no hay documentación. Carga el checklist estándar para empezar
              con los requisitos típicos de una carrera de trail.
            </p>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar documento" : "Nuevo documento"}</DialogTitle>
            <DialogDescription>
              El archivo queda en el almacén privado de la carrera.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="doc-title">Título *</Label>
              <Input
                id="doc-title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Permiso Ayuntamiento de Vega de Liébana"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Categoría</Label>
                <Select
                  value={formData.category}
                  onValueChange={(v) => setFormData({ ...formData, category: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Estado</Label>
                <Select
                  value={formData.status}
                  onValueChange={(v) => setFormData({ ...formData, status: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Requisito del checklist</Label>
              <Select
                value={formData.requirement_id || "none"}
                onValueChange={(v) =>
                  setFormData({ ...formData, requirement_id: v === "none" ? "" : v })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin requisito (otros)</SelectItem>
                  {requirements.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="doc-issue">Fecha de emisión</Label>
                <Input
                  id="doc-issue"
                  type="date"
                  value={formData.issue_date}
                  onChange={(e) => setFormData({ ...formData, issue_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="doc-expiry">Fecha de caducidad</Label>
                <Input
                  id="doc-expiry"
                  type="date"
                  value={formData.expiry_date}
                  onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="doc-file">
                Archivo {editing?.file_name ? `(actual: ${editing.file_name})` : ""}
              </Label>
              <Input
                id="doc-file"
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="doc-notes">Notas</Label>
              <Textarea
                id="doc-notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Nº de expediente, contacto en el organismo…"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar "{deleting?.title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borrará también el archivo del almacén. Esta acción no se puede
              deshacer.
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
    </div>
  );
}
